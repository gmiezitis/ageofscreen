import { useEffect, useRef, useCallback } from 'react';
import { toMediaFileUrl } from '../shared/mediaPaths';

/**
 * Manages audio element lifecycle and time-synchronisation
 * with the video playback loop.
 */
export function useAudioSync(isPlaying: boolean, displayTime: number, audioSegments: any[], playbackSpeed = 1) {
    const activeAudioElements = useRef<Map<string, HTMLAudioElement>>(new Map());

    const getAudioSrc = useCallback((filePath: string): string => {
        return toMediaFileUrl(filePath);
    }, []);

    useEffect(() => {
        if (!isPlaying) {
            activeAudioElements.current.forEach((audio) => { if (!audio.paused) audio.pause(); });
            return;
        }

        audioSegments.forEach((seg: any) => {
            const segEnd = seg.startTime + seg.duration;
            const inRange = displayTime >= seg.startTime && displayTime < segEnd;
            let el = activeAudioElements.current.get(seg.id);

            if (inRange) {
                if (!el) {
                    el = new Audio(getAudioSrc(seg.file));
                    el.volume = seg.volume ?? 1;
                    el.playbackRate = playbackSpeed;
                    activeAudioElements.current.set(seg.id, el);
                }
                const audioTime = displayTime - seg.startTime;
                el.playbackRate = playbackSpeed;
                if (Math.abs(el.currentTime - audioTime) > 0.3) el.currentTime = audioTime;
                if (el.paused) el.play().catch(() => {});
            } else if (el && !el.paused) {
                el.pause();
            }
        });

        const ids = new Set(audioSegments.map((s: any) => s.id));
        activeAudioElements.current.forEach((audio, id) => {
            if (!ids.has(id)) { audio.pause(); activeAudioElements.current.delete(id); }
        });
    }, [isPlaying, displayTime, audioSegments, playbackSpeed, getAudioSrc]);

    useEffect(() => {
        return () => {
            activeAudioElements.current.forEach((a) => a.pause());
            activeAudioElements.current.clear();
        };
    }, []);
}


