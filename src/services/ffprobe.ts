import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

export const resolveFfprobePath = (ffmpegPath: string | null): string | null => {
  if (!ffmpegPath) return null;
  const dir = path.dirname(ffmpegPath);
  const ext = path.extname(ffmpegPath);
  const candidate = path.join(dir, 'ffprobe' + ext);
  return fs.existsSync(candidate) ? candidate : null;
};

/**
 * Lightweight audio-stream presence check shared across FFmpeg-based services.
 */
export const hasAudioStream = async (
  ffmpegPath: string | null,
  filePath: string
): Promise<boolean> => {
  const ffprobePath = resolveFfprobePath(ffmpegPath);
  if (!ffprobePath) return false;

  return new Promise((resolve) => {
    const proc = spawn(ffprobePath, [
      '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type',
      '-of', 'csv=p=0', filePath
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let out = '';
    proc.stdout?.on('data', (d: Buffer) => { out += d.toString(); });
    proc.on('close', (code) => resolve(code === 0 && out.trim().length > 0));
    proc.on('error', () => resolve(false));
  });
};
