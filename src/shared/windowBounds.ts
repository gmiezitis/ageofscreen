export const parseWindowHandleFromSourceId = (sourceId: string): string | null => {
    if (typeof sourceId !== 'string') return null;
    const trimmed = sourceId.trim();
    const match = /^window:(\d+)(?::\d+)?$/.exec(trimmed);
    return match ? match[1] : null;
};
