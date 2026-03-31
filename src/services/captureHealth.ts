/**
 * Capture health metrics and status for recording reliability.
 * Used by RecordingManager and displayed in the recording widget.
 */

export type CaptureHealthStatus = 'healthy' | 'degraded' | 'poor';

export interface CaptureHealthMetrics {
  droppedFrames: number;
  bufferErrors: number;
  effectiveFps: number | null;
  status: CaptureHealthStatus;
}

const FPS_HEALTHY = 20;
const FPS_DEGRADED = 15;
const ERROR_DEGRADED = 2;
const ERROR_POOR = 4;

export function computeStatus(metrics: {
  droppedFrames: number;
  bufferErrors: number;
  effectiveFps: number | null;
}): CaptureHealthStatus {
  if (metrics.bufferErrors >= ERROR_POOR) return 'poor';
  if (metrics.bufferErrors >= ERROR_DEGRADED) return 'degraded';
  if (metrics.effectiveFps !== null) {
    if (metrics.effectiveFps < FPS_DEGRADED) return 'poor';
    if (metrics.effectiveFps < FPS_HEALTHY) return 'degraded';
  }
  return 'healthy';
}

export function createHealthTracker() {
  let droppedFrames = 0;
  let bufferErrors = 0;
  const fpsSamples: number[] = [];
  const FPS_WINDOW_MS = 2000;

  return {
    recordDroppedFrame: () => {
      droppedFrames++;
    },
    recordBufferError: () => {
      bufferErrors++;
    },
    recordFrameDrawn: () => {
      const now = performance.now();
      if (fpsSamples.length > 0) {
        const elapsed = now - fpsSamples[0];
        if (elapsed >= FPS_WINDOW_MS) {
          fpsSamples.shift();
        }
      }
      fpsSamples.push(now);
    },
    getMetrics: (): CaptureHealthMetrics => {
      let effectiveFps: number | null = null;
      if (fpsSamples.length >= 2) {
        const span = fpsSamples[fpsSamples.length - 1] - fpsSamples[0];
        if (span > 0) {
          effectiveFps = Math.round(((fpsSamples.length - 1) / span) * 1000);
        }
      }
      const status = computeStatus({ droppedFrames, bufferErrors, effectiveFps });
      return { droppedFrames, bufferErrors, effectiveFps, status };
    },
    reset: () => {
      droppedFrames = 0;
      bufferErrors = 0;
      fpsSamples.length = 0;
    },
  };
}
