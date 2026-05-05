import { Monitor } from 'lucide-react';

export interface PlatformPreset {
    id: string;
    name: string;
    icon: typeof Monitor;
    ratio: number | null;
    dimensions?: string;
}

export interface EditorNotification {
    type: 'success' | 'warning' | 'error' | 'info';
    title: string;
    message: string;
    actionLabel?: string;
    onAction?: () => void;
    sticky?: boolean;
    durationMs?: number;
}

export type ExportQuality = 'fast' | 'balanced' | 'high';
export type TransitionType = 'cut' | 'crossfade' | 'dip_to_black';
export type ColorGradePreset = 'none' | 'nordic_cold' | 'vibrant_pop' | 'moody_teal' | 'vintage_film' | 'studio_clean';
export type SmartTrackingProfile = 'standard' | 'smooth_focus';

export interface ClipTransition {
    fromItemId: string;
    toItemId: string;
    type: TransitionType;
}

export interface Segment {
    id: string;
    startTime: number;      // seconds in original video (source start)
    endTime: number;        // seconds in original video (source end)
    timelineStart: number;  // position on timeline (supports gaps)
    thumbnail?: string;     // base64 thumbnail
}

export interface AudioSegment {
    id: string;
    file: string;
    startTime: number;
    duration: number;
    volume: number;
    name: string;
}

export interface OverlayImage {
    id: string;
    file: string;
    thumbnail?: string;
    startTime: number;
    duration: number;
    x: number;
    y: number;
    width: number;
    height: number;
    renderMode?: 'overlay' | 'fullscreen';
}

export interface ImageClip {
    id: string;
    file: string;
    name?: string;
    thumbnail?: string;
    startTime: number;
    duration: number;
}

export interface TextOverlay {
    id: string;
    text: string;
    startTime: number;
    duration: number;
    x: number; // percent
    y: number; // percent
    fontSize: number;
    color: string;
    fontWeight?: 'normal' | 'bold';
    fontFamily?: string;
    backgroundColor?: string;
    backgroundOpacity?: number; // 0-1
    padding?: number; // percent or pixels? let's use percent for consistency
    borderRadius?: number;
    borderWidth?: number;
    borderColor?: string;
    shadowColor?: string;
    shadowBlur?: number;
    shadowOffsetX?: number;
    shadowOffsetY?: number;
}

export interface ZoomArea {
    x: number;      // left % (0-100)
    y: number;      // top % (0-100)
    width: number;  // width % (0-100)
    height: number; // height % (0-100)
}

export type TiltDirection = 'left' | 'right' | 'up' | 'down' | 'orbital';

export interface SmartEffect {
    id: string;
    type: 'zoom' | '3d_tilt' | 'exposure' | 'blur_area' | 'card_flip' | 'breathing' | 'slow_zoom';
    startTime: number;
    duration: number;
    label: string;
    generatedBy?: 'auto_polish' | 'smart_tracking';
    /** Intensity/density 0-100 (default 100) */
    intensity?: number;
    /** Horizontal tilt bias for zoom focus: -100 (left) to +100 (right) */
    tilt?: number;
    /** For zoom/blur_area: region (percentages). Default center 50% */
    zoomArea?: ZoomArea;
    /** Zoom: keep the focus origin attached to the recorded cursor */
    followCursor?: boolean;
    /** Zoom: how strongly the camera follows the cursor (0-100) */
    followCursorIntensity?: number;
    /** Zoom: optional cursor accent while the effect is active */
    cursorStyle?: 'none' | 'ring' | 'spotlight' | 'dot' | 'pulse' | 'halo';
    /** 3d_tilt: direction of the tilt swing */
    tiltDirection?: TiltDirection;
    /** 3d_tilt: snappiness 0-100 (higher = faster snap with more overshoot/bounce) */
    tiltSnap?: number;
}

export type MediaType = 'video' | 'image' | 'audio' | null;
export type ViewMode = 'import' | 'preview';

export interface Keyframe {
    id: string;
    time: number; // Relative to segment start or timeline? Let's say timeline displayTime for now.
    value: number;
}

export interface KeyframeData {
    opacity?: Keyframe[];
    blur?: Keyframe[];
    scale?: Keyframe[];
    x?: Keyframe[];
    y?: Keyframe[];
    rotate?: Keyframe[];
    backgroundColor?: string;
}
