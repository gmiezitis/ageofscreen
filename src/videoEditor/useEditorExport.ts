import { useCallback } from 'react';
import { ExportQuality, Segment, SmartEffect, TransitionType } from './types';
import { fromMediaFileUrl } from '../shared/mediaPaths';
import { CanvasRenderer } from '../services/canvasRenderer';
import type { AnnotationObject } from '../types';
import type { EntitlementState } from '../shared/licensing';
import { buildCursorTimedTrack, FOLLOW_CURSOR_TRACK_MAX_POINTS } from './cursorStyling';
import { DEFAULT_ZOOM_INTENSITY, getEffectIntensity } from './effectIntensity';
import { getTimelineDuration as getTimelineDurationFromItems } from './timelineClips';
import {
    applyKeepRangesToSegments,
    AUTO_POLISH_BACKGROUND,
    AUTO_POLISH_COLOR_GRADE,
    AUTO_POLISH_PADDING,
    buildAutoPolishFocusEffects,
    getBaseTimelineSegments,
    getTimelineDurationFromSegments,
    stripAutoPolishEffects,
} from './autoPolishPlan';

type AutoPolishPlanResponse = {
    success?: boolean;
    beforeDuration?: number;
    afterDuration?: number;
    trimmedSeconds?: number;
    appliedChanges?: string[];
    focusEffectCount?: number;
    usedVoiceEnhancement?: boolean;
    usedFallbackPreview?: boolean;
    hasAudio?: boolean;
    segments?: Array<{ startSeconds: number; endSeconds: number }>;
    error?: string;
};

const DEFAULT_ENTITLEMENT_STATE: EntitlementState = {
    tier: 'free',
    maxRecordingSeconds: 180,
    watermarkEnabled: true,
    canUseAutoPolish: false,
    canUseStudioVoice: false,
    purchaseAvailable: false,
    provider: 'manual',
    lastSyncAt: null,
};

/**
 * Handles video export and auto-polish operations.
 * Extracted from useVideoEditorHandlers to keep each module focused.
 */
export function useEditorExport(
    state: any,
    showNotification: (type: string, title: string, message: string) => void,
    saveHistory: (stateOverride?: any) => void,
) {
    const { mediaPath, segments, imageClips, duration, smartEffects, overlayImages, textOverlays, annotationOverlays, annotationCanvasSize, recordedCursorData } = state;

    const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
    const stableSerialize = (value: unknown) => JSON.stringify(value);
    const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
    const getEntitlementState = async (): Promise<EntitlementState> => {
        try {
            return await (window as any).videoEditorAPI?.license?.getState?.() || DEFAULT_ENTITLEMENT_STATE;
        } catch {
            return DEFAULT_ENTITLEMENT_STATE;
        }
    };
    const normalizeSegments = (items: Segment[]) => items.map((segment) => ({
        startTime: Number(segment.startTime.toFixed(3)),
        endTime: Number(segment.endTime.toFixed(3)),
        timelineStart: Number(segment.timelineStart.toFixed(3)),
    }));
    const getOverlayExportFrameSize = () => {
        const previewElement = state.threeContainerRef?.current as HTMLDivElement | null | undefined;
        const previewWidth = Math.round(previewElement?.clientWidth || 0);
        const previewHeight = Math.round(previewElement?.clientHeight || 0);
        if (previewWidth > 0 && previewHeight > 0) {
            return { width: previewWidth, height: previewHeight };
        }

        switch (state.selectedPlatform) {
            case 'square':
                return { width: 1080, height: 1080 };
            case 'vertical':
                return { width: 1080, height: 1920 };
            case 'landscape':
                return { width: 1920, height: 1080 };
            default:
                return { width: 1920, height: 1080 };
        }
    };
    const buildImageOverlays = (
        overlays: Array<{ file: string; startTime: number; duration: number; x: number; y: number; width: number; height: number; renderMode?: 'overlay' | 'fullscreen' }>
    ) => {
        const frameSize = getOverlayExportFrameSize();
        return overlays
            .map((overlay) => {
                if (overlay.renderMode === 'fullscreen') {
                    return {
                        file: overlay.file,
                        startTime: Math.max(0, overlay.startTime ?? 0),
                        duration: Math.max(0.1, overlay.duration ?? 0.1),
                        x: 0,
                        y: 0,
                        width: 1,
                        height: 1,
                        renderMode: 'fullscreen' as const,
                    };
                }
                const x = clamp01((overlay.x || 0) / frameSize.width);
                const y = clamp01((overlay.y || 0) / frameSize.height);
                const width = Math.max(0.01, Math.min(1 - x, (overlay.width || 0) / frameSize.width));
                const height = Math.max(0.01, Math.min(1 - y, (overlay.height || 0) / frameSize.height));

                return {
                    file: overlay.file,
                    startTime: Math.max(0, overlay.startTime ?? 0),
                    duration: Math.max(0.1, overlay.duration ?? 0.1),
                    x,
                    y,
                    width,
                    height,
                    renderMode: 'overlay' as const,
                };
            })
            .filter((overlay) => !!overlay.file && overlay.width > 0 && overlay.height > 0);
    };

    const buildAnnotationImageOverlays = (
        annotations: AnnotationObject[],
        canvasSize: { width: number; height: number } | null,
        totalDuration: number
    ) => {
        if (!canvasSize || canvasSize.width <= 0 || canvasSize.height <= 0) return [];

        return annotations
            .filter((annotation) => annotation.type !== 'text')
            .map((annotation) => {
                const canvas = document.createElement('canvas');
                canvas.width = canvasSize.width;
                canvas.height = canvasSize.height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return null;

                CanvasRenderer.renderAnnotations(ctx, canvas, [annotation], {
                    selectedAnnotationId: null,
                    isEditing: false,
                    scrollOffset: { x: 0, y: 0 },
                });

                const startTime = Math.max(0, annotation.startTime ?? 0);
                const durationLeft = Math.max(0.1, totalDuration - startTime);
                const overlayDuration = typeof annotation.duration === 'number' ? annotation.duration : durationLeft;

                return {
                    file: canvas.toDataURL('image/png'),
                    startTime,
                    duration: Math.max(0.1, overlayDuration),
                };
            })
            .filter((item): item is { file: string; startTime: number; duration: number } => !!item);
    };

    const handleExport = async () => {
        if (!mediaPath) {
            showNotification('error', 'Export Failed', 'No media file loaded');
            return;
        }

        state.setIsExporting(true);
        showNotification('info', 'Exporting...', 'Processing your video. This may take a moment.');
        const exportStart = Date.now();
        const api = (window as any).videoEditorAPI;

        try {
            const entitlementState = await getEntitlementState();
            const requestedPremiumVoice = Boolean(state.premiumVoice);
            const premiumVoiceEnabled = requestedPremiumVoice && entitlementState.canUseStudioVoice;
            if (requestedPremiumVoice && !entitlementState.canUseStudioVoice) {
                showNotification('warning', 'Studio Voice locked', 'Studio Voice is a Pro feature. Export will continue without it.');
            }

            let exportSegments = segments.map((s: Segment) => ({
                id: s.id,
                startSeconds: s.startTime,
                endSeconds: s.endTime,
                timelineStart: s.timelineStart,
            }));
            if (exportSegments.length === 0 && duration > 0) {
                exportSegments = [{ id: 'segment-0', startSeconds: 0, endSeconds: duration, timelineStart: 0 }];
            }
            const exportDuration = getTimelineDurationFromItems(segments, imageClips);
            const annotationImageOverlays = buildAnnotationImageOverlays(annotationOverlays, annotationCanvasSize, exportDuration);
            const imageOverlaysForExport = buildImageOverlays(overlayImages);
            const buildCursorTrack = (effect: SmartEffect) => {
                if (!effect.followCursor || !Array.isArray(recordedCursorData) || recordedCursorData.length === 0) {
                    return [];
                }

                return buildCursorTimedTrack(
                    recordedCursorData,
                    effect.startTime,
                    effect.startTime + effect.duration,
                    state.crop.appliedCrop,
                    FOLLOW_CURSOR_TRACK_MAX_POINTS,
                    'follow',
                    0,
                );
            };

            const trimData = {
                segments: exportSegments,
                platform: state.selectedPlatform,
                aspectRatio: null as number | null,
                crop: state.crop.appliedCrop,
                quality: (state.exportQuality || 'high') as ExportQuality,
                backgroundColor: state.backgroundColor || '#000000',
                videoPadding: state.videoPadding || 0,
                audioSegments: state.audioSegments.map((a: any) => ({
                    file: a.file,
                    startTime: a.startTime,
                    duration: a.duration,
                    volume: a.volume ?? 1,
                })),
                textOverlays: textOverlays.map((t: any) => ({
                    text: t.text,
                    startTime: t.startTime,
                    duration: t.duration,
                    x: t.x,
                    y: t.y,
                    fontSize: t.fontSize,
                    color: t.color,
                    fontWeight: t.fontWeight || 'normal',
                    backgroundColor: t.backgroundColor,
                    backgroundOpacity: t.backgroundOpacity,
                    padding: t.padding,
                    borderWidth: t.borderWidth,
                    borderColor: t.borderColor,
                    shadowColor: t.shadowColor,
                    shadowBlur: t.shadowBlur,
                    shadowOffsetX: t.shadowOffsetX,
                    shadowOffsetY: t.shadowOffsetY,
                })),
                imageOverlays: imageOverlaysForExport,
                imageClips: imageClips.map((clip: any) => ({
                    id: clip.id,
                    file: clip.file,
                    startTime: clip.startTime,
                    duration: clip.duration,
                })),
                clipTransitions: [] as Array<{ fromItemId: string; toItemId: string; type: TransitionType }>,
                annotationImageOverlays,
                smartEffects: smartEffects.map((e: SmartEffect) => ({
                    type: e.type,
                    startTime: e.startTime,
                    duration: e.duration,
                    intensity: getEffectIntensity(e),
                    tilt: e.tilt ?? 0,
                    zoomArea: e.zoomArea ?? null,
                    followCursor: e.followCursor ?? false,
                    followCursorIntensity: e.followCursorIntensity ?? DEFAULT_ZOOM_INTENSITY,
                    cursorTrack: buildCursorTrack(e),
                    tiltDirection: e.tiltDirection ?? 'orbital',
                    tiltSnap: e.tiltSnap ?? 50,
                })),
                transitionType: 'crossfade' as TransitionType,
                colorGrade: state.colorGrade || 'none',
                premiumVoice: premiumVoiceEnabled,
            };

            const sourcePath = fromMediaFileUrl(mediaPath);

            let result;
            if (state.mediaType === 'video') {
                result = await api?.invoke('export-video', { videoSrc: sourcePath, trimData });
            } else {
                result = await api?.invoke('export-media', sourcePath, state.mediaType, trimData);
            }

            if (result?.success) {
                showNotification(
                    result.warning ? 'warning' : 'success',
                    result.warning ? 'Export Complete (with limitations)' : 'Export Successful',
                    result.warning || `File saved to: ${result.filePath}`,
                );
            } else {
                showNotification('error', 'Export Failed', result?.error || 'Unknown error');
            }
        } catch (err) {
            console.error('[VideoEditor] Export error:', err);
            showNotification('error', 'Export Error', (err as Error).message);
        } finally {
            const elapsed = Date.now() - exportStart;
            const minVisible = 1200;
            if (elapsed < minVisible) {
                await new Promise(r => setTimeout(r, minVisible - elapsed));
            }
            state.setIsExporting(false);
        }
    };

    const handleAutoPolish = useCallback(async () => {
        if (!mediaPath || state.mediaType !== 'video') {
            showNotification('error', 'Auto-Polish', 'Load a video first');
            return;
        }
        const entitlementState = await getEntitlementState();
        if (!entitlementState.canUseAutoPolish) {
            showNotification('warning', 'Auto-Polish locked', 'Auto-Polish is a Pro feature. Upgrade to Pro to unlock it.');
            return;
        }
        if (imageClips.length > 0) {
            showNotification('warning', 'Auto-Polish', 'Remove image clips before running Auto-Polish. It currently trims video-only timelines.');
            return;
        }

        state.setIsAutoPolishing(true);
        showNotification('info', 'Auto-Polish', 'Scanning pauses, voice, and cursor motion...');
        const api = (window as any).videoEditorAPI;
        state.videoRef.current?.pause();
        state.setIsPlaying(false);

        try {
            const currentSegments = getBaseTimelineSegments(segments, duration);
            const currentDuration = getTimelineDurationFromSegments(currentSegments.length > 0
                ? currentSegments.map((segment) => ({ startSeconds: segment.startTime, endSeconds: segment.endTime }))
                : [{ startSeconds: 0, endSeconds: duration }]
            );
            const analysis: AutoPolishPlanResponse | undefined = await api?.invoke('auto-polish-plan', {
                videoSrc: mediaPath,
            });

            const keepRanges = analysis?.success && Array.isArray(analysis.segments) && analysis.segments.length > 0
                ? analysis.segments
                : currentSegments.map((segment) => ({ startSeconds: segment.startTime, endSeconds: segment.endTime }));

            const nextSegments = applyKeepRangesToSegments(currentSegments, keepRanges);
            const nextDuration = getTimelineDurationFromSegments(
                nextSegments.map((segment) => ({ startSeconds: segment.startTime, endSeconds: segment.endTime }))
            );
            const sourceDuration = Math.max(
                duration || 0,
                ...currentSegments.map((segment) => segment.endTime),
            );

            const preservedEffects = stripAutoPolishEffects(smartEffects);
            const autoPolishEffects = buildAutoPolishFocusEffects(
                recordedCursorData,
                sourceDuration,
                nextSegments,
                state.autoPolishTrackingProfile,
            );
            const nextEffects = [...preservedEffects, ...autoPolishEffects].sort((a: SmartEffect, b: SmartEffect) => a.startTime - b.startTime);
            const nextBackground = AUTO_POLISH_BACKGROUND;
            const nextPadding = AUTO_POLISH_PADDING;
            const nextColorGrade = AUTO_POLISH_COLOR_GRADE;
            const nextPremiumVoice = entitlementState.canUseStudioVoice
                ? (!!analysis?.hasAudio || state.premiumVoice)
                : false;

            const segmentsChanged = stableSerialize(normalizeSegments(nextSegments)) !== stableSerialize(normalizeSegments(currentSegments));
            const effectsChanged = stableSerialize(nextEffects) !== stableSerialize(smartEffects);
            const visualChanged =
                state.backgroundColor !== nextBackground ||
                state.videoPadding !== nextPadding ||
                state.colorGrade !== nextColorGrade;
            const voiceChanged = nextPremiumVoice !== state.premiumVoice;

            const appliedChanges: string[] = [];
            const trimmedSeconds = Math.max(0, currentDuration - nextDuration);
            if (segmentsChanged && trimmedSeconds > 0.35) {
                appliedChanges.push(`trimmed ${trimmedSeconds.toFixed(1)}s`);
            }
            if (visualChanged) {
                appliedChanges.push('applied clean frame');
                appliedChanges.push('enabled Studio Clean');
            }
            if (voiceChanged && nextPremiumVoice) {
                appliedChanges.push('voice enhanced');
            }
            const focusMomentCount = autoPolishEffects.filter((effect) => effect.type === 'zoom').length;
            if (effectsChanged && focusMomentCount > 0) {
                appliedChanges.push(`added ${focusMomentCount} focus ${focusMomentCount === 1 ? 'moment' : 'moments'}`);
            }

            if (!segmentsChanged && !effectsChanged && !visualChanged && !voiceChanged) {
                showNotification('info', 'Auto-Polish', analysis?.error
                    ? `No meaningful changes found. ${analysis.error}`
                    : 'No meaningful changes found for this clip.');
                return;
            }

            saveHistory();
            state.setSegments(nextSegments);
            state.setSmartEffects(nextEffects);
            state.setBackgroundColor(nextBackground);
            state.setVideoPadding(nextPadding);
            state.setColorGrade(nextColorGrade);
            state.setPremiumVoice(nextPremiumVoice);
            state.setSelectedEffectId(null);

            state.setDisplayTime(0);
            if (state.videoRef.current) {
                state.videoRef.current.currentTime = nextSegments[0]?.startTime ?? 0;
            }

            const historySnapshot = {
                segments: nextSegments,
                smartEffects: nextEffects,
                backgroundColor: nextBackground,
                videoPadding: nextPadding,
                colorGrade: nextColorGrade,
                premiumVoice: nextPremiumVoice,
            };
            const profileLabel = state.autoPolishTrackingProfile === 'smooth_focus' ? 'Smooth Focus' : 'Balanced';
            const durationDiff = currentDuration > 0
                ? ` (${formatDuration(currentDuration)} -> ${formatDuration(nextDuration)})`
                : '';

            state.setSelectedSegmentId(null);
            state.setSelectedAudioId(null);
            state.setSelectedOverlayId(null);
            state.setSelectedTextOverlayId(null);

            saveHistory(historySnapshot);
            const summary = appliedChanges.join(' • ');
            showNotification(
                analysis?.error ? 'warning' : 'success',
                'Auto-Polish Applied',
                `${profileLabel}: ${appliedChanges.join(' | ')}${durationDiff}`,
            );
        } catch (err) {
            console.error('[VideoEditor] Auto-polish error:', err);
            showNotification('error', 'Auto-Polish Error', (err as Error).message);
        } finally {
            state.setIsAutoPolishing(false);
        }
    }, [mediaPath, segments, imageClips.length, duration, smartEffects, recordedCursorData, state, showNotification, saveHistory]);

    return { handleExport, handleAutoPolish };
}
