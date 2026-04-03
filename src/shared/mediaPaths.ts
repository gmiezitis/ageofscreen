const FILE_URL_PREFIX = 'file:///';
const APP_MEDIA_PROTOCOL_PREFIX = 'ageofscreen-media://local/';

export function isRenderableMediaUrl(value: string | null | undefined): boolean {
    if (!value) return false;
    return value.startsWith('data:') || value.startsWith('file://') || value.startsWith('blob:') || value.startsWith(APP_MEDIA_PROTOCOL_PREFIX);
}

const toPhysicalFileUrl = (filePath: string): string => {
    if (filePath.startsWith('file://')) return filePath;

    const normalizedPath = filePath.replace(/\\/g, '/');
    const encodedPath = normalizedPath
        .split('/')
        .map((part) => encodeURIComponent(part))
        .join('/')
        .replace(/^([a-zA-Z])%3A/, '$1:');

    return `${FILE_URL_PREFIX}${encodedPath}`;
};

export function toMediaFileUrl(filePath: string | null | undefined): string {
    if (!filePath) return '';
    if (filePath.startsWith('data:') || filePath.startsWith('blob:') || filePath.startsWith(APP_MEDIA_PROTOCOL_PREFIX)) {
        return filePath;
    }

    const fileUrl = toPhysicalFileUrl(filePath);
    return `${APP_MEDIA_PROTOCOL_PREFIX}${encodeURIComponent(fileUrl)}`;
}

export function fromMediaFileUrl(filePath: string): string {
    if (filePath.startsWith(APP_MEDIA_PROTOCOL_PREFIX)) {
        const decodedUrl = decodeURIComponent(filePath.slice(APP_MEDIA_PROTOCOL_PREFIX.length));
        return fromMediaFileUrl(decodedUrl);
    }

    if (!filePath.startsWith('file://')) return filePath;

    const decodedPath = decodeURIComponent(filePath.replace(/^file:\/\/\/?/, ''));
    return decodedPath.replace(/^\/([a-zA-Z]:\/)/, '$1');
}
