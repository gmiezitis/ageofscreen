/**
 * Lightweight perf markers.
 * Enable by setting localStorage key "snipfocus_perf" = "1" in the renderer devtools.
 * In main process, it falls back to process.env.SF_PERF === "1".
 */

const isPerfEnabled = (): boolean => {
  try {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('snipfocus_perf') === '1';
    }
  } catch {
    // ignore
  }
  return typeof process !== 'undefined' && process.env.SF_PERF === '1';
};

export const perfMark = (label: string) => {
  if (!isPerfEnabled()) {
    return { end: (_extra?: Record<string, unknown>) => {} };
  }
  const start = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    end: (extra?: Record<string, unknown>) => {
      const end = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const ms = end - start;
      // eslint-disable-next-line no-console
      console.log(`[PERF] ${label}`, { ms: Number(ms.toFixed(2)), ...(extra || {}) });
    }
  };
};

export const perfWrapSync = <T>(label: string, fn: () => T): T => {
  const m = perfMark(label);
  try {
    return fn();
  } finally {
    m.end();
  }
};

export const perfWrapAsync = async <T>(label: string, fn: () => Promise<T>): Promise<T> => {
  const m = perfMark(label);
  try {
    return await fn();
  } finally {
    m.end();
  }
};
