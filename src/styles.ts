import type { PenSize } from "./types";

export const penSizeValues: Record<PenSize, number> = { s: 2, m: 5, l: 10, xl: 16 }; // Map size names to pixel values for PEN
export const textSizeValues: Record<PenSize, number> = { s: 12, m: 16, l: 24, xl: 32 }; // Map size names to pixel values for TEXT
export const highlighterSizeValues: Record<PenSize, number> = {
  s: 8,
  m: 16,
  l: 24,
  xl: 36,
}; // Map size names to pixel values for HIGHLIGHTER - larger sizes
