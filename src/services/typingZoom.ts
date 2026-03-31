export interface TypingZoomState {
  isZoomed: boolean;
  x: number;
  y: number;
  changed: boolean;
}

export interface TypingZoomConfig {
  /** Milliseconds of stillness before we assume typing and zoom in */
  stillnessMs?: number;
  /** Pixel movement that immediately exits zoom */
  movementPx?: number;
  /** If no cursor activity for this long, disable zoom (AFK guard) */
  idleMs?: number;
}

const DEFAULTS: Required<TypingZoomConfig> = {
  stillnessMs: 800,
  movementPx: 25,
  idleMs: 10000,
};

export class TypingZoomDetector {
  private lastPos = { x: 0, y: 0 };
  private lastMoveTs = 0;
  private isZoomed = false;
  private cfg: Required<TypingZoomConfig>;

  constructor(cfg?: TypingZoomConfig) {
    this.cfg = { ...DEFAULTS, ...cfg };
  }

  /** Update with latest cursor position. Returns state when it changed or on first call. */
  update(x: number, y: number): TypingZoomState | null {
    const now = Date.now();
    const dx = x - this.lastPos.x;
    const dy = y - this.lastPos.y;
    const dist = Math.hypot(dx, dy);

    // Initialize on first call
    if (this.lastMoveTs === 0) {
      this.lastMoveTs = now;
      this.lastPos = { x, y };
      return { isZoomed: false, x, y, changed: true };
    }

    if (dist > 1) {
      this.lastMoveTs = now;
      this.lastPos = { x, y };
    }

    const sinceMove = now - this.lastMoveTs;
    const recentlyActive = sinceMove < this.cfg.idleMs;

    let nextZoom = this.isZoomed;

    // If inactive for too long, always zoom out
    if (!recentlyActive) {
      nextZoom = false;
    } else if (this.isZoomed) {
      // Exit zoom on significant movement
      if (dist >= this.cfg.movementPx) {
        nextZoom = false;
      }
    } else {
      // Enter zoom when still long enough
      if (sinceMove >= this.cfg.stillnessMs) {
        nextZoom = true;
      }
    }

    const changed = nextZoom !== this.isZoomed;
    this.isZoomed = nextZoom;

    return changed ? { isZoomed: nextZoom, x, y, changed } : null;
  }
}

export function createTypingZoomDetector(cfg?: TypingZoomConfig) {
  return new TypingZoomDetector(cfg);
}
