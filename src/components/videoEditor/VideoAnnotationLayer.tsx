import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, GripHorizontal, ListOrdered, MousePointer2, PenLine, Square, Trash2 } from 'lucide-react';
import { useAnnotationManager } from '../../services/annotationManager';
import { CanvasRenderer } from '../../services/canvasRenderer';
import type { AnnotationObject, ArrowAnnotation, PenAnnotation, RectangleAnnotation, StepAnnotation, Tool } from '../../types';
import { useFloatingPanelPosition } from './overlays/useFloatingPanelPosition';

interface VideoAnnotationLayerProps {
    containerRef: React.RefObject<HTMLDivElement>;
    panelHostElement?: HTMLElement | null;
    enabled?: boolean;
    onBackgroundClick?: () => void;
    onRequestClose?: () => void;
    displayTime: number;
    annotations: AnnotationObject[];
    onAnnotationsChange: (annotations: AnnotationObject[]) => void;
    onCanvasSizeChange: (size: { width: number; height: number } | null) => void;
    toolbarStyle?: React.CSSProperties;
    panelLayout?: 'floating' | 'leftDocked';
}

const TOOL_BUTTON_STYLE: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(15,23,42,0.82)',
    color: '#e5eefc',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    backdropFilter: 'blur(10px)',
    boxShadow: '0 10px 24px rgba(0,0,0,0.2)',
};

const DEFAULT_ANNOTATION_COLOR = '#ef4444';
const ANNOTATION_DURATION_OPTIONS: ReadonlyArray<{ value: number | null; label: string }> = [
    { value: 1, label: '1s' },
    { value: 2, label: '2s' },
    { value: 4, label: '4s' },
    { value: 6, label: '6s' },
    { value: null, label: 'Full' },
];

export const VideoAnnotationLayer: React.FC<VideoAnnotationLayerProps> = ({
    containerRef,
    panelHostElement,
    enabled = true,
    onBackgroundClick,
    onRequestClose,
    displayTime,
    annotations,
    onAnnotationsChange,
    onCanvasSizeChange,
    toolbarStyle,
    panelLayout = 'floating',
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const panelContainerRef = useMemo(
        () => (panelHostElement
            ? ({ current: panelHostElement } as React.RefObject<HTMLElement | null>)
            : containerRef),
        [containerRef, panelHostElement],
    );
    const { panelRef, floatingStyle, startDrag } = useFloatingPanelPosition(panelContainerRef, toolbarStyle);
    const isDocked = panelLayout === 'leftDocked';
    const [state, actions] = useAnnotationManager();
    const [selectedTool, setSelectedTool] = useState<Tool>('move');
    const [stepCounter, setStepCounter] = useState(1);
    const [annotationDuration, setAnnotationDuration] = useState<number | null>(1);
    const [annotationColor, setAnnotationColor] = useState(DEFAULT_ANNOTATION_COLOR);
    const draftAnnotationIdRef = useRef<string | null>(null);
    const dragStartPointRef = useRef<{ x: number; y: number } | null>(null);
    const isPointerDownRef = useRef(false);
    const latestAnnotationsRef = useRef(state.annotations);
    const lastAppliedPropAnnotationsRef = useRef(annotations);

    useEffect(() => {
        latestAnnotationsRef.current = state.annotations;
    }, [state.annotations]);

    useEffect(() => {
        if (annotations === lastAppliedPropAnnotationsRef.current) return;
        lastAppliedPropAnnotationsRef.current = annotations;
        actions.replaceAnnotations(annotations);
    }, [actions, annotations]);

    const commitAnnotations = useCallback((nextAnnotations: AnnotationObject[] = latestAnnotationsRef.current) => {
        latestAnnotationsRef.current = nextAnnotations;
        lastAppliedPropAnnotationsRef.current = nextAnnotations;
        onAnnotationsChange(nextAnnotations);
    }, [onAnnotationsChange]);

    const selectedAnnotation = useMemo(
        () => state.annotations.find((annotation) => annotation.id === state.selectedAnnotationId) ?? null,
        [state.annotations, state.selectedAnnotationId]
    );
    const activeAnnotations = useMemo(
        () => state.annotations.filter((annotation) => {
            const startTime = annotation.startTime ?? 0;
            const duration = annotation.duration;
            if (displayTime < startTime) return false;
            if (typeof duration === 'number') {
                return displayTime < startTime + duration;
            }
            return true;
        }),
        [displayTime, state.annotations]
    );

    const annotationCursor = useMemo(() => {
        if (!enabled) return 'default';
        return selectedTool === 'move' || selectedTool === 'select' ? 'default' : 'crosshair';
    }, [enabled, selectedTool]);

    const findAnnotationAtPoint = useCallback((x: number, y: number): AnnotationObject | null => {
        for (let i = activeAnnotations.length - 1; i >= 0; i -= 1) {
            const ann = activeAnnotations[i];
            const bounds = CanvasRenderer.getAnnotationBounds(ann, null);
            if (!bounds) continue;
            if (x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height) {
                return ann;
            }
        }
        return null;
    }, [activeAnnotations]);

    const getCanvasPoint = useCallback((clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return null;
        const rect = container.getBoundingClientRect();
        if (!rect.width || !rect.height) return null;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY,
        };
    }, [containerRef]);

    useEffect(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;

        const updateCanvasSize = () => {
            const rect = container.getBoundingClientRect();
            const width = Math.max(1, Math.round(rect.width));
            const height = Math.max(1, Math.round(rect.height));
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
            onCanvasSizeChange({ width, height });
        };

        const observer = new ResizeObserver(updateCanvasSize);
        observer.observe(container);
        updateCanvasSize();
        return () => {
            onCanvasSizeChange(null);
            observer.disconnect();
        };
    }, [containerRef, onCanvasSizeChange]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        CanvasRenderer.renderAnnotations(ctx, canvas, activeAnnotations, {
            selectedAnnotationId: state.selectedAnnotationId,
            isEditing: false,
            scrollOffset: { x: 0, y: 0 },
        });
    }, [activeAnnotations, state.selectedAnnotationId]);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!state.selectedAnnotationId) return;
            if (event.key !== 'Delete' && event.key !== 'Backspace') return;
            const target = event.target as HTMLElement | null;
            const isTyping = !!target && ['INPUT', 'TEXTAREA'].includes(target.tagName);
            if (isTyping) return;
            event.preventDefault();
            const nextAnnotations = latestAnnotationsRef.current.filter((annotation) => annotation.id !== state.selectedAnnotationId);
            actions.deleteAnnotation(state.selectedAnnotationId);
            commitAnnotations(nextAnnotations);
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [actions, commitAnnotations, state.selectedAnnotationId]);

    const finishInteraction = useCallback((shouldCommit = false) => {
        const wasInteracting = isPointerDownRef.current || !!draftAnnotationIdRef.current || state.isDraggingAnnotation;
        if (state.isDraggingAnnotation) {
            actions.stopDragging();
        }
        draftAnnotationIdRef.current = null;
        dragStartPointRef.current = null;
        isPointerDownRef.current = false;
        if (shouldCommit && wasInteracting) {
            requestAnimationFrame(() => commitAnnotations());
        }
    }, [actions, commitAnnotations, state.isDraggingAnnotation]);

    useEffect(() => {
        if (!enabled) {
            finishInteraction(true);
            setSelectedTool('move');
        }
    }, [enabled, finishInteraction]);

    const buildTimingFields = useCallback(() => ({
        startTime: displayTime,
        duration: annotationDuration ?? undefined,
    }), [annotationDuration, displayTime]);

    const handleDurationChange = useCallback((value: string) => {
        const nextDuration = value === 'full' ? null : Number(value);
        setAnnotationDuration(nextDuration);
        if (selectedAnnotation) {
            const nextAnnotations = latestAnnotationsRef.current.map((annotation) => (
                annotation.id === selectedAnnotation.id
                    ? { ...annotation, duration: nextDuration ?? undefined } as AnnotationObject
                    : annotation
            ));
            actions.updateAnnotation(selectedAnnotation.id, {
                duration: nextDuration ?? undefined,
            } as Partial<AnnotationObject>);
            commitAnnotations(nextAnnotations);
        }
    }, [actions, commitAnnotations, selectedAnnotation]);

    const handleColorChange = useCallback((value: string) => {
        setAnnotationColor(value);
        if (!selectedAnnotation) return;
        const nextAnnotations = latestAnnotationsRef.current.map((annotation) => (
            annotation.id === selectedAnnotation.id
                ? { ...annotation, color: value } as AnnotationObject
                : annotation
        ));
        actions.updateAnnotation(selectedAnnotation.id, {
            color: value,
        } as Partial<AnnotationObject>);
        commitAnnotations(nextAnnotations);
    }, [actions, commitAnnotations, selectedAnnotation]);

    const handleToolSelect = useCallback((tool: Tool) => {
        if (tool === 'move') {
            finishInteraction(true);
            setSelectedTool('move');
            return;
        }
        setSelectedTool(tool);
    }, [finishInteraction]);

    const handlePointerMove = useCallback((clientX: number, clientY: number) => {
        if (!enabled || !isPointerDownRef.current) return;
        const point = getCanvasPoint(clientX, clientY);
        if (!point) return;

        if (state.isDraggingAnnotation) {
            actions.updateDragOffset(point);
            return;
        }

        if (selectedTool === 'pen') {
            const current = latestAnnotationsRef.current;
            const lastAnnotation = current[current.length - 1];
            if (lastAnnotation?.type === 'pen') {
                latestAnnotationsRef.current = [
                    ...current.slice(0, -1),
                    { ...lastAnnotation, points: [...lastAnnotation.points, point] },
                ];
            }
            actions.addPointToLastAnnotation(point);
            return;
        }

        if (selectedTool === 'arrow' && draftAnnotationIdRef.current) {
            const current = latestAnnotationsRef.current;
            const lastAnnotation = current[current.length - 1];
            if (lastAnnotation?.type === 'arrow') {
                latestAnnotationsRef.current = [
                    ...current.slice(0, -1),
                    { ...lastAnnotation, endX: point.x, endY: point.y },
                ];
            }
            actions.updateLastAnnotation({
                endX: point.x,
                endY: point.y,
            } as Partial<AnnotationObject>);
            return;
        }

        if (selectedTool === 'rectangle' && draftAnnotationIdRef.current && dragStartPointRef.current) {
            const start = dragStartPointRef.current;
            const current = latestAnnotationsRef.current;
            const lastAnnotation = current[current.length - 1];
            if (lastAnnotation?.type === 'rectangle') {
                latestAnnotationsRef.current = [
                    ...current.slice(0, -1),
                    {
                        ...lastAnnotation,
                        x: Math.min(start.x, point.x),
                        y: Math.min(start.y, point.y),
                        width: Math.abs(point.x - start.x),
                        height: Math.abs(point.y - start.y),
                    },
                ];
            }
            actions.updateLastAnnotation({
                x: Math.min(start.x, point.x),
                y: Math.min(start.y, point.y),
                width: Math.abs(point.x - start.x),
                height: Math.abs(point.y - start.y),
            } as Partial<AnnotationObject>);
        }
    }, [actions, enabled, getCanvasPoint, selectedTool, state.isDraggingAnnotation]);

    const handleMouseDown = useCallback((event: React.MouseEvent<HTMLCanvasElement>) => {
        if (!enabled) return;
        event.preventDefault();
        event.stopPropagation();
        const point = getCanvasPoint(event.clientX, event.clientY);
        if (!point) return;

        if (selectedTool === 'move' || selectedTool === 'select') {
            const hit = findAnnotationAtPoint(point.x, point.y);
            actions.selectAnnotation(hit?.id ?? null);
            if (hit) {
                actions.startDragging(hit.id, point);
                isPointerDownRef.current = true;
            } else {
                onBackgroundClick?.();
            }
            return;
        }

        if (selectedTool === 'step') {
            const annotation: StepAnnotation = {
                id: `video_step_${Date.now()}`,
                type: 'step',
                ...buildTimingFields(),
                cx: point.x,
                cy: point.y,
                radius: 18,
                number: stepCounter,
                color: annotationColor,
                fontSize: 18,
                size: 'm',
            };
            actions.addAnnotation(annotation);
            actions.selectAnnotation(annotation.id);
            latestAnnotationsRef.current = [...latestAnnotationsRef.current, annotation];
            setStepCounter((value) => value + 1);
            setSelectedTool('move');
            commitAnnotations(latestAnnotationsRef.current);
            return;
        }

        if (selectedTool === 'pen') {
            const annotation: PenAnnotation = {
                id: `video_pen_${Date.now()}`,
                type: 'pen',
                ...buildTimingFields(),
                points: [point],
                color: annotationColor,
                width: 4,
                size: 'm',
            };
            actions.addAnnotation(annotation);
            actions.selectAnnotation(annotation.id);
            latestAnnotationsRef.current = [...latestAnnotationsRef.current, annotation];
            draftAnnotationIdRef.current = annotation.id;
            dragStartPointRef.current = point;
            isPointerDownRef.current = true;
            return;
        }

        if (selectedTool === 'rectangle') {
            const annotation: RectangleAnnotation = {
                id: `video_rectangle_${Date.now()}`,
                type: 'rectangle',
                ...buildTimingFields(),
                x: point.x,
                y: point.y,
                width: 0,
                height: 0,
                color: annotationColor,
                lineWidth: 4,
                size: 'm',
            };
            actions.addAnnotation(annotation);
            actions.selectAnnotation(annotation.id);
            latestAnnotationsRef.current = [...latestAnnotationsRef.current, annotation];
            draftAnnotationIdRef.current = annotation.id;
            dragStartPointRef.current = point;
            isPointerDownRef.current = true;
            return;
        }

        if (selectedTool === 'arrow') {
            const annotation: ArrowAnnotation = {
                id: `video_arrow_${Date.now()}`,
                type: 'arrow',
                ...buildTimingFields(),
                startX: point.x,
                startY: point.y,
                endX: point.x,
                endY: point.y,
                color: annotationColor,
                width: 5,
                size: 'm',
            };
            actions.addAnnotation(annotation);
            actions.selectAnnotation(annotation.id);
            latestAnnotationsRef.current = [...latestAnnotationsRef.current, annotation];
            draftAnnotationIdRef.current = annotation.id;
            dragStartPointRef.current = point;
            isPointerDownRef.current = true;
        }
    }, [actions, annotationColor, buildTimingFields, commitAnnotations, enabled, findAnnotationAtPoint, getCanvasPoint, onBackgroundClick, onRequestClose, selectedTool, stepCounter]);

    const handleMouseUp = useCallback(() => {
        finishInteraction(true);
    }, [finishInteraction]);

    useEffect(() => {
        if (!enabled) return;

        const handleWindowMove = (event: MouseEvent) => {
            handlePointerMove(event.clientX, event.clientY);
        };
        const handleWindowUp = () => {
            if (!isPointerDownRef.current) return;
            handleMouseUp();
        };

        window.addEventListener('mousemove', handleWindowMove);
        window.addEventListener('mouseup', handleWindowUp);
        return () => {
            window.removeEventListener('mousemove', handleWindowMove);
            window.removeEventListener('mouseup', handleWindowUp);
        };
    }, [enabled, handleMouseUp, handlePointerMove]);

    const panel = enabled ? (
        <div
            ref={panelRef}
            style={{
                position: 'absolute',
                top: 14,
                left: 14,
                zIndex: 42,
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'flex-start',
                gap: 6,
                padding: 8,
                maxWidth: 'min(340px, calc(100% - 28px))',
                borderRadius: 14,
                background: 'rgba(15,23,42,0.72)',
                border: '1px solid rgba(255,255,255,0.10)',
                backdropFilter: 'blur(16px)',
                pointerEvents: 'auto',
                boxShadow: '0 20px 48px rgba(2,6,23,0.34)',
                ...(isDocked ? toolbarStyle : { ...toolbarStyle, ...floatingStyle }),
            }}
            onMouseDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
        >
            {!isDocked && (
                <button
                    type="button"
                    title="Drag annotation tools"
                    onMouseDown={startDrag}
                    onClick={(event) => event.preventDefault()}
                    style={{
                        ...TOOL_BUTTON_STYLE,
                        width: 24,
                        height: 24,
                        cursor: 'grab',
                        color: 'rgba(226,232,240,0.78)',
                        boxShadow: 'none',
                        flexShrink: 0,
                    }}
                >
                    <GripHorizontal size={13} />
                </button>
            )}
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(226,232,240,0.78)', marginRight: 4 }}>
                Annotate
            </div>
            {[
                { id: 'move' as Tool, icon: MousePointer2, title: 'Move annotations' },
                { id: 'pen' as Tool, icon: PenLine, title: 'Draw' },
                { id: 'arrow' as Tool, icon: ArrowUpRight, title: 'Arrow' },
                { id: 'rectangle' as Tool, icon: Square, title: 'Rectangle' },
                { id: 'step' as Tool, icon: ListOrdered, title: 'Step counter' },
            ].map((item) => {
                const Icon = item.icon;
                const active = selectedTool === item.id;
                return (
                    <button
                        key={item.id}
                        type="button"
                        title={item.title}
                        onClick={() => handleToolSelect(item.id)}
                        style={{
                            ...TOOL_BUTTON_STYLE,
                            background: active ? 'linear-gradient(135deg, rgba(34,197,94,0.9), rgba(16,185,129,0.75))' : TOOL_BUTTON_STYLE.background,
                            color: active ? '#04130a' : TOOL_BUTTON_STYLE.color,
                            border: active ? '1px solid rgba(16,185,129,0.95)' : TOOL_BUTTON_STYLE.border,
                        }}
                    >
                        <Icon size={14} />
                    </button>
                );
            })}
            <button
                type="button"
                title="Delete all annotations"
                onClick={() => {
                    if (state.annotations.length === 0) return;
                    actions.clearAnnotations();
                    commitAnnotations([]);
                }}
                disabled={state.annotations.length === 0}
                style={{
                    ...TOOL_BUTTON_STYLE,
                    opacity: state.annotations.length > 0 ? 1 : 0.45,
                    color: state.annotations.length > 0 ? '#fca5a5' : '#94a3b8',
                }}
            >
                <Trash2 size={14} />
            </button>
            <select
                value={
                    selectedAnnotation
                        ? (selectedAnnotation.duration == null ? 'full' : String(selectedAnnotation.duration))
                        : (annotationDuration == null ? 'full' : String(annotationDuration))
                }
                onChange={(event) => handleDurationChange(event.target.value)}
                title="Annotation duration"
                style={{
                    background: 'rgba(15,23,42,0.82)',
                    color: '#e5eefc',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    padding: '0 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    minWidth: 64,
                    outline: 'none',
                    cursor: 'pointer',
                }}
            >
                {ANNOTATION_DURATION_OPTIONS.map((option) => (
                    <option key={option.label} value={option.value == null ? 'full' : String(option.value)}>
                        {option.label}
                    </option>
                ))}
            </select>
            <input
                type="color"
                value={annotationColor}
                onChange={(event) => handleColorChange(event.target.value)}
                title="Annotation color"
                style={{
                    width: 30,
                    height: 30,
                    borderRadius: 8,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(15,23,42,0.82)',
                    padding: 2,
                    cursor: 'pointer',
                }}
            />
        </div>
    ) : null;

    return (
        <>
            {panel && panelHostElement
                ? createPortal(panel, panelHostElement)
                : panel}
            <canvas
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{
                    position: 'absolute',
                    inset: 0,
                    zIndex: 18,
                    pointerEvents: enabled ? 'auto' : 'none',
                    cursor: annotationCursor,
                }}
            />
        </>
    );
};
