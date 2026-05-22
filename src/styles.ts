import type { PenSize } from "./types";

export const penSizeValues: Record<PenSize, number> = { s: 2, m: 5, l: 12, xl: 24 }; // Increased L and added XL
export const textSizeValues: Record<PenSize, number> = { s: 14, m: 22, l: 36, xl: 64 }; // Substantially increased for "even bigger"
export const highlighterSizeValues: Record<PenSize, number> = {
  s: 10,
  m: 20,
  l: 40,
  xl: 80,
}; // Map size names to pixel values for HIGHLIGHTER - larger sizes
