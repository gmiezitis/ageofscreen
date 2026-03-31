import { useState, useRef } from 'react';
import * as THREE from 'three';
import { Segment, AudioSegment, SmartEffect, OverlayImage, TextOverlay, ImageClip, MediaType, KeyframeData, ExportQuality, TransitionType, ColorGradePreset, SmartTrackingProfile, ClipTransition } from './types';
import type { AnnotationObject } from '../types';
import { useCrop } from './useCrop';

export const useVideoEditorState = () => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const thumbnailVideoRef = useRef<HTMLVideoElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const threeContainerRef = useRef<HTMLDivElement>(null);

    // Three.js Refs
    const threeRendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const threeSceneRef = useRef<THREE.Scene | null>(null);
    const threeCameraRef = useRef<THREE.PerspectiveCamera | null>(null);
    const videoTextureRef = useRef<THREE.VideoTexture | null>(null);
    const videoPlaneRef = useRef<THREE.Mesh | null>(null);
    const audioRefs = useRef<{ [key: string]: HTMLAudioElement }>({});
    const playheadRef = useRef<HTMLDivElement>(null);

    // Media State
    const [mediaType, setMediaType] = useState<MediaType>(null);
    const [mediaPath, setMediaPath] = useState<string | null>(null);
    const [mediaName, setMediaName] = useState<string>('');
    const [recordedCursorData, setRecordedCursorData] = useState<any[]>([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [displayTime, setDisplayTime] = useState(0);
    const [selectedPlatform, setSelectedPlatform] = useState('original');
    const [isExporting, setIsExporting] = useState(false);
    const [exportQuality, setExportQuality] = useState<ExportQuality>('high');
    const [transitionType, setTransitionType] = useState<TransitionType>('crossfade');
    const [clipTransitions, setClipTransitions] = useState<ClipTransition[]>([]);
    const [isAutoPolishing, setIsAutoPolishing] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [mediaLoaded, setMediaLoaded] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [autoPolishTrackingProfile, setAutoPolishTrackingProfile] = useState<SmartTrackingProfile>('smooth_focus');

    // Timeline State
    const [segments, setSegments] = useState<Segment[]>([]);
    const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const [draggedSegmentId, setDraggedSegmentId] = useState<string | null>(null);
    const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

    const [audioSegments, setAudioSegments] = useState<AudioSegment[]>([]);
    const [selectedAudioId, setSelectedAudioId] = useState<string | null>(null);
    const [draggedAudioId, setDraggedAudioId] = useState<string | null>(null);

    const [smartEffects, setSmartEffects] = useState<SmartEffect[]>([]);
    const [selectedEffectId, setSelectedEffectId] = useState<string | null>(null);
    const [draggingEffectId, setDraggingEffectId] = useState<string | null>(null);
    const [effectDragInfo, setEffectDragInfo] = useState<{ startX: number; initialStart: number } | null>(null);

    const [overlayImages, setOverlayImages] = useState<OverlayImage[]>([]);
    const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
    const [draggedOverlayId, setDraggedOverlayId] = useState<string | null>(null);
    const [imageClips, setImageClips] = useState<ImageClip[]>([]);
    const [selectedImageClipId, setSelectedImageClipId] = useState<string | null>(null);
    const [draggedImageClipId, setDraggedImageClipId] = useState<string | null>(null);
    const [textOverlays, setTextOverlays] = useState<TextOverlay[]>([]);
    const [selectedTextOverlayId, setSelectedTextOverlayId] = useState<string | null>(null);
    const [draggedTextOverlayId, setDraggedTextOverlayId] = useState<string | null>(null);
    const [annotationOverlays, setAnnotationOverlays] = useState<AnnotationObject[]>([]);
    const [annotationCanvasSize, setAnnotationCanvasSize] = useState<{ width: number; height: number } | null>(null);

    const [zoom, setZoom] = useState(0.8);
    const [videoMuted, setVideoMuted] = useState(false);
    const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

    // Crop Mode
    const [cropMode, setCropMode] = useState<'fit' | 'fill'>('fit');
    const [cropPosition, setCropPosition] = useState({ x: 50, y: 50 });
    const [isDraggingCrop, setIsDraggingCrop] = useState(false);
    const [cropDragStart, setCropDragStart] = useState({ x: 0, y: 0 });

    const [resizing, setResizing] = useState<{
        id: string;
        type: 'video' | 'audio' | 'overlay' | 'effect' | 'image' | 'imageClip';
        edge: 'start' | 'end';
        startX: number;
        initialTime: number;
        initialDuration: number;
    } | null>(null);

    // Toast
    const [notification, setNotification] = useState<{ type: 'success' | 'warning' | 'error' | 'info', title: string, message: string } | null>(null);

    const [libraryAssets, setLibraryAssets] = useState<{ id: string; type: 'video' | 'image' | 'audio'; path: string; name: string; thumbnail?: string }[]>([]);

    // Shotcut Features State
    const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1, rotation: 0 });
    const [keyframes, setKeyframes] = useState<KeyframeData>({});
    const [cameraTilt, setCameraTilt] = useState({ x: 0, y: 0 });
    const [cameraZoom, setCameraZoom] = useState(1);
    const [fullPreviewMode, setFullPreviewMode] = useState(false);
    const [backgroundColor, setBackgroundColor] = useState('#000000');
    const [videoPadding, setVideoPadding] = useState(4);
    const [colorGrade, setColorGrade] = useState<ColorGradePreset>('none');
    const [premiumVoice, setPremiumVoice] = useState(false);
    const [playbackSpeed, setPlaybackSpeed] = useState(1);
    const [isEditingText, setIsEditingText] = useState(false);

    const crop = useCrop({
        videoRef: videoRef as React.RefObject<HTMLVideoElement>,
        containerRef: threeContainerRef as React.RefObject<HTMLDivElement>
    });

    return {
        videoRef, audioRef, thumbnailVideoRef, timelineRef, canvasRef, threeContainerRef,
        threeRendererRef, threeSceneRef, threeCameraRef, videoTextureRef, videoPlaneRef, audioRefs, playheadRef,
        mediaType, setMediaType, mediaPath, setMediaPath, mediaName, setMediaName,
        recordedCursorData, setRecordedCursorData,
        isPlaying, setIsPlaying, duration, setDuration, displayTime, setDisplayTime,
        selectedPlatform, setSelectedPlatform, isExporting, setIsExporting, exportQuality, setExportQuality,
        transitionType, setTransitionType, clipTransitions, setClipTransitions, isAutoPolishing, setIsAutoPolishing,
        isMaximized, setIsMaximized, mediaLoaded, setMediaLoaded,
        isLoading, setIsLoading, loadError, setLoadError,
        autoPolishTrackingProfile, setAutoPolishTrackingProfile,
        segments, setSegments, selectedSegmentId, setSelectedSegmentId,
        history, setHistory, historyIndex, setHistoryIndex, draggedSegmentId, setDraggedSegmentId,
        dragOverIndex, setDragOverIndex,
        audioSegments, setAudioSegments, selectedAudioId, setSelectedAudioId,
        draggedAudioId, setDraggedAudioId,
        smartEffects, setSmartEffects, selectedEffectId, setSelectedEffectId,
        draggingEffectId, setDraggingEffectId, effectDragInfo, setEffectDragInfo,
        overlayImages, setOverlayImages, selectedOverlayId, setSelectedOverlayId,
        draggedOverlayId, setDraggedOverlayId,
        imageClips, setImageClips, selectedImageClipId, setSelectedImageClipId,
        draggedImageClipId, setDraggedImageClipId,
        textOverlays, setTextOverlays, selectedTextOverlayId, setSelectedTextOverlayId,
        draggedTextOverlayId, setDraggedTextOverlayId,
        annotationOverlays, setAnnotationOverlays,
        annotationCanvasSize, setAnnotationCanvasSize,
        zoom, setZoom, videoMuted, setVideoMuted,
        isDraggingPlayhead, setIsDraggingPlayhead,
        cropMode, setCropMode, cropPosition, setCropPosition,
        isDraggingCrop, setIsDraggingCrop, cropDragStart, setCropDragStart,
        notification, setNotification,
        libraryAssets, setLibraryAssets,
        resizing, setResizing,
        transform, setTransform, keyframes, setKeyframes,
        cameraTilt, setCameraTilt, cameraZoom, setCameraZoom,
        fullPreviewMode, setFullPreviewMode,
        backgroundColor, setBackgroundColor,
        videoPadding, setVideoPadding,
        colorGrade, setColorGrade,
        premiumVoice, setPremiumVoice,
        playbackSpeed, setPlaybackSpeed,
        isEditingText, setIsEditingText,
        crop
    };
};




