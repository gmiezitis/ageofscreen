/**
 * SnipFocus Design System - Spacing
 * 4px base grid system
 */

export const spacing = {
    // Base unit (4px)
    unit: 4,

    // Spacing scale
    0: '0',
    1: '4px',    // 1 unit
    2: '8px',    // 2 units
    3: '12px',   // 3 units
    4: '16px',   // 4 units
    5: '20px',   // 5 units
    6: '24px',   // 6 units
    8: '32px',   // 8 units
    10: '40px',  // 10 units
    12: '48px',  // 12 units
    16: '64px',  // 16 units
    20: '80px',  // 20 units
    24: '96px',  // 24 units
    32: '128px', // 32 units
} as const;

export const borderRadius = {
    none: '0',
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    '2xl': '24px',
    full: '9999px',
} as const;

export const shadows = {
    none: 'none',
    sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
    md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
    lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
    xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
    '2xl': '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
    inner: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)',
} as const;

export const zIndex = {
    base: 0,
    dropdown: 1000,
    sticky: 1100,
    fixed: 1200,
    modalBackdrop: 1300,
    modal: 1400,
    popover: 1500,
    tooltip: 1600,
    notification: 1700,
    max: 9999,
} as const;
