import path from 'path';

export type SupportedMediaDialogType = 'video' | 'image' | 'audio';
const SUPPORTED_MEDIA_EXTENSIONS = new Set([
    '.mp4', '.webm', '.mov', '.avi', '.mkv', '.m4v',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
    '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac',
]);

export const isPathInsideDirectory = (filePath: string, baseDir: string): boolean => {
    if (!filePath || !baseDir) return false;
    const resolvedBaseDir = path.resolve(baseDir);
    const resolvedFilePath = path.resolve(filePath);
    const normalizedBaseDir = resolvedBaseDir.replace(/\\/g, '/').toLowerCase();
    const normalizedFilePath = resolvedFilePath.replace(/\\/g, '/').toLowerCase();
    const basePrefix = normalizedBaseDir.endsWith('/') ? normalizedBaseDir : `${normalizedBaseDir}/`;
    return normalizedFilePath === normalizedBaseDir || normalizedFilePath.startsWith(basePrefix);
};

export const isSupportedMediaDialogType = (value: unknown): value is SupportedMediaDialogType => {
    return value === 'video' || value === 'image' || value === 'audio';
};

export const isSupportedCaptureInvokeType = (value: unknown): value is 'get-displays' => {
    return value === 'get-displays';
};

export const isSupportedMediaFilePath = (filePath: string): boolean => {
    if (!filePath) return false;
    const extension = path.extname(filePath).toLowerCase();
    return SUPPORTED_MEDIA_EXTENSIONS.has(extension);
};
