import { useCallback, useEffect, useRef } from 'react';
import { Segment, SmartEffect, AudioSegment, OverlayImage, TextOverlay, ImageClip, ClipTransition, EditorNotification, normalizeCursorHighlightSettings } from './types';
import type { AnnotationObject } from '../types';
import type { CropRect } from './useCrop';

/**
 * Undo / Redo history management for the video editor.
 *
 * Keeps up to 20 snapshots of editor state (segments, audio, effects,
 * overlays, text) and provides save/undo/redo/can* helpers.
 */
export function useEditorHistory(state: any) {
    const {
        segments, audioSegments, smartEffects, overlayImages, imageClips, textOverlays, annotationOverlays, clipTransitions,
        backgroundColor, videoPadding, colorGrade, cursorHighlight, premiumVoice,
        history, setHistory, historyIndex, setHistoryIndex,
        setSegments, setAudioSegments, setSmartEffects, setOverlayImages, setImageClips, setTextOverlays, setAnnotationOverlays, setClipTransitions,
        setBackgroundColor, setVideoPadding, setColorGrade, setCursorHighlight, setPremiumVoice,
    } = state;

    const notificationTimeoutRef = useRef<number | null>(null);

    useEffect(() => (
        () => {
            if (notificationTimeoutRef.current !== null) {
                window.clearTimeout(notificationTimeoutRef.current);
            }
        }
    ), []);

    const showNotification = useCallback((
        type: EditorNotification['type'],
        title: string,
        message: string,
        options?: Omit<EditorNotification, 'type' | 'title' | 'message'>,
    ) => {
        if (notificationTimeoutRef.current !== null) {
            window.clearTimeout(notificationTimeoutRef.current);
            notificationTimeoutRef.current = null;
        }

        state.setNotification({
            type,
            title,
            message,
            ...options,
        });

        if (options?.sticky) {
            return;
        }

        const durationMs = options?.durationMs ?? 3000;
        notificationTimeoutRef.current = window.setTimeout(() => {
            state.setNotification((current: EditorNotification | null) => (
                current?.title === title && current?.message === message ? null : current
            ));
            notificationTimeoutRef.current = null;
        }, durationMs);
    }, [state.setNotification]);

    const saveHistory = useCallback((stateOverride?: any) => {
        let over = stateOverride || {};
        if (Array.isArray(stateOverride)) {
            over = { segments: stateOverride };
        }

        const stateToSave = {
            segments: (over.segments ?? segments).map((s: Segment) => ({ ...s })),
            audioSegments: (over.audioSegments ?? audioSegments).map((a: AudioSegment) => ({ ...a })),
            smartEffects: (over.smartEffects ?? smartEffects).map((e: SmartEffect) => ({ ...e })),
            overlayImages: (over.overlayImages ?? overlayImages).map((o: OverlayImage) => ({ ...o })),
            imageClips: (over.imageClips ?? imageClips).map((clip: ImageClip) => ({ ...clip })),
            clipTransitions: (over.clipTransitions ?? clipTransitions).map((transition: ClipTransition) => ({ ...transition })),
            textOverlays: (over.textOverlays ?? textOverlays).map((t: TextOverlay) => ({ ...t })),
            annotationOverlays: (over.annotationOverlays ?? annotationOverlays).map((annotation: AnnotationObject) => ({ ...annotation })),
            appliedCrop: ('appliedCrop' in over)
                ? (over.appliedCrop ? { ...(over.appliedCrop as CropRect) } : null)
                : (state.crop?.appliedCrop ? { ...state.crop.appliedCrop } : null),
            backgroundColor: over.backgroundColor ?? backgroundColor,
            videoPadding: over.videoPadding ?? videoPadding,
            colorGrade: over.colorGrade ?? colorGrade,
            cursorHighlight: normalizeCursorHighlightSettings(over.cursorHighlight ?? cursorHighlight),
            premiumVoice: over.premiumVoice ?? premiumVoice,
        };

        if (history.length > 0 && historyIndex >= 0) {
            const lastState = history[historyIndex];
            if (JSON.stringify(lastState) === JSON.stringify(stateToSave)) return;
        }

        if (history.length === 0) {
            setHistory([stateToSave]);
            setHistoryIndex(0);
            return;
        }
        const newHistory = [...history.slice(0, historyIndex + 1), stateToSave].slice(-20);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
    }, [segments, audioSegments, smartEffects, overlayImages, imageClips, clipTransitions, textOverlays, annotationOverlays, backgroundColor, videoPadding, colorGrade, cursorHighlight, premiumVoice, history, historyIndex, setHistory, setHistoryIndex, state.crop]);

    const undo = useCallback(() => {
        if (history.length === 0) { showNotification('warning', 'Undo', 'No history available'); return; }
        if (historyIndex <= 0) { showNotification('warning', 'Undo', 'Nothing to undo'); return; }
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        const prev = history[newIndex];
        if (prev.segments) setSegments(prev.segments);
        if (prev.audioSegments) setAudioSegments(prev.audioSegments);
        if (prev.smartEffects) setSmartEffects(prev.smartEffects);
        if (prev.overlayImages) setOverlayImages(prev.overlayImages);
        if (prev.imageClips) setImageClips(prev.imageClips);
        if (prev.clipTransitions) setClipTransitions(prev.clipTransitions);
        if (prev.textOverlays) setTextOverlays(prev.textOverlays);
        if (prev.annotationOverlays) setAnnotationOverlays(prev.annotationOverlays);
        if ('appliedCrop' in prev) state.crop?.replaceAppliedCrop?.(prev.appliedCrop ?? null);
        if (prev.backgroundColor !== undefined) setBackgroundColor(prev.backgroundColor);
        if (prev.videoPadding !== undefined) setVideoPadding(prev.videoPadding);
        if (prev.colorGrade !== undefined) setColorGrade(prev.colorGrade);
        if (prev.cursorHighlight) setCursorHighlight(normalizeCursorHighlightSettings(prev.cursorHighlight));
        if (prev.premiumVoice !== undefined) setPremiumVoice(prev.premiumVoice);
        showNotification('success', 'Undo', 'Action undone');
    }, [history, historyIndex, setHistoryIndex, setSegments, setAudioSegments, setSmartEffects, setOverlayImages, setImageClips, setClipTransitions, setTextOverlays, setAnnotationOverlays, setBackgroundColor, setVideoPadding, setColorGrade, setCursorHighlight, setPremiumVoice, showNotification, state.crop]);

    const redo = useCallback(() => {
        if (history.length === 0) { showNotification('warning', 'Redo', 'No history available'); return; }
        if (historyIndex >= history.length - 1) { showNotification('warning', 'Redo', 'Nothing to redo'); return; }
        const newIndex = historyIndex + 1;
        setHistoryIndex(newIndex);
        const next = history[newIndex];
        if (next.segments) setSegments(next.segments);
        if (next.audioSegments) setAudioSegments(next.audioSegments);
        if (next.smartEffects) setSmartEffects(next.smartEffects);
        if (next.overlayImages) setOverlayImages(next.overlayImages);
        if (next.imageClips) setImageClips(next.imageClips);
        if (next.clipTransitions) setClipTransitions(next.clipTransitions);
        if (next.textOverlays) setTextOverlays(next.textOverlays);
        if (next.annotationOverlays) setAnnotationOverlays(next.annotationOverlays);
        if ('appliedCrop' in next) state.crop?.replaceAppliedCrop?.(next.appliedCrop ?? null);
        if (next.backgroundColor !== undefined) setBackgroundColor(next.backgroundColor);
        if (next.videoPadding !== undefined) setVideoPadding(next.videoPadding);
        if (next.colorGrade !== undefined) setColorGrade(next.colorGrade);
        if (next.cursorHighlight) setCursorHighlight(normalizeCursorHighlightSettings(next.cursorHighlight));
        if (next.premiumVoice !== undefined) setPremiumVoice(next.premiumVoice);
        showNotification('success', 'Redo', 'Action redone');
    }, [history, historyIndex, setHistoryIndex, setSegments, setAudioSegments, setSmartEffects, setOverlayImages, setImageClips, setClipTransitions, setTextOverlays, setAnnotationOverlays, setBackgroundColor, setVideoPadding, setColorGrade, setCursorHighlight, setPremiumVoice, showNotification, state.crop]);

    const canUndo = history.length > 0 && historyIndex > 0;
    const canRedo = history.length > 0 && historyIndex < history.length - 1;

    return { saveHistory, undo, redo, canUndo, canRedo, showNotification };
}
