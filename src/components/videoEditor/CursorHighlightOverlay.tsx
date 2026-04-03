import React, { useMemo } from 'react';
import {
    createCursorHighlightBackdropSprite,
    createCursorHighlightReplacementCursorSprite,
    getEffectiveCursorHighlightSettings,
    resolveCursorHighlightPlaybackConfig,
} from '../../videoEditor/cursorStyling';
import { CursorHighlightSettings, normalizeCursorHighlightSettings } from '../../videoEditor/types';
import { getPreviewCursorState, mapCursorStateToViewport } from '../../videoEditor/utils';

interface CursorHighlightOverlayProps {
    cursorData: any[] | undefined;
    displayTime: number;
    cropRect?: { x: number; y: number; width: number; height: number } | null;
    settings: CursorHighlightSettings;
    frameWidth: number;
    frameHeight: number;
    visualFilter?: string;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const normalizeHex = (value: string) => {
    const trimmed = value.trim();
    const hex = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
    if (hex.length === 3) {
        return `#${hex.split('').map((char) => `${char}${char}`).join('')}`;
    }
    if (hex.length === 6) {
        return `#${hex}`;
    }
    return '#f59e0b';
};
const hexToRgba = (value: string, alpha: number) => {
    const hex = normalizeHex(value).slice(1);
    const r = Number.parseInt(hex.slice(0, 2), 16);
    const g = Number.parseInt(hex.slice(2, 4), 16);
    const b = Number.parseInt(hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
};
const joinFilters = (...parts: Array<string | null | undefined>) => parts.filter(Boolean).join(' ');

export const CursorHighlightOverlay: React.FC<CursorHighlightOverlayProps> = ({
    cursorData,
    displayTime,
    cropRect,
    settings,
    frameWidth,
    frameHeight,
    visualFilter,
}) => {
    const normalizedSettings = useMemo(
        () => normalizeCursorHighlightSettings(settings),
        [settings],
    );
    const playbackConfig = useMemo(
        () => resolveCursorHighlightPlaybackConfig(cursorData),
        [cursorData],
    );
    const nativeCursorSuppressed = playbackConfig.nativeCursorSuppressed;
    const effectiveSettings = useMemo(
        () => getEffectiveCursorHighlightSettings(normalizedSettings, nativeCursorSuppressed),
        [nativeCursorSuppressed, normalizedSettings],
    );
    const previewTrackMode: 'smooth' | 'direct' = playbackConfig.trackMode === 'direct' ? 'direct' : 'smooth';
    const sampledDisplayTime = Math.max(0, displayTime + playbackConfig.sampleTimeOffsetSec);
    const cursorState = useMemo(
        () => mapCursorStateToViewport(getPreviewCursorState(cursorData, sampledDisplayTime, previewTrackMode), cropRect),
        [cropRect, cursorData, previewTrackMode, sampledDisplayTime],
    );
    const sprite = useMemo(
        () => (
            frameWidth > 0 && frameHeight > 0
                ? createCursorHighlightBackdropSprite(effectiveSettings, { width: frameWidth, height: frameHeight })
                : null
        ),
        [effectiveSettings, frameHeight, frameWidth],
    );
    const replacementCursor = useMemo(
        (): any => null, // Explicitly disabled to fix double-cursor issue when native pointer capture fails
        [],
    );

    if (
        !normalizedSettings.enabled
        || !cursorState
        || !sprite
        || frameWidth <= 0
        || frameHeight <= 0
    ) {
        return null;
    }

    const glowOpacity = nativeCursorSuppressed
        ? Math.min(0.92, effectiveSettings.opacity + 0.12)
        : effectiveSettings.opacity;
    const glowFilter = joinFilters(
        visualFilter,
        `drop-shadow(0 0 ${(Math.max(sprite.width, sprite.height) * 0.1).toFixed(1)}px ${hexToRgba(effectiveSettings.color, nativeCursorSuppressed ? 0.24 : 0.18)})`,
    );

    return (
        <>
            <img
                aria-hidden="true"
                alt=""
                src={sprite.file}
                style={{
                    position: 'absolute',
                    left: `${cursorState.x}%`,
                    top: `${cursorState.y}%`,
                    width: sprite.width,
                    height: sprite.height,
                    transform: `translate(${-sprite.hotspotX}px, ${-sprite.hotspotY}px)`,
                    transformOrigin: `${sprite.hotspotX}px ${sprite.hotspotY}px`,
                    pointerEvents: 'none',
                    zIndex: 12,
                    opacity: glowOpacity,
                    mixBlendMode: 'screen',
                    filter: glowFilter || undefined,
                }}
            />
            {replacementCursor && (
                <img
                    aria-hidden="true"
                    alt=""
                    src={replacementCursor.file}
                    style={{
                        position: 'absolute',
                        left: `${cursorState.x}%`,
                        top: `${cursorState.y}%`,
                        width: replacementCursor.width,
                        height: replacementCursor.height,
                        transform: `translate(${-replacementCursor.hotspotX}px, ${-replacementCursor.hotspotY}px)`,
                        transformOrigin: `${replacementCursor.hotspotX}px ${replacementCursor.hotspotY}px`,
                        pointerEvents: 'none',
                        zIndex: 13,
                        filter: joinFilters(
                            visualFilter,
                            'drop-shadow(0 2px 8px rgba(15,23,42,0.28))',
                        ) || undefined,
                    }}
                />
            )}
        </>
    );
};
