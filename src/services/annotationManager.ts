import { useState, useCallback, useRef } from 'react';
import type {
  AnnotationObject,
  TextAnnotation,
  PenAnnotation,
  LineAnnotation,
  ArrowAnnotation,
  HighlighterAnnotation,
  RectangleAnnotation,
  EllipseAnnotation,
  StepAnnotation,
  BlurAnnotation,
  ImageAnnotation,
  Tool,
  PenSize,
} from '../types';

/**
 * AnnotationManager - Centralized annotation state management
 * 
 * This service encapsulates all annotation-related state and operations,
 * reducing the complexity of App.tsx and promoting clean separation of concerns.
 */

export interface AnnotationState {
  annotations: AnnotationObject[];
  history: AnnotationObject[][];
  selectedAnnotationId: string | null;
  isDraggingAnnotation: boolean;
  dragStartOffset: { x: number; y: number } | null;
  isEditing: boolean;
}

export interface AnnotationActions {
  // Basic operations
  addAnnotation: (annotation: AnnotationObject) => void;
  replaceAnnotations: (annotations: AnnotationObject[]) => void;
  updateAnnotation: (id: string, updates: Partial<AnnotationObject>) => void;
  updateAnnotationLive: (id: string, updates: Partial<AnnotationObject>) => void;
  deleteAnnotation: (id: string) => void;
  clearAnnotations: () => void;
  resetAll: () => void;

  // History operations
  undo: () => boolean;
  redo: () => boolean;
  canUndo: () => boolean;
  canRedo: () => boolean;
  saveStateToHistory: () => void;

  // Selection and editing
  selectAnnotation: (id: string | null) => void;
  startEditing: (id: string) => void;
  stopEditing: () => void;
  updateTextContent: (id: string, content: string) => void;

  // Drag operations
  startDragging: (id: string, offset: { x: number; y: number }) => void;
  stopDragging: () => void;
  updateDragOffset: (offset: { x: number; y: number }) => void;
  isDraggingAnnotation: () => boolean;

  // Batch operations
  updateLastAnnotation: (updates: Partial<AnnotationObject>) => void;
  addPointToLastAnnotation: (point: { x: number; y: number }) => void;

  // Utility
  findAnnotationById: (id: string) => AnnotationObject | undefined;
  getLastAnnotation: () => AnnotationObject | undefined;
}

export interface CreateAnnotationParams {
  tool: Tool;
  point: { x: number; y: number };
  startPoint?: { x: number; y: number };
  endPoint?: { x: number; y: number };
  size?: { width: number; height: number };

  // Tool-specific parameters
  color?: string;
  width?: number;
  penSize?: PenSize;
  content?: string;
  font?: string;
  stepCounter?: number;
  blurMode?: 'spot' | 'focus';
  brushSize?: number;
}

/**
 * Custom hook that provides centralized annotation management
 */
export function useAnnotationManager(): [AnnotationState, AnnotationActions] {
  // Core state
  const [annotations, setAnnotations] = useState<AnnotationObject[]>([]);
  const [history, setHistory] = useState<AnnotationObject[][]>([]);
  const [futureHistory, setFutureHistory] = useState<AnnotationObject[][]>([]);

  // Selection and editing state
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [isDraggingAnnotation, setIsDraggingAnnotation] = useState<boolean>(false);
  const [dragStartOffset, setDragStartOffset] = useState<{ x: number; y: number } | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);

  // Refs for advanced drag operations
  const draggedAnnotationOriginalBoundsRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);
  const draggedAnnotationSnapshotRef = useRef<AnnotationObject | null>(null);

  // Basic operations
  const addAnnotation = useCallback((annotation: AnnotationObject) => {
    setHistory(prev => [...prev, annotations]);
    setFutureHistory([]);
    setAnnotations(prev => [...prev, annotation]);
  }, [annotations]);

  const replaceAnnotations = useCallback((nextAnnotations: AnnotationObject[]) => {
    setAnnotations(nextAnnotations);
    setHistory([]);
    setFutureHistory([]);
    setSelectedAnnotationId((current) => nextAnnotations.some((annotation) => annotation.id === current) ? current : null);
    setIsEditing(false);
    setIsDraggingAnnotation(false);
    setDragStartOffset(null);
    draggedAnnotationOriginalBoundsRef.current = null;
    draggedAnnotationSnapshotRef.current = null;
  }, []);

  const updateAnnotation = useCallback((id: string, updates: Partial<AnnotationObject>) => {
    setHistory(prev => [...prev, annotations]);
    setFutureHistory([]);
    setAnnotations(prev =>
      prev.map(ann =>
        ann.id === id ? { ...ann, ...updates } as AnnotationObject : ann
      )
    );
  }, [annotations]);

  const updateAnnotationLive = useCallback((id: string, updates: Partial<AnnotationObject>) => {
    setAnnotations(prev =>
      prev.map(ann =>
        ann.id === id ? { ...ann, ...updates } as AnnotationObject : ann
      )
    );
  }, []);

  const deleteAnnotation = useCallback((id: string) => {
    setHistory(prev => [...prev, annotations]);
    setFutureHistory([]);
    setAnnotations(prev => prev.filter(ann => ann.id !== id));
    if (selectedAnnotationId === id) {
      setSelectedAnnotationId(null);
      setIsEditing(false);
    }
  }, [annotations, selectedAnnotationId]);

  const clearAnnotations = useCallback(() => {
    // Save current state to history before clearing
    setHistory(prev => [...prev, annotations]);
    setFutureHistory([]);
    setAnnotations([]);
    setSelectedAnnotationId(null);
    setIsEditing(false);
    setIsDraggingAnnotation(false);
    setDragStartOffset(null);
  }, [annotations]);

  const resetAll = useCallback(() => {
    setAnnotations([]);
    setHistory([]);
    setSelectedAnnotationId(null);
    setIsEditing(false);
    setIsDraggingAnnotation(false);
    setDragStartOffset(null);
  }, []);

  // History operations
  const undo = useCallback((): boolean => {
    if (history.length > 0) {
      // Save current state to future history for redo capability
      setFutureHistory(prev => [annotations, ...prev]);
      // Restore previous state
      const previousAnnotations = history[history.length - 1];
      setAnnotations(previousAnnotations);
      setHistory(prev => prev.slice(0, -1));
      return true;
    }
    return false;
  }, [history, annotations]);

  const canUndo = useCallback((): boolean => {
    return history.length > 0;
  }, [history]);

  const redo = useCallback((): boolean => {
    if (futureHistory.length > 0) {
      // Save current state to history before redoing
      setHistory(prev => [...prev, annotations]);
      // Restore future state
      const nextAnnotations = futureHistory[0];
      setAnnotations(nextAnnotations);
      setFutureHistory(prev => prev.slice(1));
      return true;
    }
    return false;
  }, [futureHistory, annotations]);

  const canRedo = useCallback((): boolean => {
    return futureHistory.length > 0;
  }, [futureHistory]);

  const saveStateToHistory = useCallback(() => {
    setHistory(prev => [...prev, annotations]);
    setFutureHistory([]);
  }, [annotations]);

  // Selection and editing
  const selectAnnotation = useCallback((id: string | null) => {
    setSelectedAnnotationId(id);
    if (!id) {
      setIsEditing(false);
    }
  }, []);

  const startEditing = useCallback((id: string) => {
    setSelectedAnnotationId(id);
    setIsEditing(true);
  }, []);

  const stopEditing = useCallback(() => {
    setIsEditing(false);
    setSelectedAnnotationId(null);
  }, []);

  const updateTextContent = useCallback((id: string, content: string) => {
    // We don't save history for every keystroke to avoid bloating history
    setAnnotations(prev =>
      prev.map(ann =>
        ann.id === id && ann.type === 'text'
          ? { ...ann, content } as TextAnnotation
          : ann
      )
    );
  }, []);

  // Drag operations
  const startDragging = useCallback((id: string, offset: { x: number; y: number }) => {
    const annotation = annotations.find(ann => ann.id === id);
    if (annotation) {
      // Store the original annotation for reference
      draggedAnnotationSnapshotRef.current = { ...annotation };
      setSelectedAnnotationId(id);
      setIsDraggingAnnotation(true);
      setDragStartOffset(offset);
    }
  }, [annotations]);

  const stopDragging = useCallback(() => {
    setIsDraggingAnnotation(false);
    setDragStartOffset(null);
    draggedAnnotationOriginalBoundsRef.current = null;
    draggedAnnotationSnapshotRef.current = null;
  }, []);

  const updateDragOffset = useCallback((offset: { x: number; y: number }) => {
    if (selectedAnnotationId && isDraggingAnnotation && draggedAnnotationSnapshotRef.current && dragStartOffset) {
      // Calculate the movement delta from the initial drag position
      const deltaX = offset.x - dragStartOffset.x;
      const deltaY = offset.y - dragStartOffset.y;

      const originalAnn = draggedAnnotationSnapshotRef.current;

      // Create the moved annotation based on the original position plus delta
      let movedAnnotation: AnnotationObject;

      switch (originalAnn.type) {
        case 'pen':
        case 'highlighter':
          movedAnnotation = {
            ...originalAnn,
            points: originalAnn.points.map(point => ({
              x: point.x + deltaX,
              y: point.y + deltaY
            }))
          };
          break;
        case 'arrow':
        case 'line':
          movedAnnotation = {
            ...originalAnn,
            startX: originalAnn.startX + deltaX,
            startY: originalAnn.startY + deltaY,
            endX: originalAnn.endX + deltaX,
            endY: originalAnn.endY + deltaY
          };
          break;
        case 'rectangle':
          movedAnnotation = {
            ...originalAnn,
            x: originalAnn.x + deltaX,
            y: originalAnn.y + deltaY
          };
          break;
        case 'ellipse':
          movedAnnotation = {
            ...originalAnn,
            cx: originalAnn.cx + deltaX,
            cy: originalAnn.cy + deltaY
          };
          break;
        case 'text':
          movedAnnotation = {
            ...originalAnn,
            x: originalAnn.x + deltaX,
            y: originalAnn.y + deltaY,
            boxX: originalAnn.boxX !== undefined ? originalAnn.boxX + deltaX : undefined,
            boxY: originalAnn.boxY !== undefined ? originalAnn.boxY + deltaY : undefined
          };
          break;
        case 'step':
          movedAnnotation = {
            ...originalAnn,
            cx: originalAnn.cx + deltaX,
            cy: originalAnn.cy + deltaY
          };
          break;
        case 'blur':
          movedAnnotation = {
            ...originalAnn,
            points: originalAnn.points.map(point => ({
              x: point.x + deltaX,
              y: point.y + deltaY
            }))
          };
          break;
        case 'image':
          movedAnnotation = {
            ...originalAnn,
            x: originalAnn.x + deltaX,
            y: originalAnn.y + deltaY,
          } as ImageAnnotation;
          break;
        default:
          movedAnnotation = originalAnn;
      }

      // Update the annotation in the array
      setAnnotations(prev => prev.map(ann =>
        ann.id === selectedAnnotationId ? movedAnnotation : ann
      ));
    }
  }, [selectedAnnotationId, isDraggingAnnotation, dragStartOffset]);

  const isDraggingAnnotationFn = useCallback(() => {
    return isDraggingAnnotation;
  }, [isDraggingAnnotation]); // ✅ Fixed: Now properly tracks dragging state

  // Batch operations for drawing tools
  const updateLastAnnotation = useCallback((updates: Partial<AnnotationObject>) => {
    setAnnotations(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const lastIndex = updated.length - 1;
      const lastAnnotation = updated[lastIndex];

      // Type-safe update that preserves the annotation structure
      updated[lastIndex] = {
        ...lastAnnotation,
        ...updates,
        // Ensure type is preserved from the original annotation
        type: lastAnnotation.type
      } as AnnotationObject;

      return updated;
    });
  }, []);

  const addPointToLastAnnotation = useCallback((point: { x: number; y: number }) => {
    setAnnotations(prev => {
      if (prev.length === 0) return prev;
      const updated = [...prev];
      const lastAnnotation = updated[updated.length - 1];

      if (lastAnnotation.type === 'pen' ||
        lastAnnotation.type === 'highlighter' ||
        (lastAnnotation.type === 'blur' && 'points' in lastAnnotation)) {
        const pointsAnnotation = lastAnnotation as PenAnnotation | HighlighterAnnotation | BlurAnnotation;
        if (pointsAnnotation.points) {
          pointsAnnotation.points.push(point);
        }
      }

      return updated;
    });
  }, []);

  // Utility functions
  const findAnnotationById = useCallback((id: string): AnnotationObject | undefined => {
    return annotations.find(ann => ann.id === id);
  }, [annotations]);

  const getLastAnnotation = useCallback((): AnnotationObject | undefined => {
    return annotations.length > 0 ? annotations[annotations.length - 1] : undefined;
  }, [annotations]);

  // Factory functions for creating annotations
  const createPenAnnotation = useCallback((params: CreateAnnotationParams): PenAnnotation => ({
    id: `pen_${Date.now()}`,
    type: 'pen',
    points: [params.point],
    color: params.color || '#FF0000',
    width: params.width || 5,
    size: params.penSize || 'm',
  }), []);

  const createHighlighterAnnotation = useCallback((params: CreateAnnotationParams): HighlighterAnnotation => ({
    id: `highlighter_${Date.now()}`,
    type: 'highlighter',
    points: [params.point],
    color: params.color || '#FFFF00',
    width: params.width || 16,
    size: params.penSize || 'm',
  }), []);

  const createTextAnnotation = useCallback((params: CreateAnnotationParams): TextAnnotation => ({
    id: `text_${Date.now()}`,
    type: 'text',
    x: params.point.x,
    y: params.point.y,
    content: params.content || '',
    color: params.color || '#000000',
    font: params.font || '16px sans-serif',
    size: params.penSize || 'm',
  }), []);

  const createArrowAnnotation = useCallback((params: CreateAnnotationParams): ArrowAnnotation => {
    if (!params.startPoint || !params.endPoint) {
      throw new Error('Arrow annotation requires startPoint and endPoint');
    }
    return {
      id: `arrow_${Date.now()}`,
      type: 'arrow',
      startX: params.startPoint.x,
      startY: params.startPoint.y,
      endX: params.endPoint.x,
      endY: params.endPoint.y,
      color: params.color || '#FF0000',
      width: params.width || 5,
      size: params.penSize || 'm',
    };
  }, []);

  const createLineAnnotation = useCallback((params: CreateAnnotationParams): LineAnnotation => {
    if (!params.startPoint || !params.endPoint) {
      throw new Error('Line annotation requires startPoint and endPoint');
    }
    return {
      id: `line_${Date.now()}`,
      type: 'line',
      startX: params.startPoint.x,
      startY: params.startPoint.y,
      endX: params.endPoint.x,
      endY: params.endPoint.y,
      color: params.color || '#FF0000',
      width: params.width || 5,
      size: params.penSize || 'm',
    };
  }, []);

  const createRectangleAnnotation = useCallback((params: CreateAnnotationParams): RectangleAnnotation => {
    if (!params.size) {
      throw new Error('Rectangle annotation requires size');
    }
    return {
      id: `rectangle_${Date.now()}`,
      type: 'rectangle',
      x: params.point.x,
      y: params.point.y,
      width: params.size.width,
      height: params.size.height,
      color: params.color || '#FF0000',
      lineWidth: params.width || 5,
      size: params.penSize || 'm',
    };
  }, []);

  const createEllipseAnnotation = useCallback((params: CreateAnnotationParams): EllipseAnnotation => {
    if (!params.size) {
      throw new Error('Ellipse annotation requires size');
    }
    return {
      id: `ellipse_${Date.now()}`,
      type: 'ellipse',
      cx: params.point.x + params.size.width / 2,
      cy: params.point.y + params.size.height / 2,
      rx: params.size.width / 2,
      ry: params.size.height / 2,
      color: params.color || '#FF0000',
      lineWidth: params.width || 5,
      size: params.penSize || 'm',
    };
  }, []);

  const createStepAnnotation = useCallback((params: CreateAnnotationParams): StepAnnotation => {
    const fontSize = params.width || 16;
    return {
      id: `step_${Date.now()}`,
      type: 'step',
      cx: params.point.x,
      cy: params.point.y,
      radius: fontSize * 0.8,
      number: params.stepCounter ?? 1,
      color: params.color || '#FF0000',
      fontSize: fontSize,
      size: params.penSize || 'm',
    };
  }, []);

  const createBlurAnnotation = useCallback((params: CreateAnnotationParams): BlurAnnotation => ({
    id: `blur_${Date.now()}`,
    type: 'blur',
    mode: 'spot', // Only support spot mode for now
    points: [params.point],
    brushSize: params.brushSize || 10,
  }), []);

  // Enhanced addAnnotation that can create annotations from parameters
  const createAndAddAnnotation = useCallback((params: CreateAnnotationParams): any => {
    let annotation: any;

    switch (params.tool) {
      case 'pen':
        annotation = createPenAnnotation(params);
        break;
      case 'highlighter':
        annotation = createHighlighterAnnotation(params);
        break;
      case 'text':
        annotation = createTextAnnotation(params);
        break;
      case 'arrow':
        annotation = createArrowAnnotation(params);
        break;
      case 'line':
        annotation = createLineAnnotation(params);
        break;
      case 'rectangle':
        annotation = createRectangleAnnotation(params);
        break;
      case 'ellipse':
        annotation = createEllipseAnnotation(params);
        break;
      case 'step':
        annotation = createStepAnnotation(params);
        break;
      case 'blur':
        annotation = createBlurAnnotation(params);
        break;
      default:
        throw new Error(`Unsupported tool: ${params.tool}`);
    }

    addAnnotation(annotation);
    return annotation;
  }, [
    addAnnotation,
    createPenAnnotation,
    createHighlighterAnnotation,
    createTextAnnotation,
    createArrowAnnotation,
    createLineAnnotation,
    createRectangleAnnotation,
    createEllipseAnnotation,
    createStepAnnotation,
    createBlurAnnotation,
  ]);

  // State object
  const state: AnnotationState = {
    annotations,
    history,
    selectedAnnotationId,
    isDraggingAnnotation,
    dragStartOffset,
    isEditing,
  };

  // Actions object
  const actions: AnnotationActions = {
    addAnnotation,
    replaceAnnotations,
    updateAnnotation,
    updateAnnotationLive,
    deleteAnnotation,
    clearAnnotations,
    resetAll,
    undo,
    redo,
    canUndo,
    canRedo,
    saveStateToHistory,
    selectAnnotation,
    startEditing,
    stopEditing,
    updateTextContent,
    startDragging,
    stopDragging,
    updateDragOffset,
    isDraggingAnnotation: isDraggingAnnotationFn,
    updateLastAnnotation,
    addPointToLastAnnotation,
    findAnnotationById,
    getLastAnnotation,
    // Add the factory function to actions
    createAndAddAnnotation,
  } as AnnotationActions & { createAndAddAnnotation: typeof createAndAddAnnotation };

  return [state, actions];
}

// Export individual factory functions for external use
export const AnnotationFactory = {
  createPenAnnotation: (params: CreateAnnotationParams): PenAnnotation => ({
    id: `pen_${Date.now()}`,
    type: 'pen',
    points: [params.point],
    color: params.color || '#FF0000',
    width: params.width || 5,
    size: params.penSize || 'm',
  }),

  createTextAnnotation: (params: CreateAnnotationParams): TextAnnotation => ({
    id: `text_${Date.now()}`,
    type: 'text',
    x: params.point.x,
    y: params.point.y,
    content: params.content || '',
    color: params.color || '#000000',
    font: params.font || '16px sans-serif',
    size: params.penSize || 'm',
  }),

  // Add other factory functions as needed
}; 
