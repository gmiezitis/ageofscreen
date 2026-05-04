/**
 * VideoRenderer - FFmpeg-based video processing
 * 
 * Detects FFmpeg from system PATH or bundled location.
 * Supports video cropping and segment trimming.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { execSync, spawn } from 'child_process';
import { RELEASE_PROFILE } from '../config/releaseProfile';
import { getageofscreenTempDir } from './runtimePaths';
import { perfMark } from '../utils/perf';
import { fromMediaFileUrl } from '../shared/mediaPaths';
import { isSupportedMediaFilePath } from '../shared/pathSecurity';
import { normalizeArea, resolveBackgroundFFmpeg, CINEMATIC_CSS, computeBaseZoom, computeEffectFadeRatio, PREVIEW_ZOOM_CENTER_STRENGTH, TILT_RANGE, ZOOM_EASE_IN, ZOOM_EASE_OUT } from '../videoEditor/effectMath';
import { buildFfmpegEffectEnvelopeExpr } from '../videoEditor/ffmpegExpressions';
import { DEFAULT_ZOOM_INTENSITY, getEffectIntensity } from '../videoEditor/effectIntensity';
import { buildResolvedTimelineTransitions, VISUAL_TRANSITION_GAP_TOLERANCE, VISUAL_TRANSITION_PREFERRED_DURATION } from '../videoEditor/timelineScene';
import type { ClipTransition, TransitionType } from '../videoEditor/types';

declare const __non_webpack_require__: NodeRequire | undefined;

/** Check if input has audio stream. Returns false if no audio or probe fails. */
async function hasAudioStream(filePath: string): Promise<boolean> {
    if (!ffmpegPath) return false;
    const dir = path.dirname(ffmpegPath);
    const ext = path.extname(ffmpegPath);
    const ffprobePath = path.join(dir, 'ffprobe' + ext);
    if (!fs.existsSync(ffprobePath)) return false;
    return new Promise((resolve) => {
        const proc = spawn(ffprobePath, [
            '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type',
            '-of', 'csv=p=0', filePath
        ], { stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '';
        proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
        proc.on('close', (code) => {
            resolve(code === 0 && out.trim().length > 0);
        });
        proc.on('error', () => resolve(false));
    });
}

async function getVideoResolution(filePath: string): Promise<{ width: number; height: number }> {
    if (!ffmpegPath) return { width: 1920, height: 1080 };
    const dir = path.dirname(ffmpegPath);
    const ext = path.extname(ffmpegPath);
    const ffprobePath = path.join(dir, 'ffprobe' + ext);
    if (!fs.existsSync(ffprobePath)) return { width: 1920, height: 1080 };
    return new Promise((resolve) => {
        const proc = spawn(ffprobePath, [
            '-v', 'error', '-select_streams', 'v:0',
            '-show_entries', 'stream=width,height',
            '-of', 'csv=p=0:s=x', filePath,
        ], { stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '';
        proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
        proc.on('close', () => {
            const parts = out.trim().split('x').map(Number);
            resolve({ width: parts[0] || 1920, height: parts[1] || 1080 });
        });
        proc.on('error', () => resolve({ width: 1920, height: 1080 }));
    });
}

async function getVideoDuration(filePath: string): Promise<number | null> {
    if (!ffmpegPath) return null;
    const dir = path.dirname(ffmpegPath);
    const ext = path.extname(ffmpegPath);
    const ffprobePath = path.join(dir, 'ffprobe' + ext);
    if (!fs.existsSync(ffprobePath)) return null;
    return new Promise((resolve) => {
        const proc = spawn(ffprobePath, [
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            filePath,
        ], { stdio: ['pipe', 'pipe', 'pipe'] });
        let out = '';
        proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
        proc.on('close', () => {
            const duration = Number.parseFloat(out.trim());
            resolve(Number.isFinite(duration) && duration > 0 ? duration : null);
        });
        proc.on('error', () => resolve(null));
    });
}

export interface RenderSegment {
    id?: string;
    startSeconds: number;
    endSeconds: number;
    timelineStart?: number;
}

export interface CropRect {
    x: number;      // percentage 0-100
    y: number;      // percentage 0-100
    width: number;  // percentage 0-100
    height: number; // percentage 0-100
}
const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));
const toEvenDimension = (value: number, fallback: number): number => {
    const rounded = Math.round(value);
    const safe = Number.isFinite(rounded) && rounded > 0 ? rounded : fallback;
    return Math.max(2, Math.round(safe / 2) * 2);
};
const ff = (value: number, digits = 4): string => value.toFixed(digits);
const normalizeFfmpegColor = (value: string | null | undefined, fallback = 'white'): string => {
    const safeValue = (value || fallback).trim();
    if (!safeValue) return fallback;
    if (safeValue.startsWith('#')) return `0x${safeValue.slice(1)}`;
    const rgbaMatch = safeValue.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
    if (rgbaMatch) {
        const r = Math.max(0, Math.min(255, Math.round(Number.parseFloat(rgbaMatch[1]))));
        const g = Math.max(0, Math.min(255, Math.round(Number.parseFloat(rgbaMatch[2]))));
        const b = Math.max(0, Math.min(255, Math.round(Number.parseFloat(rgbaMatch[3]))));
        const alpha = rgbaMatch[4] != null ? clamp01(Number.parseFloat(rgbaMatch[4])) : null;
        const hex = `0x${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
        return alpha == null ? hex : `${hex}@${alpha.toFixed(3)}`;
    }
    return safeValue;
};
const sampleTimedTrack = <T extends { time: number }>(points: T[], maxPoints: number): T[] => {
    if (points.length <= maxPoints || maxPoints < 2) return points;

    const result: T[] = [];
    const lastIndex = points.length - 1;
    for (let i = 0; i < maxPoints; i += 1) {
        const index = i === maxPoints - 1
            ? lastIndex
            : Math.round((i * lastIndex) / (maxPoints - 1));
        const point = points[index];
        if (result[result.length - 1] !== point) {
            result.push(point);
        }
    }

    return result;
};
const MAX_FOLLOW_CURSOR_EXPR_POINTS = 128;
const FOLLOW_CURSOR_EXPR_POINTS_PER_SECOND = 45;
const FOLLOW_CURSOR_EXPR_MIN_POINTS = 24;
// Breathing currently stays preview-only so it cannot destabilize FFmpeg export
// or interfere with zoom-area targeting in the rendered file.
const EXPORT_SAFE_EFFECT_TYPES = new Set(['zoom', '3d_tilt', 'card_flip', 'slow_zoom', 'blur_area', 'exposure']);
const RELIABLE_FALLBACK_EFFECT_TYPES = new Set(['zoom', 'slow_zoom', 'blur_area', 'exposure']);
const FFMPEG_INITIAL_PROGRESS_TIMEOUT_MS = 60_000;
const FFMPEG_PROGRESS_STALL_TIMEOUT_MS = 45_000;
const FFMPEG_PROGRESS_CHECK_INTERVAL_MS = 5_000;
const FFMPEG_STALL_MARKER = '[VideoRenderer] FFmpeg progress stalled';
const getExpressionPointBudget = (duration: number, maxPoints: number, pointsPerSecond: number, minPoints: number): number => (
    Math.max(minPoints, Math.min(maxPoints, Math.ceil(Math.max(0.1, duration) * pointsPerSecond) + 1))
);
const clampFocusExpr = (coordExpr: string, spanPercent: number) => {
    const marginPercent = Math.max(0.5, Math.min(49.5, spanPercent / 2));
    const margin = ff(marginPercent / 100, 6);
    const maxCoord = ff(1 - (marginPercent / 100), 6);
    return `max(${margin}\\,min(${maxCoord}\\,${coordExpr}))`;
};
const parseFfmpegTimestampSeconds = (value: string): number => {
    const match = value.match(/(\d+):(\d+):(\d+(?:\.\d+)?)/);
    if (!match) return Number.NaN;
    const hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    const seconds = Number.parseFloat(match[3]);
    return (hours * 3600) + (minutes * 60) + seconds;
};
const EXPORT_WATERMARK_FILE = 'export-watermark.png';
const resolveBrandingResourcePath = (fileName: string): string | null => {
    const candidates = app.isPackaged
        ? [
            path.join(process.resourcesPath, 'branding', fileName),
        ]
        : [
            path.resolve(process.cwd(), 'resources', 'branding', fileName),
            path.resolve(app.getAppPath(), 'resources', 'branding', fileName),
        ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            return candidate;
        }
    }

    return null;
};
const ensureReadableMediaInputPath = (source: string, label: string): string => {
    const resolvedPath = fromMediaFileUrl(source);
    if (!path.isAbsolute(resolvedPath)) {
        throw new Error(`${label} must use an absolute file path.`);
    }
    if (!isSupportedMediaFilePath(resolvedPath)) {
        throw new Error(`${label} uses an unsupported media type: ${resolvedPath}`);
    }
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`${label} file not found: ${resolvedPath}`);
    }
    try {
        fs.accessSync(resolvedPath, fs.constants.R_OK);
    } catch {
        throw new Error(`${label} is not readable: ${resolvedPath}`);
    }
    return resolvedPath;
};

// FFmpeg path detection
let ffmpegPath: string | null = null;
let ffmpegAvailable = false;
let loggedInstallerArchWarning = false;

const getRuntimeRequire = (): NodeRequire | null => {
    if (typeof __non_webpack_require__ === 'function') {
        return __non_webpack_require__;
    }
    if (typeof require === 'function') {
        return require;
    }
    return null;
};

const logInstallerArchSupport = () => {
    if (loggedInstallerArchWarning || process.platform !== 'win32' || process.arch !== 'arm64') return;
    loggedInstallerArchWarning = true;

    try {
        const runtimeRequire = getRuntimeRequire();
        if (!runtimeRequire) return;
        const installerPkg = runtimeRequire('@ffmpeg-installer/ffmpeg/package.json');
        const optionalDependencies = installerPkg?.optionalDependencies ?? {};
        if (!optionalDependencies['@ffmpeg-installer/win32-arm64']) {
            console.warn('[VideoRenderer] @ffmpeg-installer/ffmpeg does not ship a native win32-arm64 bundle. Windows ARM64 exports will rely on packaged custom binaries, PATH, or system FFmpeg installs.');
        }
    } catch (err) {
        console.warn('[VideoRenderer] Unable to verify FFmpeg installer architecture support:', err);
    }
};

const findFFmpegInPath = (): string | null => {
    try {
        const cmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
        const result = execSync(cmd, {
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'ignore'],
            timeout: 5000
        });
        const paths = result.trim().split('\n');
        for (const p of paths) {
            const trimmed = p.trim();
            if (trimmed && fs.existsSync(trimmed)) {
                return trimmed;
            }
        }
    } catch {
        // Not found in PATH
    }
    return null;
};

const getBundledFfmpegCandidates = (ffmpegBin: string): string[] => {
    const platformArch = `${process.platform}-${process.arch}`;
    return [
        path.join(process.resourcesPath, 'ffmpeg', platformArch, ffmpegBin),
        path.join(process.resourcesPath, 'ffmpeg', ffmpegBin),
    ];
};

const initFFmpeg = () => {
    if (ffmpegAvailable) return;

    console.log('[VideoRenderer] Initializing FFmpeg detection...');
    logInstallerArchSupport();
    const isWin = process.platform === 'win32';
    const isMac = process.platform === 'darwin';
    const ffmpegBin = isWin ? 'ffmpeg.exe' : 'ffmpeg';

    // Release packages must use app-owned FFmpeg binaries only.
    if (app.isPackaged) {
        for (const candidate of getBundledFfmpegCandidates(ffmpegBin)) {
            if (fs.existsSync(candidate)) {
                ffmpegPath = candidate;
                ffmpegAvailable = true;
                console.log('[VideoRenderer] Using bundled FFmpeg:', candidate);
                return;
            }
        }

        console.warn('[VideoRenderer] Packaged build is missing bundled FFmpeg resources. Export processing will stay unavailable until ffmpeg/ffprobe are shipped in resources/ffmpeg.');
        return;
    }

    // Dev mode can use the npm installer package for convenience.
    try {
        const runtimeRequire = getRuntimeRequire();
        if (!runtimeRequire) {
            throw new Error('Runtime require is unavailable in this bundle');
        }
        const installer = runtimeRequire('@ffmpeg-installer/ffmpeg');
        if (installer?.path && fs.existsSync(installer.path)) {
            ffmpegPath = installer.path;
            ffmpegAvailable = true;
            console.log('[VideoRenderer] Using @ffmpeg-installer:', installer.path);
            return;
        }
    } catch {
        // Package not available or platform not supported
    }

    if (RELEASE_PROFILE.allowBundledFfmpegOnly) {
        console.warn('[VideoRenderer] FFmpeg fallback paths are disabled in this release profile.');
        return;
    }

    // Development fallback paths.
    const commonPaths: string[] = isWin
        ? ['C:\\ffmpeg\\bin\\ffmpeg.exe', 'C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe', 'C:\\Program Files (x86)\\ffmpeg\\bin\\ffmpeg.exe']
        : isMac
            ? ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/local/bin/ffmpeg']
            : ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'];

    for (const p of commonPaths) {
        if (fs.existsSync(p)) {
            ffmpegPath = p;
            ffmpegAvailable = true;
            console.log('[VideoRenderer] Found FFmpeg at:', p);
            return;
        }
    }

    // Search WinGet packages (Windows only)
    if (isWin) {
        const wingetPackages = path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages');
        if (fs.existsSync(wingetPackages)) {
            try {
                const packages = fs.readdirSync(wingetPackages);
                for (const pkg of packages) {
                    if (pkg.toLowerCase().includes('ffmpeg')) {
                        const pkgPath = path.join(wingetPackages, pkg);
                        const searchDirs = (dir: string): string | null => {
                            try {
                                const items = fs.readdirSync(dir);
                                for (const item of items) {
                                    const fullPath = path.join(dir, item);
                                    if (item === 'ffmpeg.exe' && fs.statSync(fullPath).isFile()) {
                                        return fullPath;
                                    }
                                    if (fs.statSync(fullPath).isDirectory()) {
                                        const found = searchDirs(fullPath);
                                        if (found) return found;
                                    }
                                }
                            } catch { }
                            return null;
                        };
                        const found = searchDirs(pkgPath);
                        if (found) {
                            ffmpegPath = found;
                            ffmpegAvailable = true;
                            console.log('[VideoRenderer] Found FFmpeg in WinGet:', found);
                            return;
                        }
                    }
                }
            } catch {
                console.log('[VideoRenderer] Could not search WinGet packages');
            }
        }
    }

    // Check system PATH
    const pathResult = findFFmpegInPath();
    if (pathResult) {
        ffmpegPath = pathResult;
        ffmpegAvailable = true;
        console.log('[VideoRenderer] Found FFmpeg in PATH:', pathResult);
        return;
    }

    console.warn('[VideoRenderer] FFmpeg not found - video processing will be limited');
};

// Initialize on module load
try {
    initFFmpeg();
} catch (err) {
    console.error('[VideoRenderer] Failed to initialize:', err);
}

export class VideoRenderer {
    private lastRenderInfo: {
        requestedEffectTypes: string[];
        exportedEffectTypes: string[];
        fallbackMode: 'none' | 'reliable_subset' | 'no_effects';
        transitionFallbackMode: 'none' | 'cut';
    } = { requestedEffectTypes: [], exportedEffectTypes: [], fallbackMode: 'none', transitionFallbackMode: 'none' };

    isAvailable(): boolean {
        // Re-check on each call in case FFmpeg was installed after startup
        if (!ffmpegAvailable) {
            initFFmpeg();
        }
        return ffmpegAvailable;
    }

    getFFmpegPath(): string | null {
        return ffmpegPath;
    }

    getLastRenderInfo() {
        return this.lastRenderInfo;
    }

    /**
     * Process video with trim, crop, frame/padding, audio overlays, effects, and optional watermark.
     * When addWatermark is true, adds the branded export watermark at bottom-right.
     */
    async processVideo(
        inputPath: string,
        outputPath: string,
        segments: RenderSegment[],
        crop?: CropRect | null,
        backgroundColor?: string | null,
        videoPadding?: number,
        outputFrameSize?: { width: number; height: number } | null,
        audioSegments?: Array<{ file: string; startTime: number; duration: number; volume: number }>,
        addWatermark?: boolean,
        smartEffects?: Array<{ type: string; startTime: number; duration: number; intensity: number; tilt?: number; zoomArea?: { x: number; y: number; width: number; height: number } | null; followCursor?: boolean; followCursorIntensity?: number; cursorTrack?: Array<{ time: number; x: number; y: number }>; renderOrder?: number }>,
        quality?: 'fast' | 'balanced' | 'high',
        transitionType?: 'cut' | 'crossfade' | 'dip_to_black',
        textOverlays?: any[],
        annotationImageOverlays?: Array<{ file: string; startTime: number; duration: number }>,
        imageOverlays?: Array<{ file: string; startTime: number; duration: number; x: number; y: number; width: number; height: number; renderMode?: 'overlay' | 'fullscreen' }>,
        imageClips?: Array<{ id?: string; file: string; startTime: number; duration: number }>,
        clipTransitions?: ClipTransition[],
        colorGrade?: string,
        premiumVoice?: boolean,
        renderOptions?: {
            forceCutTransitions?: boolean;
            onProgress?: (fraction: number, progressSeconds: number, durationSeconds: number) => void;
        }
    ): Promise<string> {
        const perf = perfMark('render:processVideo');
        if (!ffmpegAvailable) initFFmpeg();
        if (!ffmpegAvailable || !ffmpegPath) {
            throw new Error('FFmpeg is not available. Please install FFmpeg to enable video processing.');
        }
        if (segments.length === 0) {
            throw new Error('No segments provided');
        }

        const hasAudio = await hasAudioStream(inputPath);
        const { width: sourceW, height: sourceH } = await getVideoResolution(inputPath);
        const mediaDuration = await getVideoDuration(inputPath);
        const normalizedSegments = segments
            .map((segment) => {
                const safeStart = Math.max(0, Number.isFinite(segment.startSeconds) ? segment.startSeconds : 0);
                const rawEnd = segment.endSeconds < 999990 ? segment.endSeconds : (mediaDuration ?? segment.endSeconds);
                const safeEnd = Number.isFinite(rawEnd) ? rawEnd : safeStart;
                const boundedStart = mediaDuration != null ? Math.min(safeStart, Math.max(0, mediaDuration - 0.02)) : safeStart;
                const boundedEnd = mediaDuration != null ? Math.min(safeEnd, mediaDuration) : safeEnd;
                return {
                    id: segment.id,
                    startSeconds: boundedStart,
                    endSeconds: boundedEnd,
                    timelineStart: Number.isFinite(segment.timelineStart as number) ? Number(segment.timelineStart) : undefined,
                };
            })
            .filter((segment) => segment.endSeconds - segment.startSeconds > 0.02);
        const safeSegments = normalizedSegments.length > 0
            ? normalizedSegments
            : (mediaDuration != null && mediaDuration > 0.02
                ? [{ id: 'segment-0', startSeconds: 0, endSeconds: mediaDuration, timelineStart: 0 }]
                : []);
        if (safeSegments.length === 0) {
            throw new Error('Export timeline is empty after segment validation.');
        }
        if (safeSegments.length !== segments.length || safeSegments.some((segment, index) => segment.startSeconds !== segments[index]?.startSeconds || segment.endSeconds !== segments[index]?.endSeconds)) {
            console.warn('[VideoRenderer] Adjusted export segments to fit source duration:', { requested: segments, safe: safeSegments, mediaDuration });
        }
        let inferredTimelineStart = 0;
        segments = safeSegments
            .map((segment) => {
                const duration = Math.max(0.02, segment.endSeconds - segment.startSeconds);
                const timelineStart = Number.isFinite(segment.timelineStart as number)
                    ? Number(segment.timelineStart)
                    : inferredTimelineStart;
                inferredTimelineStart = timelineStart + duration;
                return {
                    ...segment,
                    timelineStart,
                };
            })
            .sort((a, b) => (a.timelineStart ?? 0) - (b.timelineStart ?? 0));
        const rawPadding = videoPadding || 0;
        const hasStyledBackground = !!backgroundColor && backgroundColor !== 'transparent';
        const padding = hasStyledBackground && rawPadding > 0 ? Math.max(rawPadding, 4) : rawPadding;
        const ffBgColor = resolveBackgroundFFmpeg(backgroundColor);
        const hasCrop = crop && (crop.x > 0.5 || crop.y > 0.5 || crop.width < 99 || crop.height < 99);
        const hasFrame = padding > 0;
        const audios = audioSegments || [];
        const requestedEffects = (smartEffects || [])
            .map((effect, index) => ({
                ...effect,
                renderOrder: Number.isFinite(effect.renderOrder) ? Number(effect.renderOrder) : index,
            }))
            .sort((a, b) => {
                const renderOrderDelta = (a.renderOrder ?? 0) - (b.renderOrder ?? 0);
                if (renderOrderDelta !== 0) {
                    return renderOrderDelta;
                }
                return a.startTime - b.startTime;
            });
        const effects = requestedEffects.filter((fx) => EXPORT_SAFE_EFFECT_TYPES.has(fx.type));
        const skippedEffects = requestedEffects.filter((fx) => !EXPORT_SAFE_EFFECT_TYPES.has(fx.type));
        const forceCutTransitions = renderOptions?.forceCutTransitions === true;
        const onProgress = renderOptions?.onProgress;
        const buildRenderInfo = (
            fallbackMode: 'none' | 'reliable_subset' | 'no_effects',
            exportedEffectTypes: string[] = effects.map((fx) => fx.type),
            transitionFallbackMode: 'none' | 'cut' = forceCutTransitions ? 'cut' : 'none',
        ) => ({
            requestedEffectTypes: requestedEffects.map((fx) => fx.type),
            exportedEffectTypes,
            fallbackMode,
            transitionFallbackMode,
        });
        if (skippedEffects.length > 0) {
            console.warn('[VideoRenderer] Skipping export-unsafe effects:', skippedEffects.map((fx) => fx.type));
        }

        let effectW = Math.floor(sourceW / 2) * 2;
        let effectH = Math.floor(sourceH / 2) * 2;
        if (hasCrop && crop) {
            effectW = Math.floor(sourceW * crop.width / 100 / 2) * 2;
            effectH = Math.floor(sourceH * crop.height / 100 / 2) * 2;
        }

        const requestedOutputFrame = outputFrameSize
            && Number.isFinite(outputFrameSize.width)
            && Number.isFinite(outputFrameSize.height)
            && outputFrameSize.width > 0
            && outputFrameSize.height > 0
            ? {
                width: toEvenDimension(outputFrameSize.width, effectW),
                height: toEvenDimension(outputFrameSize.height, effectH),
            }
            : null;
        const frameW = requestedOutputFrame?.width ?? effectW;
        const frameH = requestedOutputFrame?.height ?? effectH;
        const scaleFactorValue = hasFrame ? (1 - padding / 100) : 1.0;
        const windowMaxW = Math.max(2, frameW * scaleFactorValue);
        const windowMaxH = Math.max(2, frameH * scaleFactorValue);
        const windowScale = Math.max(0.0001, Math.min(windowMaxW / effectW, windowMaxH / effectH));
        const windowW = toEvenDimension(effectW * windowScale, effectW);
        const windowH = toEvenDimension(effectH * windowScale, effectH);
        const needsFinalFrameCanvas = hasStyledBackground || hasFrame || frameW !== windowW || frameH !== windowH;

        const args: string[] = ['-y', '-i', inputPath];
        const audioProbeInfos: string[] = [];
        const tempOverlayFiles: string[] = [];
        const tempFilterScriptFiles: string[] = [];
        const cleanupTempOverlays = () => {
            tempOverlayFiles.forEach((filePath) => {
                try {
                    fs.unlinkSync(filePath);
                } catch {
                    // Ignore cleanup errors.
                }
            });
            tempFilterScriptFiles.forEach((filePath) => {
                try {
                    fs.unlinkSync(filePath);
                } catch {
                    // Ignore cleanup errors.
                }
            });
        };
        const writeFilterScript = (contents: string, suffix: string) => {
            const tempPath = path.join(getageofscreenTempDir(), `ageofscreen-ffmpeg-filter-${Date.now()}-${suffix}.txt`);
            fs.writeFileSync(tempPath, contents, 'utf8');
            tempFilterScriptFiles.push(tempPath);
            return tempPath;
        };
        const resolveOverlayInputPath = async (file: string, index: number) => {
            if (file.startsWith('data:image/')) {
                const match = file.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
                if (!match) {
                    throw new Error('Unsupported annotation overlay image format');
                }
                const ext = match[1] === 'jpeg' ? 'jpg' : match[1];
                const tempPath = path.join(getageofscreenTempDir(), `ageofscreen-annotation-${Date.now()}-${index}.${ext}`);
                fs.writeFileSync(tempPath, Buffer.from(match[2], 'base64'));
                tempOverlayFiles.push(tempPath);
                return tempPath;
            }
            return ensureReadableMediaInputPath(file, 'Overlay input');
        };
        let nextInputIdx = 1;
        for (const a of audios) {
            const audioPath = ensureReadableMediaInputPath(a.file, 'Audio overlay');
            args.push('-i', audioPath);
            audioProbeInfos.push(audioPath);
            nextInputIdx += 1;
        }
        const imageClipInputs = imageClips || [];
        const timelineItems = [
            ...segments.map((seg, index) => {
                const duration = Math.max(0.02, seg.endSeconds - seg.startSeconds);
                const startTime = seg.timelineStart ?? 0;
                return {
                    id: seg.id || `segment-${index}`,
                    kind: 'video' as const,
                    startTime,
                    endTime: startTime + duration,
                    duration,
                    segment: seg,
                };
            }),
            ...imageClipInputs.map((clip, index) => {
                const duration = Math.max(0.1, clip.duration ?? 0.1);
                const startTime = Math.max(0, clip.startTime ?? 0);
                return {
                    id: clip.id || `image-${index}`,
                    kind: 'imageClip' as const,
                    startTime,
                    endTime: startTime + duration,
                    duration,
                    imageClipIndex: index,
                    clip,
                };
            }),
        ].sort((a, b) => {
            const startDelta = a.startTime - b.startTime;
            if (Math.abs(startDelta) > VISUAL_TRANSITION_GAP_TOLERANCE) {
                return startDelta;
            }
            if (a.kind === b.kind) {
                return a.id.localeCompare(b.id);
            }
            return a.kind === 'imageClip' ? -1 : 1;
        });

        const requestedTimelineTransitions = buildResolvedTimelineTransitions(
            timelineItems as any[],
            clipTransitions || [],
            (transitionType || 'cut') as TransitionType,
            VISUAL_TRANSITION_PREFERRED_DURATION,
        );
        const timelineTransitions = forceCutTransitions
            ? requestedTimelineTransitions.map((transition) => ({ ...transition, type: 'cut' as const, duration: 0 }))
            : requestedTimelineTransitions;
        const canRetryWithCutTransitions = imageClipInputs.length > 0
            && !forceCutTransitions
            && requestedTimelineTransitions.some((transition) => transition.type !== 'cut');
        let exportDuration = timelineItems.reduce((max, item) => Math.max(max, item.startTime + item.duration), 0);
        exportDuration = Math.max(
            0.02,
            exportDuration - timelineTransitions.reduce((sum, transition) => (
                transition.type === 'crossfade' ? sum + transition.duration : sum
            ), 0),
        );
        const exportDurationLabel = exportDuration.toFixed(3);

        const imageClipInputStartIdx = nextInputIdx;
        for (let i = 0; i < imageClipInputs.length; i += 1) {
            const resolvedPath = await resolveOverlayInputPath(imageClipInputs[i].file, i);
            args.push('-framerate', '60', '-loop', '1', '-t', Math.max(0.1, imageClipInputs[i].duration).toFixed(3), '-i', resolvedPath);
            nextInputIdx += 1;
        }
        const rawTextOverlays = textOverlays || [];
        const textImageInputs = rawTextOverlays.filter((overlay) => typeof overlay?.file === 'string');
        const drawTextOverlays = rawTextOverlays.filter((overlay) => typeof overlay?.file !== 'string');
        const textImageInputStartIdx = nextInputIdx;
        for (let i = 0; i < textImageInputs.length; i += 1) {
            const resolvedPath = await resolveOverlayInputPath(textImageInputs[i].file, imageClipInputs.length + i);
            args.push('-loop', '1', '-t', exportDurationLabel, '-i', resolvedPath);
            nextInputIdx += 1;
        }
        const annotationInputs = annotationImageOverlays || [];
        const annotationInputStartIdx = nextInputIdx;
        for (let i = 0; i < annotationInputs.length; i += 1) {
            const resolvedPath = await resolveOverlayInputPath(annotationInputs[i].file, imageClipInputs.length + textImageInputs.length + i);
            args.push('-loop', '1', '-t', exportDurationLabel, '-i', resolvedPath);
            nextInputIdx += 1;
        }
        const imageOverlayInputs = imageOverlays || [];
        const imageOverlayInputStartIdx = nextInputIdx;
        for (let i = 0; i < imageOverlayInputs.length; i += 1) {
            const resolvedPath = await resolveOverlayInputPath(imageOverlayInputs[i].file, imageClipInputs.length + textImageInputs.length + annotationInputs.length + i);
            args.push('-loop', '1', '-t', exportDurationLabel, '-i', resolvedPath);
            nextInputIdx += 1;
        }
        let watermarkInputIdx = -1;
        if (addWatermark) {
            const watermarkLogoPath = resolveBrandingResourcePath(EXPORT_WATERMARK_FILE);
            if (watermarkLogoPath) {
                args.push('-loop', '1', '-t', exportDurationLabel, '-i', watermarkLogoPath);
                watermarkInputIdx = nextInputIdx;
                nextInputIdx += 1;
            } else {
                console.warn('[VideoRenderer] Export watermark image not found. Continuing without image watermark.');
            }
        }
        const videoFilters: string[] = [];
        const audioFilters: string[] = [];
        let videoOut = '';
        let audioOut = '';
        let bgInputIdx = -1;
        const pushBackgroundCanvas = (
            label: string,
            width: number,
            height: number,
            mode: 'styled' | 'transparent' = 'styled',
        ) => {
            if (mode === 'transparent') {
                videoFilters.push(`color=c=black@0:s=${width}x${height}:r=60:d=${exportDuration.toFixed(3)},format=rgba${label}`);
                return;
            }

            if (isCinematic && bgInputIdx !== -1) {
                videoFilters.push(`[${bgInputIdx}:v]scale=${width}:${height}:force_original_aspect_ratio=increase,crop=${width}:${height}${label}`);
                return;
            }

            videoFilters.push(`color=c='${ffBgColor}':s=${width}x${height}:r=60:d=${exportDuration.toFixed(3)},format=rgba${label}`);
        };

        // Add the image background as an input if it's a cinematic CSS URL.
        const isCinematic = backgroundColor && CINEMATIC_CSS[backgroundColor];
        if (isCinematic) {
            let bgPath = CINEMATIC_CSS[backgroundColor].replace(/^url\((['"]?)(.*?)\1\)$/, '$2');
            if (!path.isAbsolute(bgPath)) {
                bgPath = path.join(__dirname, bgPath);
            }

            // Double-check existence right before adding as FFmpeg input.
            if (fs.existsSync(bgPath)) {
                args.push('-loop', '1', '-t', exportDurationLabel, '-i', bgPath);
                bgInputIdx = nextInputIdx;
                nextInputIdx += 1;
            } else {
                console.warn('[VideoRenderer] Cinematic bg not found at', bgPath, '— falling back to solid color');
            }
        }

        // Build trim+crop chains WITHOUT padding; padding is applied after effects
        // so that effect area % coords always reference the unpadded video dimensions.
        timelineItems.forEach((item, i) => {
            const fadeInDuration = i > 0 && timelineTransitions[i - 1]?.type === 'dip_to_black'
                ? Math.max(0.03, timelineTransitions[i - 1].duration / 2)
                : 0;
            const fadeOutDuration = i < timelineTransitions.length && timelineTransitions[i]?.type === 'dip_to_black'
                ? Math.max(0.03, timelineTransitions[i].duration / 2)
                : 0;
            const fadeIn = fadeInDuration > 0;
            const fadeOut = fadeOutDuration > 0;

            if (item.kind === 'video') {
                let vf = `[0:v]trim=start=${item.segment.startSeconds}:end=${item.segment.endSeconds},setpts=PTS-STARTPTS`;
                if (hasCrop && crop) {
                    vf += `,crop=iw*${(crop.width / 100).toFixed(4)}:ih*${(crop.height / 100).toFixed(4)}:iw*${(crop.x / 100).toFixed(4)}:ih*${(crop.y / 100).toFixed(4)}`;
                }
                vf += `,scale=${effectW}:${effectH}:flags=lanczos,setsar=1,fps=60,settb=AVTB,format=rgba`;
                if (fadeIn) vf += `,fade=t=in:st=0:d=${fadeInDuration.toFixed(3)}`;
                if (fadeOut) vf += `,fade=t=out:st=${Math.max(0, item.duration - fadeOutDuration).toFixed(3)}:d=${fadeOutDuration.toFixed(3)}`;
                vf += `[v${i}]`;
                videoFilters.push(vf);

                if (hasAudio) {
                    let af = `[0:a]atrim=start=${item.segment.startSeconds}:end=${item.segment.endSeconds},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo`;
                    if (fadeIn) af += `,afade=t=in:st=0:d=${fadeInDuration.toFixed(3)}`;
                    if (fadeOut) af += `,afade=t=out:st=${Math.max(0, item.duration - fadeOutDuration).toFixed(3)}:d=${fadeOutDuration.toFixed(3)}`;
                    af += `[a${i}]`;
                    audioFilters.push(af);
                }
                return;
            }

            const imageInputIdx = imageClipInputStartIdx + item.imageClipIndex;
            let imageFilter = `[${imageInputIdx}:v]format=rgba,scale=w='min(iw,${effectW})':h='min(ih,${effectH})':force_original_aspect_ratio=decrease,pad=${effectW}:${effectH}:(ow-iw)/2:(oh-ih)/2:color=${hasStyledBackground ? ffBgColor : '#020617'},setsar=1,fps=60,settb=AVTB,trim=duration=${item.duration.toFixed(3)},setpts=PTS-STARTPTS`;
            if (fadeIn) imageFilter += `,fade=t=in:st=0:d=${fadeInDuration.toFixed(3)}`;
            if (fadeOut) imageFilter += `,fade=t=out:st=${Math.max(0, item.duration - fadeOutDuration).toFixed(3)}:d=${fadeOutDuration.toFixed(3)}`;
            imageFilter += `[v${i}]`;
            videoFilters.push(imageFilter);
            if (hasAudio) {
                let af = `anullsrc=r=44100:cl=stereo,atrim=duration=${item.duration.toFixed(3)},asetpts=PTS-STARTPTS,aformat=sample_fmts=fltp:sample_rates=44100:channel_layouts=stereo`;
                if (fadeIn) af += `,afade=t=in:st=0:d=${fadeInDuration.toFixed(3)}`;
                if (fadeOut) af += `,afade=t=out:st=${Math.max(0, item.duration - fadeOutDuration).toFixed(3)}:d=${fadeOutDuration.toFixed(3)}`;
                af += `[a${i}]`;
                audioFilters.push(af);
            }
        });

        if (timelineItems.length === 1) {
            videoOut = '[v0]';
            if (hasAudio) {
                audioOut = '[a0]';
            }
        } else {
            let currentVideoLabel = '[v0]';
            let currentAudioLabel = hasAudio ? '[a0]' : '';
            let composedDuration = timelineItems[0].duration;

            for (let i = 1; i < timelineItems.length; i += 1) {
                const boundaryTransition = timelineTransitions[i - 1]?.type ?? ((transitionType || 'cut') as TransitionType);
                const boundaryDuration = timelineTransitions[i - 1]?.duration ?? 0;
                const nextVideoLabel = `[v${i}]`;
                const isLastItem = i === timelineItems.length - 1;
                const composedVideoLabel = isLastItem ? '[outv]' : `[vmix${i}]`;

                if (boundaryTransition === 'crossfade' && boundaryDuration > 0) {
                    const offset = Math.max(0, composedDuration - boundaryDuration);
                    videoFilters.push(`${currentVideoLabel}${nextVideoLabel}xfade=transition=fade:duration=${boundaryDuration.toFixed(3)}:offset=${offset.toFixed(3)}${composedVideoLabel}`);
                    composedDuration = composedDuration + timelineItems[i].duration - boundaryDuration;
                } else {
                    videoFilters.push(`${currentVideoLabel}${nextVideoLabel}concat=n=2:v=1:a=0${composedVideoLabel}`);
                    composedDuration += timelineItems[i].duration;
                }
                currentVideoLabel = composedVideoLabel;

                if (hasAudio) {
                    const nextAudioLabel = `[a${i}]`;
                    const composedAudioLabel = isLastItem ? '[mainaud]' : `[amix${i}]`;
                    if (boundaryTransition === 'crossfade' && boundaryDuration > 0) {
                        audioFilters.push(`${currentAudioLabel}${nextAudioLabel}acrossfade=d=${boundaryDuration.toFixed(3)}${composedAudioLabel}`);
                    } else {
                        audioFilters.push(`${currentAudioLabel}${nextAudioLabel}concat=n=2:v=0:a=1${composedAudioLabel}`);
                    }
                    currentAudioLabel = composedAudioLabel;
                }
            }

            videoOut = currentVideoLabel;
            if (hasAudio) {
                audioOut = currentAudioLabel;
            }
        }
        // 1. Separate content-level and window-level effects
        const contentEffects = effects.filter(e => !['3d_tilt', 'card_flip'].includes(e.type));
        const windowEffects = effects.filter(e => ['3d_tilt', 'card_flip'].includes(e.type));
        let effectIdx = 0;

        // 2. Apply Content Effects (Zoom, Blur, Breathing, Slow Zoom) - operates on raw/cropped video
        if (contentEffects.length > 0) {
            const normLabel = '[normed]';
            videoFilters.push(`${videoOut}scale=trunc(${effectW}/2)*2:trunc(${effectH}/2)*2:flags=lanczos${normLabel}`);
            videoOut = normLabel;

            const zoomEffects = contentEffects.filter((fx) => fx.type === 'zoom');
            const scaleOnlyContentEffects = contentEffects.filter((fx) => fx.type === 'breathing' || fx.type === 'slow_zoom');
            const nonScaleContentEffects = contentEffects.filter((fx) => !['zoom', 'breathing', 'slow_zoom'].includes(fx.type));

            let contentScaleExpr = '1';
            let focusXExpr = '0.5';
            let focusYExpr = '0.5';
            let centerExpr = '0';

            if (zoomEffects.length > 0) {
                const buildZoomMotion = (fx: typeof zoomEffects[number]) => {
                    const start = fx.startTime.toFixed(3);
                    const end = (fx.startTime + fx.duration).toFixed(3);
                    const enable = `between(t\,${start}\,${end})`;
                    const mult = getEffectIntensity(fx) / 100;
                    const durationExpr = Math.max(0.001, fx.duration).toFixed(3);
                    const progress = `max(0\\,min(1\\,(t-${start})/${durationExpr}))`;
                    const fadeRatio = computeEffectFadeRatio(fx.duration);
                    const attackProgress = `max(0\\,min(1\\,${progress}/${ff(ZOOM_EASE_IN)}))`;
                    const releaseProgress = `max(0\\,min(1\\,(1-${progress})/${ff(1 - ZOOM_EASE_OUT)}))`;
                    const attackSmooth = `pow(${attackProgress}\\,3)*(${attackProgress}*(${attackProgress}*6-15)+10)`;
                    const releaseSmooth = `pow(${releaseProgress}\\,3)*(${releaseProgress}*(${releaseProgress}*6-15)+10)`;
                    const zoomAttack = `if(lt(${progress}\\,${ff(ZOOM_EASE_IN)})\\,${attackSmooth}\\,if(gt(${progress}\\,${ff(ZOOM_EASE_OUT)})\\,${releaseSmooth}\\,1))`;
                    const envelope = `${zoomAttack}*${buildFfmpegEffectEnvelopeExpr(progress, fadeRatio)}`;
                    const area = normalizeArea(fx.zoomArea ?? { x: 25, y: 25, width: 50, height: 50 });
                    const baseZoom = computeBaseZoom(area);
                    const peakZoom = 1 + (baseZoom - 1) * mult;
                    const cursorTrack = Array.isArray((fx as any).cursorTrack) ? (fx as any).cursorTrack : [];
                    const buildCursorExpr = (axis: 'x' | 'y') => {
                        if (!fx.followCursor || cursorTrack.length === 0) return null;
                        const followExprBudget = getExpressionPointBudget(
                            fx.duration,
                            MAX_FOLLOW_CURSOR_EXPR_POINTS,
                            FOLLOW_CURSOR_EXPR_POINTS_PER_SECOND,
                            FOLLOW_CURSOR_EXPR_MIN_POINTS,
                        );
                        const normalized = sampleTimedTrack(cursorTrack, followExprBudget).map((point: { time: number; x: number; y: number }) => {
                            const safeCoord = clamp01((axis === 'x' ? point.x : point.y) / 100);
                            return {
                                time: point.time,
                                coord: safeCoord,
                            };
                        });

                        let expression = ff(normalized[normalized.length - 1].coord, 6);
                        for (let i = normalized.length - 2; i >= 0; i -= 1) {
                            const current = normalized[i];
                            const next = normalized[i + 1];
                            const delta = next.coord - current.coord;
                            const segmentDuration = Math.max(0.001, next.time - current.time);
                            const interpolated = `${ff(current.coord, 6)}+${ff(delta, 6)}*((t-${ff(current.time, 3)})/${ff(segmentDuration, 3)})`;
                            expression = `if(between(t\\,${ff(current.time, 3)}\\,${ff(next.time, 3)})\\,${interpolated}\\,${expression})`;
                        }
                        return expression;
                    };
                    const dynamicFocusX = buildCursorExpr('x');
                    const dynamicFocusY = buildCursorExpr('y');
                    const areaCenterX = (area.x + area.width / 2) / 100;
                    const areaCenterY = (area.y + area.height / 2) / 100;
                    const tiltNorm = Math.max(-100, Math.min(100, fx.tilt ?? 0)) / 100;
                    const followStrength = ff(Math.max(0, Math.min(1, (fx as any).followCursorIntensity != null ? (fx as any).followCursorIntensity / 100 : DEFAULT_ZOOM_INTENSITY / 100)), 6);
                    const targetFocusX = dynamicFocusX
                        ? `${ff(areaCenterX, 6)}+(${dynamicFocusX}-${ff(areaCenterX, 6)})*${followStrength}`
                        : `${ff(areaCenterX, 6)}`;
                    const targetFocusY = dynamicFocusY
                        ? `${ff(areaCenterY, 6)}+(${dynamicFocusY}-${ff(areaCenterY, 6)})*${followStrength}`
                        : `${ff(areaCenterY, 6)}`;
                    const safeFocusX = clampFocusExpr(targetFocusX, area.width);
                    const safeFocusY = clampFocusExpr(targetFocusY, area.height);
                    const tiltShiftX = ff((tiltNorm * TILT_RANGE) / 100, 6);
                    const resolvedFocusX = clampFocusExpr(`${safeFocusX}+${tiltShiftX}`, area.width);
                    const resolvedFocusY = clampFocusExpr(safeFocusY, area.height);
                    return {
                        enable,
                        envelope,
                        scale: `1+${(peakZoom - 1).toFixed(4)}*(${envelope})`,
                        focusX: resolvedFocusX,
                        focusY: resolvedFocusY,
                        center: envelope,
                    };
                };

                const motions = zoomEffects.map(buildZoomMotion);
                // Preview gives precedence to the most recently active zoom, so export must do the same.
                contentScaleExpr = motions.reduce((fallback, motion) => `if(${motion.enable}\,${motion.scale}\,${fallback})`, '1');
                focusXExpr = motions.reduce((fallback, motion) => `if(${motion.enable}\,${motion.focusX}\,${fallback})`, '0.5');
                focusYExpr = motions.reduce((fallback, motion) => `if(${motion.enable}\,${motion.focusY}\,${fallback})`, '0.5');
                centerExpr = motions.reduce((fallback, motion) => `if(${motion.enable}\,${motion.center}\,${fallback})`, '0');
            }

            if (scaleOnlyContentEffects.length > 0) {
                const scaleOnlyExprs = scaleOnlyContentEffects.map((fx) => {
                    const start = fx.startTime.toFixed(3);
                    const end = (fx.startTime + fx.duration).toFixed(3);
                    const mult = getEffectIntensity(fx) / 100;
                    const fadeRatio = computeEffectFadeRatio(fx.duration);
                    const progress = `max(0\\,min(1\\,(t-${start})/${Math.max(0.001, fx.duration).toFixed(3)}))`;
                    const envelope = buildFfmpegEffectEnvelopeExpr(progress, fadeRatio);

                    if (fx.type === 'breathing') {
                        const breathMult = (0.04 * mult).toFixed(4);
                        const breathEased = `(0.5-0.5*cos(2*PI*(t-${start})/3))`;
                        return `if(between(t\\,${start}\\,${end})\\,1+${breathMult}*${breathEased}*(${envelope})\\,1)`;
                    }

                    const maxZoom = (0.15 * mult).toFixed(4);
                    const easedProgress = `(0.5-0.5*cos(PI*${progress}))`;
                    return `if(between(t\\,${start}\\,${end})\\,1+${maxZoom}*${easedProgress}*(${envelope})\\,1)`;
                });

                contentScaleExpr = scaleOnlyExprs.reduce(
                    (combinedExpr, nextExpr) => `(${combinedExpr})*(${nextExpr})`,
                    contentScaleExpr,
                );
            }

            if (zoomEffects.length > 0 || scaleOnlyContentEffects.length > 0) {
                const scaledLabel = `[fxzsc${effectIdx}]`;
                const nextLabel = `[fx${effectIdx}]`;
                const edgeSeverityExpr = `max(abs((${focusXExpr})-0.5)/0.5\\,abs((${focusYExpr})-0.5)/0.5)`;
                const edgeDampingExpr = `1-0.24*pow(${edgeSeverityExpr}\\,1.35)`;
                const centerStrengthExpr = `${ff(PREVIEW_ZOOM_CENTER_STRENGTH, 4)}*${edgeDampingExpr}`;
                const centerWeightExpr = `${centerExpr}*${centerStrengthExpr}`;
                const usesWindowTransformCanvas = needsFinalFrameCanvas;

                if (usesWindowTransformCanvas) {
                    const baseWindowLabel = `[fxzwbase${effectIdx}]`;
                    const canvasLabel = `[fxzwcanvas${effectIdx}]`;
                    const focusPxXExpr = `${windowW.toFixed(2)}*(${focusXExpr})`;
                    const focusPxYExpr = `${windowH.toFixed(2)}*(${focusYExpr})`;
                    const translateXExpr = `${windowW.toFixed(2)}*(0.5-(${focusXExpr}))*${centerWeightExpr}`;
                    const translateYExpr = `${windowH.toFixed(2)}*(0.5-(${focusYExpr}))*${centerWeightExpr}`;
                    const overlayXExpr = `(${focusPxXExpr})-(${focusPxXExpr})*(${contentScaleExpr})+(${translateXExpr})`;
                    const overlayYExpr = `(${focusPxYExpr})-(${focusPxYExpr})*(${contentScaleExpr})+(${translateYExpr})`;

                    videoFilters.push(`${videoOut}format=rgba,scale=${windowW}:${windowH}:flags=lanczos${baseWindowLabel}`);
                    videoFilters.push(`${baseWindowLabel}scale=w='${windowW}*${contentScaleExpr}':h='${windowH}*${contentScaleExpr}':eval=frame:flags=lanczos${scaledLabel}`);
                    videoFilters.push(`color=c=black@0:s=${windowW}x${windowH}:r=60:d=${exportDuration.toFixed(3)},format=rgba${canvasLabel}`);
                    videoFilters.push(`${canvasLabel}${scaledLabel}overlay=x='${overlayXExpr}':y='${overlayYExpr}':eval=frame:shortest=1:eof_action=endall:format=auto${nextLabel}`);
                } else {
                    const centeredCropXExpr = `(iw*(${focusXExpr}))-(${effectW.toFixed(2)}/2)`;
                    const centeredCropYExpr = `(ih*(${focusYExpr}))-(${effectH.toFixed(2)}/2)`;
                    const originCropXExpr = `(iw-${effectW.toFixed(2)})*(${focusXExpr})`;
                    const originCropYExpr = `(ih-${effectH.toFixed(2)})*(${focusYExpr})`;
                    const cropXExpr = `max(0\\,min(iw-${effectW}\\,${originCropXExpr}+(${centeredCropXExpr}-${originCropXExpr})*${centerWeightExpr}))`;
                    const cropYExpr = `max(0\\,min(ih-${effectH}\\,${originCropYExpr}+(${centeredCropYExpr}-${originCropYExpr})*${centerWeightExpr}))`;

                    videoFilters.push(`${videoOut}format=rgba,scale=w='iw*${contentScaleExpr}':h='ih*${contentScaleExpr}':eval=frame:flags=lanczos${scaledLabel}`);
                    videoFilters.push(`${scaledLabel}crop=w=${effectW}:h=${effectH}:x='${cropXExpr}':y='${cropYExpr}'${nextLabel}`);
                }
                videoOut = nextLabel;
                effectIdx++;
            }

            for (const fx of nonScaleContentEffects) {
                const start = fx.startTime.toFixed(3);
                const end = (fx.startTime + fx.duration).toFixed(3);
                const startNum = fx.startTime;
                const endNum = fx.startTime + fx.duration;
                const fade = Math.max(0.1, fx.duration * computeEffectFadeRatio(fx.duration));
                const fadeInEnd = (startNum + fade).toFixed(3);
                const fadeOutStart = (endNum - fade).toFixed(3);

                const pIn = `((t-${start})/${fade.toFixed(3)})`;
                const pOut = `((${end}-t)/${fade.toFixed(3)})`;
                const easeIn = `(0.5-0.5*cos(PI*${pIn}))`;
                const easeOut = `(0.5-0.5*cos(PI*${pOut}))`;
                const envelope = `if(lt(t\\,${start})\\,0\\,if(lt(t\\,${fadeInEnd})\\,${easeIn}\\,if(lt(t\\,${fadeOutStart})\\,1\\,if(lt(t\\,${end})\\,${easeOut}\\,0))))`;
                const enable = `between(t\\,${start}\\,${end})`;
                const mult = getEffectIntensity(fx) / 100;
                const prevLabel = videoOut;
                const nextLabel = `[fx${effectIdx}]`;

                if (fx.type === 'blur_area') {
                    const area = normalizeArea(fx.zoomArea ?? { x: 25, y: 25, width: 50, height: 50 });
                    const blurStrength = Math.max(2, Math.round(5 + mult * 10));
                    const splitB = `[fxsB${effectIdx}]`;
                    const blurred = `[fxbl${effectIdx}]`;
                    const cropped = `[fxcr${effectIdx}]`;
                    const faded = `[fxfade${effectIdx}]`;
                    videoFilters.push(`${prevLabel}split[fxsA${effectIdx}]${splitB}`);
                    videoFilters.push(`${splitB}boxblur=${blurStrength}:2${blurred}`);
                    videoFilters.push(`${blurred}crop=iw*${(area.width / 100).toFixed(4)}:ih*${(area.height / 100).toFixed(4)}:iw*${(area.x / 100).toFixed(4)}:ih*${(area.y / 100).toFixed(4)}${cropped}`);
                    videoFilters.push(`${cropped}format=rgba,fade=t=in:st=${start}:d=${fade.toFixed(3)}:alpha=1,fade=t=out:st=${fadeOutStart}:d=${fade.toFixed(3)}:alpha=1${faded}`);
                    videoFilters.push(`[fxsA${effectIdx}]${faded}overlay=x=W*${(area.x / 100).toFixed(4)}:y=H*${(area.y / 100).toFixed(4)}:enable='${enable}'${nextLabel}`);
                    videoOut = nextLabel;
                } else if (fx.type === 'exposure') {
                    videoFilters.push(`${prevLabel}eq=brightness=${(0.2 * mult).toFixed(3)}*(${envelope}):enable='${enable}'${nextLabel}`);
                    videoOut = nextLabel;
                }
                effectIdx++;
            }
        }

        // 3. Prepare Window/Padding Scaling
        if (windowW !== effectW || windowH !== effectH) {
            const prePadLabel = `[prepad]`;
            videoFilters.push(`${videoOut}scale=${windowW}:${windowH}:flags=lanczos${prePadLabel}`);
            videoOut = prePadLabel;
        }

        // 4. Apply Window Effects (3D Tilt, Card Flip) - operates on Result of content effects + scale down
        if (windowEffects.length > 0) {
            // New target size for tilt is the scaled export window.
            const winW = windowW;
            const winH = windowH;

            for (const fx of windowEffects) {
                const start = fx.startTime.toFixed(3);
                const end = (fx.startTime + fx.duration).toFixed(3);
                const active = `between(t\\,${start}\\,${end})`;
                const mult = getEffectIntensity(fx) / 100;
                const prevLabel = videoOut;
                const nextLabel = `[fxwindow${effectIdx}]`;
                const windowFade = Math.max(0.1, fx.duration * computeEffectFadeRatio(fx.duration));
                const windowFadeInEnd = (fx.startTime + windowFade).toFixed(3);
                const windowFadeOutStart = (fx.startTime + fx.duration - windowFade).toFixed(3);
                const windowPIn = `((t-${start})/${windowFade.toFixed(3)})`;
                const windowPOut = `((${end}-t)/${windowFade.toFixed(3)})`;
                const windowEaseIn = `(0.5-0.5*cos(PI*${windowPIn}))`;
                const windowEaseOut = `(0.5-0.5*cos(PI*${windowPOut}))`;
                const windowEnvelope = `if(lt(t\\,${start})\\,0\\,if(lt(t\\,${windowFadeInEnd})\\,${windowEaseIn}\\,if(lt(t\\,${windowFadeOutStart})\\,1\\,if(lt(t\\,${end})\\,${windowEaseOut}\\,0))))`;

                if (fx.type === '3d_tilt') {
                    const dir = (fx as any).tiltDirection ?? 'orbital';
                    const dur = fx.duration.toFixed(3);
                    const progress = `((t-${start})/${dur})`;
                    const eased = `(0.5-0.5*cos(PI*${progress}))`;
                    const motionEnvelope = `(${eased})*(${windowEnvelope})`;
                    const orbitX = `sin(2*PI*${progress})`;
                    const orbitY = `cos(2*PI*${progress})`;
                    const tiltZoom = `(1+0.030*${mult.toFixed(4)}*if(${active}\\,${motionEnvelope}\\,0))`;

                    let panX = '0', panY = '0', rot = '0';
                    if (dir === 'left') { panX = `-0.012*${mult.toFixed(4)}*${motionEnvelope}`; rot = `-3.2*${mult.toFixed(4)}*${motionEnvelope}`; }
                    else if (dir === 'right') { panX = `0.012*${mult.toFixed(4)}*${motionEnvelope}`; rot = `3.2*${mult.toFixed(4)}*${motionEnvelope}`; }
                    else if (dir === 'up') { panY = `-0.009*${mult.toFixed(4)}*${motionEnvelope}`; rot = `-1.2*${mult.toFixed(4)}*${motionEnvelope}`; }
                    else if (dir === 'down') { panY = `0.009*${mult.toFixed(4)}*${motionEnvelope}`; rot = `1.2*${mult.toFixed(4)}*${motionEnvelope}`; }
                    else {
                        panX = `0.010*${mult.toFixed(4)}*${motionEnvelope}*${orbitX}`;
                        panY = `0.006*${mult.toFixed(4)}*${motionEnvelope}*${orbitY}`;
                        rot = `2.2*${mult.toFixed(4)}*${motionEnvelope}*${orbitX}`;
                    }

                    const tbase = `[tbase${effectIdx}]`;
                    videoFilters.push(`${prevLabel}crop='iw/${tiltZoom}':'ih/${tiltZoom}':'max(0,min(iw-ow,(iw-ow)/2+iw*if(${active},${panX},0)))':'max(0,min(ih-oh,(ih-oh)/2+ih*if(${active},${panY},0)))',scale=${winW}:${winH}:flags=lanczos${tbase}`);
                    videoFilters.push(`${tbase}rotate='if(${active},${rot}*PI/180,0)':fillcolor=none:ow=rotw(iw):oh=roth(ih),crop=${winW}:${winH}:(iw-ow)/2:(ih-oh)/2${nextLabel}`);
                    videoOut = nextLabel;
                } else if (fx.type === 'card_flip') {
                    const dur = Math.max(0.001, fx.duration).toFixed(3);
                    const rawWidthRatio = `(0.08+0.92*abs(cos(PI*(t-${start})/${dur})))`;
                    const widthRatio = `1-(1-${rawWidthRatio})*(${windowEnvelope})`;
                    const activeWidthExpr = `trunc(max(2\\,iw*${widthRatio})/2)*2`;
                    const scaledLabel = `[flipscale${effectIdx}]`;
                    const paddedLabel = `[flippad${effectIdx}]`;
                    const shadowAlpha = (0.10 + mult * 0.18).toFixed(3);
                    const shadowWidth = `max(2\\,iw*(1-${widthRatio})*0.10)`;
                    const shadowX = `max(0\\,min(iw-${shadowWidth}\\,(iw-${shadowWidth})/2))`;
                    const flipPadColor = hasFrame
                        ? 'black@0'
                        : (hasStyledBackground ? ffBgColor : '#000000');

                    // Keep card_flip on the reliable path: compress the card width on a shared stage
                    // and add a center seam shadow instead of relying on hflip/timeline-specific filters.
                    videoFilters.push(`${prevLabel}format=rgba,scale=w='if(${active}\\,${activeWidthExpr}\\,iw)':h=ih:eval=frame:flags=lanczos${scaledLabel}`);
                    videoFilters.push(`${scaledLabel}pad=w=${winW}:h=${winH}:x=(ow-iw)/2:y=(oh-ih)/2:color='${flipPadColor}'${paddedLabel}`);
                    videoFilters.push(`${paddedLabel}drawbox=x='if(${active}\\,${shadowX}\\,(iw-2)/2)':y=0:w='if(${active}\\,${shadowWidth}\\,2)':h=ih:color=black@${shadowAlpha}:t=fill:enable='${active}'${nextLabel}`);
                    videoOut = nextLabel;
                }
                effectIdx++;
            }
        }

        // 5. Finalize Padding/Overlay (Background/Solid Color)
        if (textImageInputs.length > 0) {
            textImageInputs.forEach((overlay, i) => {
                const inputIdx = textImageInputStartIdx + i;
                const scaledLabel = `[textimg${i}]`;
                const nextLabel = `[textimgfx${i}]`;
                const start = overlay.startTime.toFixed(3);
                const end = (overlay.startTime + overlay.duration).toFixed(3);
                videoFilters.push(`[${inputIdx}:v]format=rgba,scale=${effectW}:${effectH}${scaledLabel}`);
                videoFilters.push(`${videoOut}${scaledLabel}overlay=0:0:enable='between(t\\,${start}\\,${end})':shortest=1:eof_action=endall:format=auto${nextLabel}`);
                videoOut = nextLabel;
            });
        }

        if (drawTextOverlays.length > 0) {
            drawTextOverlays.forEach((tov, i) => {
                const start = tov.startTime.toFixed(3);
                const end = (tov.startTime + tov.duration).toFixed(3);
                const escapedText = (tov.text || '')
                    .replace(/\r\n/g, '\n')
                    .replace(/\r/g, '\n')
                    .replace(/\\/g, '\\\\')
                    .replace(/\n/g, '\\n')
                    .replace(/,/g, '\\,')
                    .replace(/:/g, '\\:')
                    .replace(/'/g, "'\\''")
                    .replace(/%/g, '\\%');

                const fontColor = normalizeFfmpegColor(tov.color, 'white');
                const fontSize = `${Math.max(10, Math.round(tov.fontSize || 40))}`;
                let drawtext = `drawtext=text='${escapedText}':fontsize=${fontSize}:fontcolor=${fontColor}:x=(w*${(tov.x / 100).toFixed(4)})-text_w/2:y=(h*${(tov.y / 100).toFixed(4)})-text_h/2:enable='between(t\\,${start}\\,${end})'`;

                if (tov.backgroundColor) {
                    const boxColor = normalizeFfmpegColor(tov.backgroundColor, 'black').replace(/@.*$/, '');
                    const opacity = tov.backgroundOpacity ?? 0.8;
                    const bPadding = tov.padding ?? 5;
                    drawtext += `:box=1:boxcolor=${boxColor}@${opacity.toFixed(2)}:boxborderw=${bPadding}`;
                }

                if ((tov.borderWidth ?? 0) > 0) {
                    const borderWidth = Math.max(1, Math.round(tov.borderWidth ?? 0));
                    const borderColor = normalizeFfmpegColor(tov.borderColor, '#020617');
                    drawtext += `:borderw=${borderWidth}:bordercolor=${borderColor}`;
                }

                if (tov.shadowColor) {
                    const sColor = normalizeFfmpegColor(tov.shadowColor, 'black');
                    const sx = tov.shadowOffsetX ?? 2;
                    const sy = tov.shadowOffsetY ?? 2;
                    drawtext += `:shadowcolor=${sColor}:shadowx=${sx}:shadowy=${sy}`;
                }

                const fontPart = process.platform === 'win32'
                    ? `:fontfile='C\\:/Windows/Fonts/${tov.fontWeight === 'bold' ? 'arialbd.ttf' : 'arial.ttf'}'`
                    : '';
                drawtext += fontPart;

                const nextLabel = `[txt${i}]`;
                videoFilters.push(`${videoOut}${drawtext}${nextLabel}`);
                videoOut = nextLabel;
            });
        }

        // Overlay additional audio tracks if present
        if (audios.length > 0) {
            audios.forEach((a, i) => {
                const inputIdx = i + 1;
                const dur = a.duration.toFixed(3);
                const vol = a.volume.toFixed(2);
                // Resample to 44.1k and convert to float to avoid amix conflicts
                audioFilters.push(`[${inputIdx}:a]atrim=start=0:duration=${dur},asetpts=PTS-STARTPTS,aresample=44100,aformat=sample_fmts=flt,volume=${vol},adelay=${(a.startTime * 1000).toFixed(0)}|${(a.startTime * 1000).toFixed(0)}[aud${i}]`);
            });

            let mixInputs = audioOut || '';
            if (mixInputs) {
                // If main audio exists, resample it too for consistency
                const resampledMain = '[mainres]';
                audioFilters.push(`${audioOut}aresample=44100,aformat=sample_fmts=flt${resampledMain}`);
                mixInputs = resampledMain;
            }

            const mixCount = audios.length + (audioOut ? 1 : 0);
            audios.forEach((_, i) => { mixInputs += `[aud${i}]`; });
            audioFilters.push(`${mixInputs}amix=inputs=${mixCount}:duration=longest:dropout_transition=2[finalaud]`);
            audioOut = '[finalaud]';
        }

        // Final audio safety: if no audio yet but hasAudio was true (e.g. segments failed), fallback to original
        if (!audioOut && hasAudio) {
            audioFilters.push(`[0:a]aresample=44100,aformat=sample_fmts=flt[safeaud]`);
            audioOut = '[safeaud]';
        }

        // Apply Premium Voice Enhancement (Studio Sound)
        if (premiumVoice && audioOut) {
            const denomLabel = '[denoised]';
            const compLabel = '[compressed]';
            const eqLabel = '[vocal_eq]';
            // 1. Noise Reduction (afftdn)
            audioFilters.push(`${audioOut}afftdn=nf=-25${denomLabel}`);
            // 2. Multiband compression/leveling
            audioFilters.push(`${denomLabel}acompressor=threshold=-15dB:ratio=4:makeup=5${compLabel}`);
            // 3. Vocal EQ bump
            audioFilters.push(`${compLabel}equalizer=f=3000:width_type=h:width=200:g=3${eqLabel}`);
            audioOut = eqLabel;
        }

        if (audioOut) {
            const audioTrimLabel = '[afinaltrim]';
            audioFilters.push(`${audioOut}atrim=duration=${exportDurationLabel},asetpts=PTS-STARTPTS${audioTrimLabel}`);
            audioOut = audioTrimLabel;
        }
        if (annotationInputs.length > 0) {
            annotationInputs.forEach((overlay, i) => {
                const inputIdx = annotationInputStartIdx + i;
                const scaledLabel = `[annoimg${i}]`;
                const nextLabel = `[annofx${i}]`;
                const start = overlay.startTime.toFixed(3);
                const end = (overlay.startTime + overlay.duration).toFixed(3);
                videoFilters.push(`[${inputIdx}:v]format=rgba,scale=${windowW}:${windowH}${scaledLabel}`);
                videoFilters.push(`${videoOut}${scaledLabel}overlay=0:0:enable='between(t\\,${start}\\,${end})':shortest=1:eof_action=endall:format=auto${nextLabel}`);
                videoOut = nextLabel;
            });
        }

        if (imageOverlayInputs.length > 0) {
            imageOverlayInputs.forEach((overlay, i) => {
                const inputIdx = imageOverlayInputStartIdx + i;
                const scaledLabel = `[imgoverlay${i}]`;
                const nextLabel = `[imgoverlayfx${i}]`;
                const start = overlay.startTime.toFixed(3);
                const end = (overlay.startTime + overlay.duration).toFixed(3);
                if (overlay.renderMode === 'fullscreen') {
                    videoFilters.push(`[${inputIdx}:v]format=rgba,scale=${effectW}:${effectH}:force_original_aspect_ratio=decrease,pad=${effectW}:${effectH}:(ow-iw)/2:(oh-ih)/2:color=black${scaledLabel}`);
                    videoFilters.push(`${videoOut}${scaledLabel}overlay=0:0:enable='between(t\\,${start}\\,${end})':shortest=1:eof_action=endall:format=auto${nextLabel}`);
                    videoOut = nextLabel;
                    return;
                }

                const width = Math.max(2, Math.round(effectW * clamp01(overlay.width)));
                const height = Math.max(2, Math.round(effectH * clamp01(overlay.height)));
                const x = Math.max(0, Math.min(effectW - width, Math.round(effectW * clamp01(overlay.x))));
                const y = Math.max(0, Math.min(effectH - height, Math.round(effectH * clamp01(overlay.y))));
                videoFilters.push(`[${inputIdx}:v]format=rgba,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black@0${scaledLabel}`);
                videoFilters.push(`${videoOut}${scaledLabel}overlay=${x}:${y}:enable='between(t\\,${start}\\,${end})':shortest=1:eof_action=endall:format=auto${nextLabel}`);
                videoOut = nextLabel;
            });
        }

        // Color Grading applied directly to the video out
        if (colorGrade && colorGrade !== 'none') {
            let eqParams = '';
            switch (colorGrade) {
                case 'nordic_cold': eqParams = 'saturation=0.85:contrast=1.1:brightness=0.05,colorbalance=rs=-0.1:gs=-0.05:bs=0.1'; break;
                case 'vibrant_pop': eqParams = 'saturation=1.3:contrast=1.05'; break;
                case 'moody_teal': eqParams = 'saturation=0.9:contrast=1.2,colorbalance=rs=-0.1:bs=0.15:rm=0.1:gm=0.05'; break;
                case 'vintage_film': eqParams = 'saturation=0.8:contrast=0.9,colorbalance=rs=0.1:gs=0.05:bs=-0.1:rm=0.1'; break;
                case 'studio_clean': eqParams = 'saturation=1.1:contrast=1.05:brightness=0.03'; break;
            }
            if (eqParams) {
                videoFilters.push(`${videoOut}eq=${eqParams}[outcg]`);
                videoOut = '[outcg]';
            }
        }

        if (needsFinalFrameCanvas) {
            const padLabel = '[finalFrame]';
            const bgLabel = '[framebg]';
            pushBackgroundCanvas(bgLabel, frameW, frameH);
            videoFilters.push(`${bgLabel}${videoOut}overlay=(W-w)/2:(H-h)/2:shortest=1:eof_action=endall:format=auto${padLabel}`);
            videoOut = padLabel;
        }

        if (addWatermark) {
            const shortEdge = Math.max(240, Math.min(frameW, frameH));
            if (watermarkInputIdx !== -1) {
                const rightMargin = Math.max(10, Math.round(shortEdge * 0.018));
                const bottomMargin = Math.max(10, Math.round(shortEdge * 0.018));
                const logoWidth = Math.max(112, Math.min(260, Math.round(shortEdge * 0.28)));
                const scaledLabel = '[wmbrandscale]';
                const nextLabel = '[outwm]';
                videoFilters.push(`[${watermarkInputIdx}:v]format=rgba,scale=${logoWidth}:-1:flags=lanczos,colorchannelmixer=aa=0.72${scaledLabel}`);
                videoFilters.push(`${videoOut}${scaledLabel}overlay=x='W-w-${rightMargin}':y='H-h-${bottomMargin}':shortest=1:eof_action=endall:format=auto${nextLabel}`);
                videoOut = nextLabel;
            }
        }

        const videoTrimLabel = '[vfinaltrim]';
        videoFilters.push(`${videoOut}trim=duration=${exportDurationLabel},setpts=PTS-STARTPTS${videoTrimLabel}`);
        videoOut = videoTrimLabel;

        // Even dimensions MUST be the very last video filter for h264 compatibility
        videoFilters.push(`${videoOut}scale=trunc(iw/2)*2:trunc(ih/2)*2:flags=lanczos,setsar=1[vfinal]`);
        videoOut = '[vfinal]';

        const selectedQuality = quality || 'high';
        const qualityArgs =
            selectedQuality === 'fast'
                ? { preset: 'veryfast', crf: '22' }
                : selectedQuality === 'balanced'
                    ? { preset: 'fast', crf: '18' }
                    : { preset: 'slow', crf: '15' };

        const allFilters = [...videoFilters, ...audioFilters].join(';');
        const videoOnlyFilters = videoFilters.join(';');
        const allFiltersScriptPath = writeFilterScript(allFilters, 'full');
        const videoOnlyFiltersScriptPath = writeFilterScript(videoOnlyFilters, 'video-only');
        const encodeTail = [
            '-t', exportDuration.toFixed(3),
            '-r', '60',
            '-c:v', 'libx264',
            '-preset', qualityArgs.preset,
            '-crf', qualityArgs.crf,
            '-pix_fmt', 'yuv420p',
            '-movflags', '+faststart',
            outputPath,
        ];
        const primaryArgs = [
            ...args,
            '-filter_complex_script', allFiltersScriptPath,
            '-map', videoOut,
            ...(audioOut ? ['-map', audioOut, '-c:a', 'aac'] : ['-an']),
            ...encodeTail,
        ];
        const noAudioFallbackArgs = [
            ...args,
            '-filter_complex_script', videoOnlyFiltersScriptPath,
            '-map', videoOut,
            '-an',
            ...encodeTail,
        ];

        const runFfmpeg = (runArgs: string[]) => new Promise<{ code: number; stderr: string; stalled: boolean }>((resolve, reject) => {
            const proc = spawn(ffmpegPath!, runArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
            let stderr = '';
            let stalled = false;
            let settled = false;
            let forceResolveTimer: NodeJS.Timeout | null = null;
            const startedAt = Date.now();
            let lastProgressAt = startedAt;
            let lastProgressSeconds = -1;

            const finish = (result: { code: number; stderr: string; stalled: boolean }) => {
                if (settled) return;
                settled = true;
                clearInterval(progressWatchdog);
                if (forceResolveTimer) {
                    clearTimeout(forceResolveTimer);
                }
                resolve(result);
            };

            const terminateProc = () => {
                if (proc.killed) return;
                if (process.platform === 'win32' && proc.pid) {
                    try {
                        const killer = spawn('taskkill', ['/pid', String(proc.pid), '/t', '/f'], {
                            stdio: 'ignore',
                            windowsHide: true,
                        });
                        killer.on('error', () => {
                            try {
                                proc.kill();
                            } catch {
                                // Ignore secondary kill errors.
                            }
                        });
                    } catch {
                        try {
                            proc.kill();
                        } catch {
                            // Ignore secondary kill errors.
                        }
                    }
                    return;
                }

                try {
                    proc.kill('SIGKILL');
                } catch {
                    // Ignore secondary kill errors.
                }
            };

            const progressWatchdog = setInterval(() => {
                if (settled || stalled) return;
                const now = Date.now();
                const timeoutMs = lastProgressSeconds >= 0
                    ? FFMPEG_PROGRESS_STALL_TIMEOUT_MS
                    : FFMPEG_INITIAL_PROGRESS_TIMEOUT_MS;
                if ((now - lastProgressAt) < timeoutMs) return;

                stalled = true;
                const idleSeconds = Math.round((now - lastProgressAt) / 1000);
                const stallMessage = `\n${FFMPEG_STALL_MARKER}: no progress for ${idleSeconds}s\n`;
                stderr += stallMessage;
                console.error(`${FFMPEG_STALL_MARKER}; terminating encode`, {
                    idleSeconds,
                    lastProgressSeconds,
                });
                terminateProc();
                forceResolveTimer = setTimeout(() => {
                    finish({ code: -1, stderr, stalled: true });
                }, 5_000);
            }, FFMPEG_PROGRESS_CHECK_INTERVAL_MS);

            proc.stderr.on('data', (data: Buffer) => {
                const line = data.toString();
                stderr += line;
                if (line.includes('time=')) {
                    const match = line.match(/time=(\d+:\d+:\d+\.\d+)/);
                    if (match) {
                        const progressSeconds = parseFfmpegTimestampSeconds(match[1]);
                        if (Number.isFinite(progressSeconds) && progressSeconds > (lastProgressSeconds + 0.001)) {
                            lastProgressSeconds = progressSeconds;
                            lastProgressAt = Date.now();
                            if (typeof onProgress === 'function' && exportDuration > 0) {
                                onProgress(
                                    Math.max(0, Math.min(1, progressSeconds / exportDuration)),
                                    progressSeconds,
                                    exportDuration,
                                );
                            }
                        }
                        console.log('[VideoRenderer] Progress:', match[1]);
                    }
                }
            });

            proc.on('close', (code: number) => finish({ code: stalled ? -1 : code, stderr, stalled }));
            proc.on('error', (err: Error) => {
                clearInterval(progressWatchdog);
                if (forceResolveTimer) {
                    clearTimeout(forceResolveTimer);
                }
                reject(err);
            });
        });

        console.log('[VideoRenderer] Export config:', {
            padding,
            hasFrame,
            frameW,
            frameH,
            windowW,
            windowH,
            isCinematic: !!isCinematic,
            bgInputIdx,
            bgColor: ffBgColor,
            effectCount: effects.length,
            filterGraphLength: allFilters.length,
            filterScript: allFiltersScriptPath,
        });
        console.log('[VideoRenderer] FFmpeg full args:', JSON.stringify(primaryArgs));

        return new Promise((resolve, reject) => {
            runFfmpeg(primaryArgs)
                .then(async ({ code, stderr, stalled }) => {
                    if (code === 0) {
                        this.lastRenderInfo = buildRenderInfo('none');
                        perf.end({ outputPath });
                        const stat = fs.statSync(outputPath);
                        console.log('[VideoRenderer] Export complete:', outputPath, `(${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
                        cleanupTempOverlays();
                        resolve(outputPath);
                        return;
                    }

                    const audioPacketFailure = /Could not open encoder before EOF|received no packets|Error submitting audio frame|output.*unconnected|binding filtergraph/i.test(stderr);
                    if (audioOut && audioPacketFailure) {
                        console.warn('[VideoRenderer] Audio stream failed during export; retrying without audio track');
                        const retry = await runFfmpeg(noAudioFallbackArgs);
                        if (retry.code === 0) {
                            this.lastRenderInfo = buildRenderInfo('none');
                            perf.end({ outputPath, audioFallback: true });
                            console.log('[VideoRenderer] Export complete without audio fallback:', outputPath);
                            cleanupTempOverlays();
                            resolve(outputPath);
                            return;
                        }
                        perf.end({ failed: true, code: retry.code, audioFallback: true });
                        console.error('[VideoRenderer] FFmpeg fallback (no audio) failed with code', retry.code);
                        console.error('[VideoRenderer] stderr:', retry.stderr.substring(retry.stderr.length - 500));
                        cleanupTempOverlays();
                        reject(new Error(`FFmpeg exited with code ${retry.code}: ${retry.stderr.substring(retry.stderr.length - 200)}`));
                        return;
                    }

                    const transitionFailure = canRetryWithCutTransitions
                        && (stalled || /xfade|acrossfade|concat|Error while filtering|Failed to configure output pad|non monotonically increasing dts|Error reinitializing filters/i.test(stderr));
                    if (transitionFailure) {
                        console.warn('[VideoRenderer] Timeline transition failed during export; retrying with cut transitions only');
                        try {
                            const fallbackPath = await this.processVideo(
                                inputPath,
                                outputPath,
                                segments,
                                crop,
                                backgroundColor,
                                videoPadding,
                                outputFrameSize,
                                audioSegments,
                                addWatermark,
                                smartEffects,
                                quality,
                                transitionType,
                                textOverlays,
                                annotationImageOverlays,
                                imageOverlays,
                                imageClips,
                                clipTransitions,
                                colorGrade,
                                premiumVoice,
                                { forceCutTransitions: true, onProgress }
                            );
                            const retryInfo = this.getLastRenderInfo();
                            this.lastRenderInfo = {
                                requestedEffectTypes: requestedEffects.map((fx) => fx.type),
                                exportedEffectTypes: retryInfo.exportedEffectTypes,
                                fallbackMode: retryInfo.fallbackMode,
                                transitionFallbackMode: 'cut',
                            };
                            perf.end({ outputPath, transitionFallback: true, stalled });
                            cleanupTempOverlays();
                            resolve(fallbackPath);
                            return;
                        } catch (fallbackErr) {
                            console.error('[VideoRenderer] Cut-transition fallback failed:', fallbackErr);
                        }
                    }

                    const effectGraphFailure = effects.length > 0
                        && (stalled || /Invalid argument|Error while filtering|Undefined constant|missing \(|Failed to configure output pad|Error reinitializing filters|Error applying option|Option not found/i.test(stderr));
                    if (effectGraphFailure) {
                        console.error('[VideoRenderer] Smart effects stderr:', stderr.substring(Math.max(0, stderr.length - 1200)));
                        const fallbackEffects = requestedEffects.filter((fx) => RELIABLE_FALLBACK_EFFECT_TYPES.has(fx.type));
                        const canRetryWithFewerEffects = fallbackEffects.length > 0 && fallbackEffects.length < requestedEffects.length;
                        if (canRetryWithFewerEffects) {
                            console.warn('[VideoRenderer] Smart effects failed during export; retrying with reliable subset only');
                            try {
                                const fallbackPath = await this.processVideo(
                                    inputPath,
                                    outputPath,
                                    segments,
                                    crop,
                                    backgroundColor,
                                    videoPadding,
                                    outputFrameSize,
                                    audioSegments,
                                    addWatermark,
                                    fallbackEffects,
                                    quality,
                                    transitionType,
                                    textOverlays,
                                    annotationImageOverlays,
                                    imageOverlays,
                                    imageClips,
                                    clipTransitions,
                                    colorGrade,
                                    premiumVoice,
                                    { forceCutTransitions, onProgress }
                                );
                                const retryInfo = this.getLastRenderInfo();
                                this.lastRenderInfo = {
                                    requestedEffectTypes: requestedEffects.map((fx) => fx.type),
                                    exportedEffectTypes: retryInfo.exportedEffectTypes,
                                    fallbackMode: retryInfo.fallbackMode === 'none' ? 'reliable_subset' : retryInfo.fallbackMode,
                                    transitionFallbackMode: retryInfo.transitionFallbackMode,
                                };
                                perf.end({ outputPath, effectsFallback: true });
                                cleanupTempOverlays();
                                resolve(fallbackPath);
                                return;
                            } catch (fallbackErr) {
                                console.error('[VideoRenderer] Reliable subset fallback failed:', fallbackErr);
                            }
                        }

                        console.warn('[VideoRenderer] Smart effects failed during export; retrying without smart effects');
                        try {
                            const fallbackPath = await this.processVideo(
                                inputPath,
                                outputPath,
                                segments,
                                crop,
                                backgroundColor,
                                videoPadding,
                                outputFrameSize,
                                audioSegments,
                                addWatermark,
                                [],
                                quality,
                                transitionType,
                                textOverlays,
                                annotationImageOverlays,
                                imageOverlays,
                                imageClips,
                                clipTransitions,
                                colorGrade,
                                premiumVoice,
                                { forceCutTransitions, onProgress }
                            );
                            const retryInfo = this.getLastRenderInfo();
                            this.lastRenderInfo = {
                                requestedEffectTypes: requestedEffects.map((fx) => fx.type),
                                exportedEffectTypes: retryInfo.exportedEffectTypes,
                                fallbackMode: retryInfo.fallbackMode === 'none' ? 'no_effects' : retryInfo.fallbackMode,
                                transitionFallbackMode: retryInfo.transitionFallbackMode,
                            };
                            perf.end({ outputPath, effectsFallback: true });
                            cleanupTempOverlays();
                            resolve(fallbackPath);
                            return;
                        } catch (fallbackErr) {
                            console.error('[VideoRenderer] Smart effect fallback failed:', fallbackErr);
                        }
                    }

                    perf.end({ failed: true, code });
                    console.error('[VideoRenderer] FFmpeg failed with code', code);
                    console.error('[VideoRenderer] stderr (last 800):', stderr.substring(stderr.length - 800));
                    // Write full stderr to temp file for debugging
                    try {
                        const logPath = path.join(getageofscreenTempDir(), `ageofscreen-ffmpeg-error-${Date.now()}.log`);
                        const fullFilterScript = fs.existsSync(allFiltersScriptPath)
                            ? fs.readFileSync(allFiltersScriptPath, 'utf8')
                            : null;
                        const videoOnlyFilterScript = fs.existsSync(videoOnlyFiltersScriptPath)
                            ? fs.readFileSync(videoOnlyFiltersScriptPath, 'utf8')
                            : null;
                        const meta = {
                            code,
                            source: { path: inputPath, width: sourceW, height: sourceH, hasAudio },
                            audios: audioProbeInfos,
                            segments,
                            effects: requestedEffects,
                            exportedEffects: effects,
                            skippedEffects: skippedEffects.map((fx) => fx.type),
                            filterScriptPath: allFiltersScriptPath,
                            videoOnlyFilterScriptPath: videoOnlyFiltersScriptPath,
                        };
                        fs.writeFileSync(
                            logPath,
                            `Exit code: ${code}\n\nMeta:\n${JSON.stringify(meta, null, 2)}\n\nFull args:\n${JSON.stringify(primaryArgs, null, 2)}\n\nFull filter script:\n${fullFilterScript ?? '[missing]'}\n\nVideo-only fallback filter script:\n${videoOnlyFilterScript ?? '[missing]'}\n\nFull stderr:\n${stderr}`,
                        );
                        console.error('[VideoRenderer] Full error log written to:', logPath);
                    } catch { /* ignore logging failure */ }
                    cleanupTempOverlays();
                    reject(new Error(`FFmpeg exited with code ${code}: ${stderr.substring(stderr.length - 400)}`));
                })
                .catch((err: Error) => {
                    perf.end({ failed: true, error: err.message });
                    console.error('[VideoRenderer] Spawn error:', err.message);
                    cleanupTempOverlays();
                    reject(err);
                });
        });
    }

    // Legacy method for backward compatibility
    async joinSegments(videoPath: string, segments: RenderSegment[], outputPath: string): Promise<string> {
        return this.processVideo(videoPath, outputPath, segments, null);
    }
}

export const videoRenderer = new VideoRenderer();
