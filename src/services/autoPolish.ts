/**
 * Auto-Polish v1 - Deterministic local video cleanup pipeline.
 * One-click: smart trim, silence removal, loudness normalize, clean style, export.
 * No AI, no cloud - runs entirely with FFmpeg.
 */

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { perfMark } from '../utils/perf';

const getFfprobePath = (ffmpegPath: string): string | null => {
  const dir = path.dirname(ffmpegPath);
  const ext = path.extname(ffmpegPath);
  const p = path.join(dir, 'ffprobe' + ext);
  return fs.existsSync(p) ? p : null;
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

/** Get video duration in seconds using ffprobe. Returns null if unavailable. */
async function getDuration(filePath: string, ffmpegPath: string): Promise<number | null> {
  const ffprobePath = getFfprobePath(ffmpegPath);
  if (!ffprobePath) return null;

  return new Promise((resolve) => {
    const proc = spawn(ffprobePath, [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath
    ], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) {
        const n = parseFloat(out.trim());
        resolve(isNaN(n) ? null : n);
      } else resolve(null);
    });
    proc.on('error', () => resolve(null));
  });
}

/** Check if input has audio stream. Returns false if no audio or probe fails. */
async function hasAudioStream(filePath: string, ffmpegPath: string): Promise<boolean> {
  const ffprobePath = getFfprobePath(ffmpegPath);
  if (!ffprobePath) return false;

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

export interface AutoPolishConfig {
  /** FFmpeg executable path */
  ffmpegPath: string;
  /** Clean style: padding percentage (0-20) */
  padding?: number;
  /** Background color hex */
  backgroundColor?: string;
  /** Add "Made with ageofscreen" watermark (free plan) */
  addWatermark?: boolean;
}

export interface AutoPolishPlannerConfig {
  ffmpegPath: string;
  trimSilence?: boolean;
  applyVisualPreset?: boolean;
  applyFocusMotion?: boolean;
  enhanceVoice?: boolean;
  minLeadingSilence?: number;
  minTrailingSilence?: number;
  minInteriorSilence?: number;
  edgeKeepSeconds?: number;
  interiorKeepSeconds?: number;
  minKeepSegmentSeconds?: number;
}

export interface AutoPolishSegment {
  startSeconds: number;
  endSeconds: number;
}

export interface AutoPolishPlanResult {
  success: boolean;
  beforeDuration?: number;
  afterDuration?: number;
  trimmedSeconds: number;
  appliedChanges: string[];
  focusEffectCount: number;
  usedVoiceEnhancement: boolean;
  usedFallbackPreview: boolean;
  hasAudio: boolean;
  segments: AutoPolishSegment[];
  error?: string;
}

export interface AutoPolishResult {
  success: boolean;
  outputPath?: string;
  beforeDuration?: number;
  afterDuration?: number;
  error?: string;
}

const DEFAULT_CONFIG: Partial<AutoPolishConfig> = {
  padding: 0,
  backgroundColor: '#1a1a1f',
};

const DEFAULT_PLANNER_CONFIG: Partial<AutoPolishPlannerConfig> = {
  trimSilence: true,
  applyVisualPreset: true,
  applyFocusMotion: true,
  enhanceVoice: true,
  minLeadingSilence: 0.7,
  minTrailingSilence: 0.8,
  minInteriorSilence: 1.3,
  edgeKeepSeconds: 0.08,
  interiorKeepSeconds: 0.12,
  minKeepSegmentSeconds: 0.7,
};

type SilenceRange = {
  start: number;
  end: number;
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const mergeRanges = (ranges: SilenceRange[]): SilenceRange[] => {
  const sorted = [...ranges]
    .filter((range) => range.end - range.start > 0.001)
    .sort((a, b) => a.start - b.start);

  if (sorted.length === 0) return [];

  const merged: SilenceRange[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i += 1) {
    const current = sorted[i];
    const previous = merged[merged.length - 1];
    if (current.start <= previous.end + 0.001) {
      previous.end = Math.max(previous.end, current.end);
      continue;
    }
    merged.push({ ...current });
  }
  return merged;
};

async function detectSilenceRanges(filePath: string, ffmpegPath: string): Promise<SilenceRange[]> {
  return new Promise((resolve) => {
    const args = [
      '-hide_banner',
      '-i', filePath,
      '-af', 'silencedetect=noise=-35dB:d=0.6',
      '-f', 'null',
      '-',
    ];

    const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', () => {
      const lines = stderr.split(/\r?\n/);
      const ranges: SilenceRange[] = [];
      let activeStart: number | null = null;

      for (const line of lines) {
        const startMatch = line.match(/silence_start:\s*([0-9.]+)/);
        if (startMatch) {
          activeStart = Number.parseFloat(startMatch[1]);
          continue;
        }

        const endMatch = line.match(/silence_end:\s*([0-9.]+)/);
        if (endMatch) {
          const end = Number.parseFloat(endMatch[1]);
          const start = activeStart ?? 0;
          if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
            ranges.push({ start, end });
          }
          activeStart = null;
        }
      }

      resolve(mergeRanges(ranges));
    });

    proc.on('error', () => resolve([]));
  });
}

function buildKeepSegments(duration: number, silenceRanges: SilenceRange[], config: Required<Omit<AutoPolishPlannerConfig, 'ffmpegPath'>>) {
  if (duration <= 0) {
    return [{ startSeconds: 0, endSeconds: 0 }];
  }

  const removals: SilenceRange[] = [];

  silenceRanges.forEach((range) => {
    const silenceDuration = range.end - range.start;
    const isLeading = range.start <= 0.18;
    const isTrailing = range.end >= duration - 0.18;

    if (isLeading && silenceDuration >= config.minLeadingSilence) {
      removals.push({
        start: 0,
        end: clamp(range.end - config.edgeKeepSeconds, 0, duration),
      });
      return;
    }

    if (isTrailing && silenceDuration >= config.minTrailingSilence) {
      removals.push({
        start: clamp(range.start + config.edgeKeepSeconds, 0, duration),
        end: duration,
      });
      return;
    }

    if (silenceDuration >= config.minInteriorSilence) {
      const start = clamp(range.start + config.interiorKeepSeconds, 0, duration);
      const end = clamp(range.end - config.interiorKeepSeconds, 0, duration);
      if (end - start >= 0.45) {
        removals.push({ start, end });
      }
    }
  });

  const mergedRemovals = mergeRanges(removals);
  if (mergedRemovals.length === 0) {
    return [{ startSeconds: 0, endSeconds: duration }];
  }

  const keepSegments: AutoPolishSegment[] = [];
  let cursor = 0;

  for (const removal of mergedRemovals) {
    if (removal.start - cursor >= config.minKeepSegmentSeconds) {
      keepSegments.push({ startSeconds: cursor, endSeconds: removal.start });
    }
    cursor = Math.max(cursor, removal.end);
  }

  if (duration - cursor >= config.minKeepSegmentSeconds) {
    keepSegments.push({ startSeconds: cursor, endSeconds: duration });
  }

  return keepSegments.length > 0
    ? keepSegments
    : [{ startSeconds: 0, endSeconds: duration }];
}

export async function planAutoPolish(
  inputPath: string,
  config: AutoPolishPlannerConfig
): Promise<AutoPolishPlanResult> {
  const perf = perfMark('autoPolish:plan');
  const plannerConfig = { ...DEFAULT_PLANNER_CONFIG, ...config } as Required<AutoPolishPlannerConfig>;

  if (!fs.existsSync(inputPath)) {
    return {
      success: false,
      trimmedSeconds: 0,
      appliedChanges: [],
      focusEffectCount: 0,
      usedVoiceEnhancement: false,
      usedFallbackPreview: false,
      hasAudio: false,
      segments: [],
      error: 'Input file not found',
    };
  }

  const beforeDuration = await getDuration(inputPath, plannerConfig.ffmpegPath);
  if (!beforeDuration || beforeDuration <= 0) {
    perf.end({ failed: true });
    return {
      success: false,
      trimmedSeconds: 0,
      appliedChanges: [],
      focusEffectCount: 0,
      usedVoiceEnhancement: false,
      usedFallbackPreview: false,
      hasAudio: false,
      segments: [],
      error: 'Could not read video duration',
    };
  }

  const hasAudio = await hasAudioStream(inputPath, plannerConfig.ffmpegPath);
  const silenceRanges = hasAudio && plannerConfig.trimSilence
    ? await detectSilenceRanges(inputPath, plannerConfig.ffmpegPath)
    : [];
  const segments = buildKeepSegments(beforeDuration, silenceRanges, plannerConfig);
  const afterDuration = segments.reduce((total, segment) => total + Math.max(0, segment.endSeconds - segment.startSeconds), 0);
  const trimmedSeconds = Math.max(0, beforeDuration - afterDuration);
  const appliedChanges: string[] = [];

  if (trimmedSeconds > 0.35) {
    appliedChanges.push(`trimmed ${trimmedSeconds.toFixed(1)}s`);
  }
  if (plannerConfig.applyVisualPreset) {
    appliedChanges.push('applied clean frame');
  }
  if (plannerConfig.enhanceVoice && hasAudio) {
    appliedChanges.push('voice enhanced');
  }

  perf.end({ trimmedSeconds });

  return {
    success: true,
    beforeDuration,
    afterDuration,
    trimmedSeconds,
    appliedChanges,
    focusEffectCount: 0,
    usedVoiceEnhancement: plannerConfig.enhanceVoice && hasAudio,
    usedFallbackPreview: false,
    hasAudio,
    segments,
  };
}

async function runPipeline(
  ffmpegPath: string,
  inputPath: string,
  outputPath: string,
  filterComplex: string,
  mapArgs: string[],
  extraInputArgs: string[] = [],
): Promise<{ success: boolean; error?: string }> {
  const args = [
    '-y', '-i', inputPath,
    ...extraInputArgs,
    '-filter_complex', filterComplex,
    ...mapArgs,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '18',
    '-c:a', 'aac', '-b:a', '128k',
    outputPath
  ];

  return new Promise((resolve) => {
    const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on('close', (code: number) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: stderr.slice(-400) });
      }
    });

    proc.on('error', (err: Error) => {
      resolve({ success: false, error: err.message });
    });
  });
}

/**
 * Run Auto-Polish pipeline on a video file.
 * Pipeline: silenceremove (start/end) -> loudnorm -> clean style (padding) -> export
 * Falls back to video-only if no audio stream.
 */
export async function runAutoPolish(
  inputPath: string,
  outputPath: string,
  config: AutoPolishConfig
): Promise<AutoPolishResult> {
  const perf = perfMark('autoPolish:total');
  const { ffmpegPath, padding = 0, backgroundColor = '#1a1a1f', addWatermark = false } = { ...DEFAULT_CONFIG, ...config };

  if (!fs.existsSync(inputPath)) {
    return { success: false, error: 'Input file not found' };
  }

  const beforeDuration = await getDuration(inputPath, ffmpegPath);
  const hasAudio = await hasAudioStream(inputPath, ffmpegPath);

  const ffBgColor = backgroundColor.startsWith('#') ? backgroundColor : `#${backgroundColor}`;
  const padPct = Math.min(40, Math.max(0, padding));
  const scaleFactor = (1 - padPct / 100).toFixed(4);

  // Use trunc(iw/2)*2 to ensure even dimensions for h264, add setpts for consistency
  // setsar=1/fps=60 ensures consistent playback across players
  let vFilter = `[0:v]fps=60,scale=trunc(iw*${scaleFactor}/2)*2:trunc(ih*${scaleFactor}/2)*2,pad=trunc(iw/${scaleFactor}/2)*2:trunc(ih/${scaleFactor}/2)*2:(ow-iw)/2:(oh-ih)/2:color='${ffBgColor}',setsar=1,setpts=PTS-STARTPTS[vid]`;
  let videoMap = '[vid]';
  const watermarkLogoPath = addWatermark ? resolveBrandingResourcePath(EXPORT_WATERMARK_FILE) : null;
  const watermarkInputArgs = watermarkLogoPath ? ['-loop', '1', '-i', watermarkLogoPath] : [];

  if (addWatermark && watermarkLogoPath) {
    const logoWidthExpr = 'min(iw\\,ih)*0.25';
    vFilter += `;[1:v]format=rgba,scale=${logoWidthExpr}:-1:flags=lanczos,colorchannelmixer=aa=0.68[wm];[vid][wm]overlay=x=W-w-14:y=H-h-14:format=auto[vid2]`;
    videoMap = '[vid2]';
  }

  let fullResult: { success: boolean; error?: string } = { success: false, error: '' };

  if (hasAudio) {
    // Standard silenceremove + resample + norm chain
    const aFilter = `[0:a]silenceremove=start_periods=1:start_duration=0.1:start_threshold=-35dB:stop_periods=1:stop_duration=0.1:stop_threshold=-35dB,aresample=44100,aformat=sample_fmts=flt,asetpts=PTS-STARTPTS,loudnorm=I=-16:TP=-1.5:LRA=11[aud]`;
    const fullFilter = `${aFilter};${vFilter}`;
    const m = perfMark('autoPolish:fullPipeline');
    fullResult = await runPipeline(ffmpegPath, inputPath, outputPath, fullFilter, ['-map', videoMap, '-map', '[aud]'], watermarkInputArgs);
    m.end();
  }

  if (fullResult.success) {
    const afterDuration = await getDuration(outputPath, ffmpegPath);
    perf.end({ path: outputPath });
    return { success: true, outputPath, beforeDuration: beforeDuration ?? undefined, afterDuration: afterDuration ?? undefined };
  }

  // Video-only (no audio, or full pipeline failed)
  const mVideo = perfMark('autoPolish:videoOnly');
  const videoResult = await runPipeline(ffmpegPath, inputPath, outputPath, vFilter, ['-map', videoMap, '-an'], watermarkInputArgs);
  mVideo.end();

  if (videoResult.success) {
    const afterDuration = await getDuration(outputPath, ffmpegPath);
    perf.end({ path: outputPath });
    return { success: true, outputPath, beforeDuration: beforeDuration ?? undefined, afterDuration: afterDuration ?? undefined };
  }

  perf.end({ failed: true });
  return { success: false, error: fullResult.error || videoResult.error };
}
