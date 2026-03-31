import { useEffect } from 'react';

/**
 * Keyboard shortcut handler for the video editor:
 * Space = play/pause, Ctrl+Z/Y = undo/redo, Delete = remove selected.
 *
 * Extracted from videoEditor.tsx to keep the orchestrator lean.
 */
export function useEditorKeyboard(state: any, handlers: any) {
    const { mediaLoaded } = state;

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

            if (e.key === ' ' && !e.ctrlKey && !e.metaKey && !e.altKey) {
                e.preventDefault();
                if (mediaLoaded) handlers.togglePlay();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                e.preventDefault();
                if (e.shiftKey) handlers.redo();
                else handlers.undo();
            } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
                e.preventDefault();
                handlers.redo();
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (state.selectedSegmentId || state.selectedImageClipId) {
                    handlers.deleteSelectedSegment();
                } else if (state.selectedAudioId) {
                    state.setAudioSegments((prev: any) => { const n = prev.filter((a: any) => a.id !== state.selectedAudioId); handlers.saveHistory({ audioSegments: n }); return n; });
                    state.setSelectedAudioId(null);
                } else if (state.selectedEffectId) {
                    state.setSmartEffects((prev: any) => { const n = prev.filter((e: any) => e.id !== state.selectedEffectId); handlers.saveHistory({ smartEffects: n }); return n; });
                    state.setSelectedEffectId(null);
                } else if (state.selectedOverlayId) {
                    state.setOverlayImages((prev: any) => { const n = prev.filter((o: any) => o.id !== state.selectedOverlayId); handlers.saveHistory({ overlayImages: n }); return n; });
                    state.setSelectedOverlayId(null);
                } else if (state.selectedTextOverlayId) {
                    state.setTextOverlays((prev: any) => { const n = prev.filter((t: any) => t.id !== state.selectedTextOverlayId); handlers.saveHistory({ textOverlays: n }); return n; });
                    state.setSelectedTextOverlayId(null);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [state.selectedSegmentId, state.selectedImageClipId, state.selectedAudioId, state.selectedEffectId, state.selectedOverlayId, state.selectedTextOverlayId, mediaLoaded, handlers]);
}
