/**
 * ageofscreen Design System
 * Central export for all design tokens
 */

export * from './colors';
export * from './spacing';
export * from './typography';
export * from './animations';

import { colors } from './colors';
import { spacing, borderRadius, shadows, zIndex } from './spacing';
import { fonts, fontSizes, fontWeights, lineHeights, letterSpacing, textStyles } from './typography';
import { durations, easings, transitions, keyframes, createTransition } from './animations';

// Complete design system object
export const theme = {
    colors,
    spacing,
    borderRadius,
    shadows,
    zIndex,
    fonts,
    fontSizes,
    fontWeights,
    lineHeights,
    letterSpacing,
    textStyles,
    durations,
    easings,
    transitions,
    keyframes,
    createTransition,
} as const;

export type Theme = typeof theme;
