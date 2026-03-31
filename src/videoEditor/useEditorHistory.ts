import { useCallback } from 'react';
import { Segment, SmartEffect, AudioSegment, OverlayImage, TextOverlay, ImageClip, ClipTransition } from './types';
import type { AnnotationObject } from '../types';

/**
 * Undo / Redo history management for the video editor.
 *
 * Keeps up to 20 snapshots of editor state (segments, audio, effects,
 * overlays, text) and provides save/undo/redo/can* helpers.
 */
export function useEditorHistory(state: any) {
    const {
        segments, audioSegments, smartEffects, overlayImages, imageClips, textOverlays, annotationOverlays, clipTransitions,
        backgroundColor, videoPadding, colorGrade, premiumVoice,
        history, setHistory, historyIndex, setHistoryIndex,
        setSegments, setAudioSegments, setSmartEffects, setOverlayImages, setImageClips, setTextOverlays, setAnnotationOverlays, setClipTransitions,
        setBackgroundColor, setVideoPadding, setColorGrade, setPremiumVoice,
    } = state;

    const showNotification = useCallback((type: string, title: string, message: string) => {
        state.setNotification({ type, title, message });
        setTimeout(() => state.setNotification(null), 3000);
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
            backgroundColor: over.backgroundColor ?? backgroundColor,
            videoPadding: over.videoPadding ?? videoPadding,
            colorGrade: over.colorGrade ?? colorGrade,
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
    }, [segments, audioSegments, smartEffects, overlayImages, imageClips, clipTransitions, textOverlays, annotationOverlays, backgroundColor, videoPadding, colorGrade, premiumVoice, history, historyIndex, setHistory, setHistoryIndex]);

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
        if (prev.backgroundColor !== undefined) setBackgroundColor(prev.backgroundColor);
        if (prev.videoPadding !== undefined) setVideoPadding(prev.videoPadding);
        if (prev.colorGrade !== undefined) setColorGrade(prev.colorGrade);
        if (prev.premiumVoice !== undefined) setPremiumVoice(prev.premiumVoice);
        showNotification('success', 'Undo', 'Action undone');
    }, [history, historyIndex, setHistoryIndex, setSegments, setAudioSegments, setSmartEffects, setOverlayImages, setImageClips, setClipTransitions, setTextOverlays, setAnnotationOverlays, setBackgroundColor, setVideoPadding, setColorGrade, setPremiumVoice, showNotification]);

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
        if (next.backgroundColor !== undefined) setBackgroundColor(next.backgroundColor);
        if (next.videoPadding !== undefined) setVideoPadding(next.videoPadding);
        if (next.colorGrade !== undefined) setColorGrade(next.colorGrade);
        if (next.premiumVoice !== undefined) setPremiumVoice(next.premiumVoice);
        showNotification('success', 'Redo', 'Action redone');
    }, [history, historyIndex, setHistoryIndex, setSegments, setAudioSegments, setSmartEffects, setOverlayImages, setImageClips, setClipTransitions, setTextOverlays, setAnnotationOverlays, setBackgroundColor, setVideoPadding, setColorGrade, setPremiumVoice, showNotification]);

    const canUndo = history.length > 0 && historyIndex > 0;
    const canRedo = history.length > 0 && historyIndex < history.length - 1;

    return { saveHistory, undo, redo, canUndo, canRedo, showNotification };
}
