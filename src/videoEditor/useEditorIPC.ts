import { useEffect, useRef } from 'react';
import { buildSmartTrackingEffects, DEFAULT_SMART_TRACKING_PROFILE } from './smartTracking';
import { TextOverlay } from './types';
import type { AgentSummaryPayload } from '../shared/agent';
import { createMediaThumbnail } from './mediaThumbnails';

const applyLoadedVideoToState = (
    state: any,
    showNotification: (type: string, title: string, message: string) => void,
    videoDataUrl: string,
    name?: string,
    toastMessage?: string,
    resetPadding?: boolean,
    cursorData?: any[],
    smartEffectsOverride?: any[],
) => {
    const nextCursorData = cursorData || [];
    const generatedEffects = Array.isArray(smartEffectsOverride) && smartEffectsOverride.length > 0
        ? smartEffectsOverride
        : (!resetPadding && nextCursorData.length > 0
            ? buildSmartTrackingEffects(nextCursorData, { profile: state.autoPolishTrackingProfile || DEFAULT_SMART_TRACKING_PROFILE })
            : []);

    const finalName = name || `Recording-${new Date().toLocaleTimeString()}`;
    const assetId = `recording-${Date.now()}`;

    state.setMediaPath(videoDataUrl);
    state.setMediaType('video');
    state.setMediaName(finalName);
    state.setMediaLoaded(false);
    state.setDisplayTime(0);
    state.setSegments([]);
    state.setAudioSegments([]);
    state.setImageClips([]);
    state.setClipTransitions?.([]);
    state.setOverlayImages([]);
    state.setSmartEffects(generatedEffects);
    state.setTextOverlays([]);
    state.setAnnotationOverlays([]);
    state.setAnnotationCanvasSize(null);
    state.setIsPlaying(false);
    state.setHistory?.([]);
    state.setHistoryIndex?.(-1);
    state.setSelectedSegmentId?.(null);
    state.setSelectedAudioId?.(null);
    state.setSelectedEffectId?.(null);
    state.setSelectedOverlayId?.(null);
    state.setSelectedImageClipId?.(null);
    state.setSelectedTextOverlayId?.(null);
    state.setDraggedSegmentId?.(null);
    state.setDraggedAudioId?.(null);
    state.setDraggedOverlayId?.(null);
    state.setDraggedImageClipId?.(null);
    state.setDraggedTextOverlayId?.(null);
    state.setDraggingEffectId?.(null);
    state.setEffectDragInfo?.(null);
    state.setResizing?.(null);
    state.setIsDraggingPlayhead?.(false);
    if (resetPadding) {
        state.setVideoPadding(0);
        state.setColorGrade('none');
    }
    state.setRecordedCursorData(nextCursorData);

    setTimeout(() => {
        if (!resetPadding) {
            state.setLibraryAssets((prev: any[]) => {
                const existing = prev.find((asset: any) =>
                    asset.path.replace(/\\/g, '/').toLowerCase() === videoDataUrl.replace(/\\/g, '/').toLowerCase()
                );
                if (existing) {
                    return prev.map((asset: any) => (
                        asset.path.replace(/\\/g, '/').toLowerCase() === videoDataUrl.replace(/\\/g, '/').toLowerCase()
                            ? {
                                ...asset,
                                name: finalName,
                                cursorData: nextCursorData.length > 0 ? nextCursorData : asset.cursorData,
                            }
                            : asset
                    ));
                }
                return [{
                    id: assetId,
                    type: 'video' as const,
                    path: videoDataUrl,
                    name: finalName,
                    cursorData: nextCursorData.length > 0 ? nextCursorData : undefined,
                }, ...prev];
            });
        }

        if (!resetPadding) {
            createMediaThumbnail(videoDataUrl, 'video')
                .catch((): undefined => undefined)
                .then((thumbnail: string | undefined) => {
                    state.setLibraryAssets((prev: any[]) => prev.map((asset: any) =>
                        asset.path.replace(/\\/g, '/').toLowerCase() === videoDataUrl.replace(/\\/g, '/').toLowerCase()
                            ? { ...asset, thumbnail: thumbnail ?? asset.thumbnail }
                            : asset
                    ));
                });
        }

        const defaultMessage = generatedEffects.length > 0
            ? `New recording ready with ${generatedEffects.length} Smart Tracking effects`
            : 'New recording ready for editing';
        showNotification('success', 'Media Hub', toastMessage || defaultMessage);
    }, 50);
};

const buildAgentSummaryOverlays = (payload: AgentSummaryPayload, duration: number): TextOverlay[] => {
    const safeDuration = Math.max(8, Number.isFinite(duration) ? duration : 12);
    const bullets = payload.bullets.map((item) => item.trim()).filter(Boolean).slice(0, 3);
    const titleDuration = Math.min(3.2, Math.max(2.2, safeDuration * 0.24));
    const bulletWindow = Math.max(4.5, safeDuration - titleDuration - 0.8);
    const bulletDuration = bullets.length > 0 ? Math.max(1.8, bulletWindow / bullets.length) : 2.2;
    const overlays: TextOverlay[] = [
        {
            id: `agent-title-${Date.now()}`,
            text: payload.title.trim() || 'Summary Clip',
            startTime: 0.2,
            duration: titleDuration,
            x: 50,
            y: 18,
            fontSize: 56,
            color: '#f8fafc',
            fontWeight: 'bold',
            backgroundColor: '#0f172a',
            backgroundOpacity: 0.62,
            padding: 18,
            shadowColor: '#020617',
            shadowOffsetX: 0,
            shadowOffsetY: 6,
        },
    ];

    bullets.forEach((bullet, index) => {
        overlays.push({
            id: `agent-bullet-${index}-${Date.now()}`,
            text: `- ${bullet}`,
            startTime: titleDuration + index * bulletDuration,
            duration: Math.min(bulletDuration + 0.35, safeDuration),
            x: 50,
            y: 38 + index * 15,
            fontSize: 36,
            color: '#e2e8f0',
            fontWeight: 'bold',
            backgroundColor: '#111827',
            backgroundOpacity: 0.5,
            padding: 14,
            shadowColor: '#020617',
            shadowOffsetX: 0,
            shadowOffsetY: 4,
        });
    });

    overlays.push({
        id: `agent-footer-${Date.now()}`,
        text: payload.style === 'focus_demo' ? 'Focused walkthrough generated locally' : 'Summary prepared locally in SnipFocus',
        startTime: Math.max(0.4, safeDuration - 2.6),
        duration: 2.4,
        x: 50,
        y: 88,
        fontSize: 24,
        color: '#cbd5e1',
        backgroundColor: '#0f172a',
        backgroundOpacity: 0.42,
        padding: 10,
    });

    return overlays;
};

const applyAgentSummaryToState = (
    state: any,
    payload: AgentSummaryPayload,
    showNotification: (type: string, title: string, message: string) => void,
) => {
    let attempts = 0;
    const apply = () => {
        const mediaDuration = Number(state.videoRef?.current?.duration) || state.duration || 12;
        if ((!mediaDuration || !Number.isFinite(mediaDuration)) && attempts < 25) {
            attempts += 1;
            setTimeout(apply, 120);
            return;
        }

        state.setBackgroundColor(payload.style === 'focus_demo' ? '#0f172a' : '#111827');
        state.setVideoPadding(16);
        state.setColorGrade('studio_clean');
        state.setTextOverlays(buildAgentSummaryOverlays(payload, mediaDuration));
        showNotification('success', 'Agent Summary Ready', 'Summary captions and clean styling were added. Review and export when ready.');
    };

    apply();
};

/**
 * Registers Electron IPC listeners:
 *  - load-video: receive a new recording from the capture pipeline
 *  - update-background-color: change the editor background remotely
 */
export function useEditorIPC(
    state: any, 
    showNotification: (type: string, title: string, message: string) => void,
    onLoadVideo?: () => void
) {
    const stateRef = useRef(state);
    const showNotificationRef = useRef(showNotification);
    const consumedMediaUrlsRef = useRef(new Set<string>());

    stateRef.current = state;
    showNotificationRef.current = showNotification;

    useEffect(() => {
        const api = (window as any).videoEditorAPI;
        if (!api) return;

        let cancelled = false;
        let handshakeTimer: number | null = null;

        const consumeLoadedVideo = (
            videoDataUrl: string,
            name?: string,
            toastMessage?: string,
            resetPadding?: boolean,
            cursorData?: any[],
            smartEffectsOverride?: any[],
        ) => {
            if (!videoDataUrl || cancelled) return;
            if (consumedMediaUrlsRef.current.has(videoDataUrl)) return;

            consumedMediaUrlsRef.current.add(videoDataUrl);
            applyLoadedVideoToState(
                stateRef.current,
                showNotificationRef.current,
                videoDataUrl,
                name,
                toastMessage,
                resetPadding,
                cursorData,
                smartEffectsOverride,
            );
            onLoadVideo?.();
        };

        console.log('[VideoEditorIPC] Registering editor IPC listeners');

        const cleanupVideo = api.on(
            'load-video',
            (
                videoDataUrl: string,
                name?: string,
                toastMessage?: string,
                resetPadding?: boolean,
                cursorData?: any[],
                smartEffectsOverride?: any[],
            ) => {
                consumeLoadedVideo(videoDataUrl, name, toastMessage, resetPadding, cursorData, smartEffectsOverride);
            },
        );

        handshakeTimer = window.setTimeout(() => {
            if (cancelled) return;

            console.log('[VideoEditorIPC] Sending video-editor-ready');
            api.send('video-editor-ready');
            api.invoke('get-pending-editor-media')
                .then((pendingMedia?: { videoDataUrl?: string; name?: string; cursorData?: any[] }) => {
                    if (cancelled || !pendingMedia?.videoDataUrl) return;

                    consumeLoadedVideo(
                        pendingMedia.videoDataUrl,
                        pendingMedia.name,
                        undefined,
                        false,
                        pendingMedia.cursorData,
                        undefined,
                    );
                })
                .catch(() => {
                    // Ignore pending-media recovery errors and rely on the live event path.
                });
        }, 0);

        const cleanupBg = api.on('update-background-color', (color: string) => {
            stateRef.current.setBackgroundColor(color);
        });

        const cleanupAgentSummary = api.on('apply-agent-summary', (payload: AgentSummaryPayload) => {
            applyAgentSummaryToState(stateRef.current, payload, showNotificationRef.current);
        });

        return () => {
            cancelled = true;
            if (handshakeTimer !== null) {
                window.clearTimeout(handshakeTimer);
            }
            cleanupVideo?.();
            cleanupBg?.();
            cleanupAgentSummary?.();
        };
    }, []);
}
