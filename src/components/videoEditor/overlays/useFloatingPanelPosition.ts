import { CSSProperties, MouseEvent as ReactMouseEvent, RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react';

type PanelPosition = {
    left: number;
    top: number;
};

const PANEL_GUTTER = 14;

const readNumericStyleValue = (value: CSSProperties[keyof CSSProperties]): number | undefined => {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const clampValue = (value: number, min: number, max: number) => Math.max(min, Math.min(value, max));

export const useFloatingPanelPosition = (
    containerRef: RefObject<HTMLElement | null>,
    preferredStyle?: CSSProperties,
) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState<PanelPosition | null>(null);

    const getClampedPosition = useCallback((left: number, top: number): PanelPosition | null => {
        const container = containerRef.current;
        const panel = panelRef.current;
        if (!container || !panel) return null;

        const maxLeft = Math.max(PANEL_GUTTER, container.clientWidth - panel.offsetWidth - PANEL_GUTTER);
        const maxTop = Math.max(PANEL_GUTTER, container.clientHeight - panel.offsetHeight - PANEL_GUTTER);

        return {
            left: clampValue(left, PANEL_GUTTER, maxLeft),
            top: clampValue(top, PANEL_GUTTER, maxTop),
        };
    }, [containerRef]);

    const resolveInitialPosition = useCallback((): PanelPosition | null => {
        const container = containerRef.current;
        const panel = panelRef.current;
        if (!container || !panel) return null;

        const preferredLeft = readNumericStyleValue(preferredStyle?.left);
        const preferredTop = readNumericStyleValue(preferredStyle?.top) ?? PANEL_GUTTER;
        const preferredRight = readNumericStyleValue(preferredStyle?.right);
        const preferredBottom = readNumericStyleValue(preferredStyle?.bottom);

        let left = preferredLeft ?? Math.max(PANEL_GUTTER, container.clientWidth - panel.offsetWidth - (preferredRight ?? PANEL_GUTTER));
        let top = preferredTop;

        if (preferredLeft == null && preferredRight != null) {
            left = container.clientWidth - panel.offsetWidth - preferredRight;
        }
        if (preferredBottom != null && preferredStyle?.top == null) {
            top = container.clientHeight - panel.offsetHeight - preferredBottom;
        }

        return getClampedPosition(left, top);
    }, [containerRef, getClampedPosition, preferredStyle]);

    useLayoutEffect(() => {
        const container = containerRef.current;
        const panel = panelRef.current;
        if (!container || !panel) return;

        const updatePosition = () => {
            setPosition((current) => {
                const base = current ?? resolveInitialPosition();
                if (!base) return current;
                const next = getClampedPosition(base.left, base.top);
                if (!next) return current;
                if (current && current.left === next.left && current.top === next.top) {
                    return current;
                }
                return next;
            });
        };

        const observer = new ResizeObserver(updatePosition);
        observer.observe(container);
        observer.observe(panel);
        updatePosition();

        return () => observer.disconnect();
    }, [containerRef, getClampedPosition, resolveInitialPosition]);

    const startDrag = useCallback((event: ReactMouseEvent<HTMLElement>) => {
        event.preventDefault();
        event.stopPropagation();

        const initialPosition = position ?? resolveInitialPosition();
        if (!initialPosition) return;

        const startX = event.clientX;
        const startY = event.clientY;

        const handleMove = (moveEvent: MouseEvent) => {
            const next = getClampedPosition(
                initialPosition.left + (moveEvent.clientX - startX),
                initialPosition.top + (moveEvent.clientY - startY),
            );
            if (next) {
                setPosition(next);
            }
        };

        const handleUp = () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
    }, [getClampedPosition, position, resolveInitialPosition]);

    return {
        panelRef,
        floatingStyle: position ? {
            left: position.left,
            top: position.top,
            right: 'auto',
            bottom: 'auto',
        } satisfies CSSProperties : undefined,
        startDrag,
    };
};
