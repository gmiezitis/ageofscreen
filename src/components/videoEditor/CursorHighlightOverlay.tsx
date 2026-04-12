import React, { useMemo } from 'react';
import {
    createCursorHighlightBackdropSprite,
    getEffectiveCursorHighlightSettings,
    getCursorHighlightOverlayOpacity,
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
        () => resolveCursorHighlightPlaybackConfig(cursorData, normalizedSettings),
        [cursorData, normalizedSettings],
    );
    const nativeCursorSuppressed = playbackConfig.nativeCursorSuppressed;
    const effectiveSettings = useMemo(
        () => getEffectiveCursorHighlightSettings(normalizedSettings, nativeCursorSuppressed),
        [nativeCursorSuppressed, normalizedSettings],
    );
    const sampledDisplayTime = Math.max(0, displayTime + playbackConfig.sampleTimeOffsetSec);
    const cursorState = useMemo(
        () => mapCursorStateToViewport(getPreviewCursorState(cursorData, sampledDisplayTime, playbackConfig.trackMode), cropRect),
        [cropRect, cursorData, playbackConfig.trackMode, sampledDisplayTime],
    );
    const sprite = useMemo(
        () => (
            frameWidth > 0 && frameHeight > 0
                ? createCursorHighlightBackdropSprite(effectiveSettings, { width: frameWidth, height: frameHeight })
                : null
        ),
        [effectiveSettings, frameHeight, frameWidth],
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

    const overlayOpacity = getCursorHighlightOverlayOpacity(effectiveSettings, nativeCursorSuppressed);

    return (
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
                zIndex: 11,
                opacity: overlayOpacity,
                filter: visualFilter || undefined,
            }}
        />
    );
};
