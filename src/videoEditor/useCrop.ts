/**
 * useCrop.ts - Video cropping hook
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface CropRect {
    x: number;      // Left position as % of video (0-100)
    y: number;      // Top position as % of video (0-100)
    width: number;  // Width as % of video (0-100)
    height: number; // Height as % of video (0-100)
}

export interface VideoBounds {
    left: number;   // Pixel offset from container left edge
    top: number;    // Pixel offset from container top edge
    width: number;  // Actual video display width in pixels
    height: number; // Actual video display height in pixels
}

export const isNoOpCrop = (crop: CropRect | null | undefined): boolean => (
    !crop
    || (crop.x <= 0.5 && crop.y <= 0.5 && crop.width >= 99 && crop.height >= 99)
);

export const getPreviewCropForDisplay = (
    isActive: boolean,
    appliedCrop: CropRect | null,
): CropRect | null => (
    // Keep crop editing anchored to the uncropped source frame so reopening the
    // crop tool does not make the video drift away from the handles.
    isActive ? null : appliedCrop
);

export const normalizeAppliedCrop = (crop: CropRect | null | undefined): CropRect | null => (
    isNoOpCrop(crop) ? null : { ...crop }
);

interface UseCropOptions {
    videoRef: React.RefObject<HTMLVideoElement>;
    containerRef: React.RefObject<HTMLDivElement>;
    previewMode?: 'fit' | 'fill';
}

export const calculateVideoBounds = (
    video: HTMLVideoElement | null,
    container: HTMLDivElement | null,
    mode: 'fit' | 'fill' = 'fit'
): VideoBounds => {
    if (!video || !container) {
        return { left: 0, top: 0, width: 0, height: 0 };
    }

    const { clientWidth: cw, clientHeight: ch } = container;
    const { videoWidth: vw, videoHeight: vh } = video;

    if (vw === 0 || vh === 0) {
        return { left: 0, top: 0, width: cw, height: ch };
    }

    const vr = vw / vh;
    const cr = cw / ch;

    let width: number, height: number, left: number, top: number;

    if (mode === 'fit') {
        if (vr > cr) {
            width = cw;
            height = cw / vr;
            left = 0;
            top = (ch - height) / 2;
        } else {
            height = ch;
            width = ch * vr;
            left = (cw - width) / 2;
            top = 0;
        }
    } else {
        if (vr > cr) {
            height = ch;
            width = ch * vr;
            left = (cw - width) / 2;
            top = 0;
        } else {
            width = cw;
            height = cw / vr;
            left = 0;
            top = (ch - height) / 2;
        }
    }

    return { left, top, width, height };
};

export const useCrop = ({ videoRef, containerRef, previewMode = 'fit' }: UseCropOptions) => {
    const [isActive, setIsActive] = useState(false);
    const [cropRect, setCropRect] = useState<CropRect | null>(null);
    const [appliedCrop, setAppliedCrop] = useState<CropRect | null>(null);
    const [videoBounds, setVideoBounds] = useState<VideoBounds>({ left: 0, top: 0, width: 0, height: 0 });
    const [isDragging, setIsDragging] = useState(false);

    const dragRef = useRef<{
        handle: string;
        startX: number;
        startY: number;
        startRect: CropRect;
    } | null>(null);

    const updateVideoBounds = useCallback(() => {
        const bounds = calculateVideoBounds(videoRef.current, containerRef.current, previewMode);
        setVideoBounds(bounds);
        return bounds;
    }, [videoRef, containerRef, previewMode]);

    useEffect(() => {
        const container = containerRef.current;
        const video = videoRef.current;
        if (!container) return;

        const scheduleUpdate = () => {
            requestAnimationFrame(() => {
                updateVideoBounds();
            });
        };

        const observer = new ResizeObserver(scheduleUpdate);

        observer.observe(container);
        if (video) {
            video.addEventListener('loadedmetadata', scheduleUpdate);
            video.addEventListener('resize', scheduleUpdate);
        }

        // Initial update with a small delay for DOM to settle
        const timer = setTimeout(scheduleUpdate, 100);
        scheduleUpdate();

        return () => {
            observer.disconnect();
            clearTimeout(timer);
            if (video) {
                video.removeEventListener('loadedmetadata', scheduleUpdate);
                video.removeEventListener('resize', scheduleUpdate);
            }
        };
    }, [containerRef, updateVideoBounds, videoRef.current]);

    const startCropping = useCallback(() => {
        updateVideoBounds();
        setCropRect(appliedCrop ? { ...appliedCrop } : { x: 0, y: 0, width: 100, height: 100 });
        setIsActive(true);
    }, [updateVideoBounds, appliedCrop]);

    const replaceAppliedCrop = useCallback((nextCrop: CropRect | null | undefined) => {
        setAppliedCrop(normalizeAppliedCrop(nextCrop));
        setIsActive(false);
        setCropRect(null);
    }, []);

    const applyCrop = useCallback(() => {
        if (cropRect) {
            replaceAppliedCrop(cropRect);
            return;
        }
        setIsActive(false);
        setCropRect(null);
    }, [cropRect, replaceAppliedCrop]);

    const cancelCrop = useCallback(() => {
        setIsActive(false);
        setCropRect(null);
    }, []);

    const clearCrop = useCallback(() => {
        replaceAppliedCrop(null);
    }, [replaceAppliedCrop]);

    const handleMouseDown = useCallback((e: React.MouseEvent, handle: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (!cropRect) return;

        dragRef.current = {
            handle,
            startX: e.clientX,
            startY: e.clientY,
            startRect: { ...cropRect }
        };
        setIsDragging(true);

        const handleMouseMove = (moveEvent: MouseEvent) => {
            if (!dragRef.current || !videoBounds.width || !videoBounds.height) return;

            const deltaX = ((moveEvent.clientX - dragRef.current.startX) / videoBounds.width) * 100;
            const deltaY = ((moveEvent.clientY - dragRef.current.startY) / videoBounds.height) * 100;
            const start = dragRef.current.startRect;
            const h = dragRef.current.handle;

            let newRect = { ...start };

            if (h === 'move') {
                newRect.x = Math.max(0, Math.min(100 - start.width, start.x + deltaX));
                newRect.y = Math.max(0, Math.min(100 - start.height, start.y + deltaY));
            } else if (h === 'top-left') {
                newRect.x = Math.max(0, Math.min(start.x + start.width - 10, start.x + deltaX));
                newRect.y = Math.max(0, Math.min(start.y + start.height - 10, start.y + deltaY));
                newRect.width = start.width - (newRect.x - start.x);
                newRect.height = start.height - (newRect.y - start.y);
            } else if (h === 'top-right') {
                newRect.y = Math.max(0, Math.min(start.y + start.height - 10, start.y + deltaY));
                newRect.width = Math.max(10, Math.min(100 - start.x, start.width + deltaX));
                newRect.height = start.height - (newRect.y - start.y);
            } else if (h === 'bottom-left') {
                newRect.x = Math.max(0, Math.min(start.x + start.width - 10, start.x + deltaX));
                newRect.width = start.width - (newRect.x - start.x);
                newRect.height = Math.max(10, Math.min(100 - start.y, start.height + deltaY));
            } else if (h === 'bottom-right') {
                newRect.width = Math.max(10, Math.min(100 - start.x, start.width + deltaX));
                newRect.height = Math.max(10, Math.min(100 - start.y, start.height + deltaY));
            } else if (h === 'top') {
                newRect.y = Math.max(0, Math.min(start.y + start.height - 10, start.y + deltaY));
                newRect.height = start.height - (newRect.y - start.y);
            } else if (h === 'bottom') {
                newRect.height = Math.max(10, Math.min(100 - start.y, start.height + deltaY));
            } else if (h === 'left') {
                newRect.x = Math.max(0, Math.min(start.x + start.width - 10, start.x + deltaX));
                newRect.width = start.width - (newRect.x - start.x);
            } else if (h === 'right') {
                newRect.width = Math.max(10, Math.min(100 - start.x, start.width + deltaX));
            }

            setCropRect(newRect);
        };

        const handleMouseUp = () => {
            dragRef.current = null;
            setIsDragging(false);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
    }, [cropRect, videoBounds]);

    const getVideoStyle = useCallback((): React.CSSProperties => {
        if (!videoBounds || !videoBounds.width || !containerRef.current) {
            return { width: '100%', height: '100%', objectFit: 'contain' as const };
        }

        const { clientWidth: cw, clientHeight: ch } = containerRef.current;
        const baseStyle: React.CSSProperties = {
            position: 'absolute' as const,
            width: `${videoBounds.width}px`,
            height: `${videoBounds.height}px`,
            left: `${videoBounds.left}px`,
            top: `${videoBounds.top}px`,
            objectFit: 'fill' as const,
            backfaceVisibility: 'hidden',
            transformOrigin: '0 0',
            willChange: 'transform'
        };

        const cropData = getPreviewCropForDisplay(isActive, appliedCrop);

        if (isNoOpCrop(cropData)) {
            return {
                ...baseStyle,
                transform: 'none',
            };
        }

        // Pixel-precise crop transform: keep selected crop centered without positional drift.
        const scaleX = cw / ((videoBounds.width * cropData.width) / 100);
        const scaleY = ch / ((videoBounds.height * cropData.height) / 100);
        const scale = Math.min(scaleX, scaleY);

        const selectedCenterX = ((cropData.x + cropData.width / 2) / 100) * videoBounds.width;
        const selectedCenterY = ((cropData.y + cropData.height / 2) / 100) * videoBounds.height;
        const translateX = cw / 2 - (videoBounds.left + selectedCenterX * scale);
        const translateY = ch / 2 - (videoBounds.top + selectedCenterY * scale);

        return {
            ...baseStyle,
            transform: `translate3d(${translateX}px, ${translateY}px, 0) scale(${scale})`,
        };
    }, [appliedCrop, isActive, videoBounds, containerRef]);

    const getWrapperStyle = useCallback((): React.CSSProperties => {
        return {
            position: 'absolute' as const,
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            background: 'transparent',
            borderRadius: '4px'
        };
    }, []);

    const getCropOverlayStyle = useCallback((): React.CSSProperties => {
        if (!videoBounds.width) {
            return { display: 'none' };
        }

        return {
            position: 'absolute',
            left: videoBounds.left,
            top: videoBounds.top,
            width: videoBounds.width,
            height: videoBounds.height,
            pointerEvents: 'none',
            zIndex: 200
        };
    }, [videoBounds]);

    return {
        isActive,
        cropRect,
        appliedCrop,
        videoBounds,
        isDragging,
        startCropping,
        applyCrop,
        cancelCrop,
        clearCrop,
        replaceAppliedCrop,
        handleMouseDown,
        getVideoStyle,
        getWrapperStyle,
        getCropOverlayStyle
    };
};

export default useCrop;
