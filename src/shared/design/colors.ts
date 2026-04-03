/**
 * ageofscreen Design System - Colors
 * Scandinavian-inspired color palette
 */

export const colors = {
    // Primary - Cool blue-grey
    primary: {
        50: '#f0f4f8',
        100: '#d9e2ec',
        200: '#bcccdc',
        300: '#9fb3c8',
        400: '#829ab1',
        500: '#627d98',   // Main primary
        600: '#486581',
        700: '#334e68',
        800: '#243b53',
        900: '#102a43',
    },

    // Accent - Warm coral/salmon
    accent: {
        50: '#ffe8e8',
        100: '#ffd1d1',
        200: '#ffb3b3',
        300: '#ff8585',
        400: '#ff5c5c',
        500: '#ff3d3d',   // Main accent
        600: '#e62e2e',
        700: '#cc1f1f',
        800: '#991717',
        900: '#660f0f',
    },

    // Success - Muted green
    success: {
        50: '#e3f9e5',
        100: '#c1f2c7',
        200: '#91e697',
        300: '#51ca58',
        400: '#31b237',
        500: '#18981d',   // Main success
        600: '#0f8613',
        700: '#0a7010',
        800: '#06570a',
        900: '#033d06',
    },

    // Warning - Warm amber
    warning: {
        50: '#fffbea',
        100: '#fff3c4',
        200: '#fce588',
        300: '#fadb5f',
        400: '#f7c948',
        500: '#f0b429',   // Main warning
        600: '#de911d',
        700: '#cb6e17',
        800: '#b44d12',
        900: '#8d2b0b',
    },

    // Error - Vibrant red
    error: {
        50: '#ffe0e0',
        100: '#ffc2c2',
        200: '#ff9999',
        300: '#ff6b6b',
        400: '#ff4444',
        500: '#ff1a1a',   // Main error
        600: '#e60000',
        700: '#cc0000',
        800: '#990000',
        900: '#660000',
    },

    // Neutral - Clean greys
    neutral: {
        0: '#ffffff',
        50: '#f7f9fa',
        100: '#f1f3f5',
        200: '#e9ecef',
        300: '#dee2e6',
        400: '#ced4da',
        500: '#adb5bd',
        600: '#868e96',
        700: '#495057',
        800: '#343a40',
        900: '#212529',
        1000: '#000000',
    },

    // Semantic colors for specific use cases
    semantic: {
        background: '#ffffff',
        backgroundDark: '#0f0f17',
        surface: '#f7f9fa',
        surfaceDark: '#1a1a24',
        border: '#e9ecef',
        borderDark: '#2a2a38',
        text: '#212529',
        textSecondary: '#495057',
        textTertiary: '#868e96',
        textInverse: '#ffffff',
        overlay: 'rgba(0, 0, 0, 0.5)',
        overlayLight: 'rgba(0, 0, 0, 0.2)',
    },

    // Task colors (for focus feature)
    task: {
        green: '#18981d',
        yellow: '#f0b429',
        red: '#ff3d3d',
    },

    // Annotation tool colors
    annotation: {
        pen: '#ff3d3d',
        highlighter: '#fadb5f',
        text: '#212529',
        arrow: '#627d98',
        shape: '#627d98',
        blur: '#9fb3c8',
    },
} as const;

export type ColorScale = keyof typeof colors;
export type ColorShade = 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
