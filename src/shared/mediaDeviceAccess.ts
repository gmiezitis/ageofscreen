const DEFAULT_RETRY_DELAYS_MS = [0, 500, 1000, 2000];

export const getMediaErrorName = (err: unknown): string => (
    typeof err === 'object' && err !== null && 'name' in err
        ? String((err as { name?: unknown }).name || '')
        : ''
);

export const describeMediaError = (err: unknown): string => {
    if (typeof err !== 'object' || err === null) {
        return String(err);
    }

    const details = err as {
        name?: unknown;
        message?: unknown;
        constraint?: unknown;
    };

    return JSON.stringify({
        name: details.name,
        message: details.message,
        constraint: details.constraint,
    });
};

const isRetryableCameraStartError = (err: unknown): boolean => {
    const errorName = getMediaErrorName(err);
    return errorName === 'NotReadableError' || errorName === 'TrackStartError';
};

const isTerminalMediaError = (err: unknown): boolean => {
    const errorName = getMediaErrorName(err);
    return (
        errorName === 'NotAllowedError'
        || errorName === 'PermissionDeniedError'
        || errorName === 'NotFoundError'
        || errorName === 'DevicesNotFoundError'
    );
};

const wait = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));

export const getUserMediaWithFallback = async (
    candidates: MediaStreamConstraints[],
    label: string,
    retryDelaysMs = DEFAULT_RETRY_DELAYS_MS,
): Promise<MediaStream> => {
    let lastError: unknown = null;

    for (const constraints of candidates) {
        for (const delay of retryDelaysMs) {
            if (delay > 0) await wait(delay);

            try {
                return await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
                lastError = err;
                if (isTerminalMediaError(err)) {
                    throw err;
                }
                if (!isRetryableCameraStartError(err) || delay === retryDelaysMs[retryDelaysMs.length - 1]) {
                    break;
                }
                console.warn(`[MediaDevices] ${label} camera start was busy, retrying:`, describeMediaError(err));
            }
        }

        console.warn(`[MediaDevices] ${label} constraints failed, trying fallback:`, describeMediaError(lastError));
    }

    throw lastError || new DOMException(`${label} media stream could not start.`, 'NotReadableError');
};
