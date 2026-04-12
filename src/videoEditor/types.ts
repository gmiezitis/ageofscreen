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
export type GlobalCursorStyle = 'original' | 'arrow' | 'hand' | 'text';
export const CURSOR_HIGHLIGHT_SHAPES = ['glow', 'circle', 'heart', 'arrow', 'text_cursor'] as const;
export type CursorHighlightShape = (typeof CURSOR_HIGHLIGHT_SHAPES)[number];
export const CURSOR_HIGHLIGHT_MIN_SIZE = 1;
export const CURSOR_HIGHLIGHT_MAX_SIZE = 8;
export const CURSOR_HIGHLIGHT_MIN_OPACITY = 0.18;
export const CURSOR_HIGHLIGHT_MAX_OPACITY = 0.8;
export const CURSOR_HIGHLIGHT_MIN_MOTION_HOLD_SECONDS = 0.2;
export const CURSOR_HIGHLIGHT_MAX_MOTION_HOLD_SECONDS = 3;
export const CURSOR_HIGHLIGHT_DEFAULT_MOTION_HOLD_SECONDS = 1;

export interface CursorHighlightSettings {
    enabled: boolean;
    shape: CursorHighlightShape;
    color: string;
    size: number;
    opacity: number;
    smoothMotion: boolean;
    motionOnly: boolean;
    motionHoldSeconds: number;
}

const BASE_CURSOR_HIGHLIGHT_SETTINGS: CursorHighlightSettings = {
    enabled: false,
    shape: 'glow',
    color: '#0f172a',
    size: 4.5,
    opacity: 0.34,
    smoothMotion: true,
    motionOnly: false,
    motionHoldSeconds: CURSOR_HIGHLIGHT_DEFAULT_MOTION_HOLD_SECONDS,
};

const clampCursorHighlightSize = (value: number): number => Math.max(
    CURSOR_HIGHLIGHT_MIN_SIZE,
    Math.min(CURSOR_HIGHLIGHT_MAX_SIZE, value),
);

const clampCursorHighlightOpacity = (value: number): number => Math.max(
    CURSOR_HIGHLIGHT_MIN_OPACITY,
    Math.min(CURSOR_HIGHLIGHT_MAX_OPACITY, value),
);

export const clampCursorHighlightMotionHoldSeconds = (value: number): number => {
    if (!Number.isFinite(value)) {
        return CURSOR_HIGHLIGHT_DEFAULT_MOTION_HOLD_SECONDS;
    }
    return Math.max(
        CURSOR_HIGHLIGHT_MIN_MOTION_HOLD_SECONDS,
        Math.min(CURSOR_HIGHLIGHT_MAX_MOTION_HOLD_SECONDS, value),
    );
};

export const normalizeCursorHighlightSettings = (
    settings?: Partial<CursorHighlightSettings> | null,
): CursorHighlightSettings => {
    return {
        ...BASE_CURSOR_HIGHLIGHT_SETTINGS,
        ...settings,
        enabled: Boolean(settings?.enabled ?? BASE_CURSOR_HIGHLIGHT_SETTINGS.enabled),
        shape: (settings?.shape as any) === 'rounded_square'
            ? 'circle'
            : (settings?.shape && CURSOR_HIGHLIGHT_SHAPES.includes(settings.shape as any)
                ? (settings.shape as any)
                : BASE_CURSOR_HIGHLIGHT_SETTINGS.shape),
        color: typeof settings?.color === 'string' && settings.color.trim().length > 0
            ? settings.color
            : BASE_CURSOR_HIGHLIGHT_SETTINGS.color,
        size: clampCursorHighlightSize(
            Number.isFinite(settings?.size)
                ? Number(settings?.size)
                : BASE_CURSOR_HIGHLIGHT_SETTINGS.size,
        ),
        opacity: clampCursorHighlightOpacity(
            Number.isFinite(settings?.opacity)
                ? Number(settings?.opacity)
                : BASE_CURSOR_HIGHLIGHT_SETTINGS.opacity,
        ),
        smoothMotion: Boolean(settings?.smoothMotion ?? BASE_CURSOR_HIGHLIGHT_SETTINGS.smoothMotion),
        motionOnly: Boolean(settings?.motionOnly ?? BASE_CURSOR_HIGHLIGHT_SETTINGS.motionOnly),
        motionHoldSeconds: clampCursorHighlightMotionHoldSeconds(
            settings?.motionHoldSeconds ?? BASE_CURSOR_HIGHLIGHT_SETTINGS.motionHoldSeconds,
        ),
    };
};

export const DEFAULT_CURSOR_HIGHLIGHT_SETTINGS: CursorHighlightSettings = {
    ...BASE_CURSOR_HIGHLIGHT_SETTINGS,
};

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
