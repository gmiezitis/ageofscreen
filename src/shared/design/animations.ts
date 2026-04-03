/**
 * ageofscreen Design System - Animations
 * Smooth, delightful transitions and animations
 */

export const durations = {
    instant: '0ms',
    fast: '150ms',
    normal: '250ms',
    slow: '350ms',
    slower: '500ms',
} as const;

export const easings = {
    linear: 'linear',
    easeIn: 'cubic-bezier(0.4, 0, 1, 1)',
    easeOut: 'cubic-bezier(0, 0, 0.2, 1)',
    easeInOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    // Custom easings for premium feel
    smooth: 'cubic-bezier(0.4, 0.0, 0.2, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
    elastic: 'cubic-bezier(0.175, 0.885, 0.32, 1.275)',
} as const;

// Predefined transitions
export const transitions = {
    fast: `${durations.fast} ${easings.easeOut}`,
    normal: `${durations.normal} ${easings.easeOut}`,
    slow: `${durations.slow} ${easings.easeOut}`,
    smooth: `${durations.normal} ${easings.smooth}`,
    bounce: `${durations.slow} ${easings.bounce}`,
    elastic: `${durations.slow} ${easings.elastic}`,
} as const;

// Common animation keyframes
export const keyframes = {
    fadeIn: `
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `,
    fadeOut: `
    @keyframes fadeOut {
      from { opacity: 1; }
      to { opacity: 0; }
    }
  `,
    slideInUp: `
    @keyframes slideInUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `,
    slideInDown: `
    @keyframes slideInDown {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `,
    scaleIn: `
    @keyframes scaleIn {
      from {
        opacity: 0;
        transform: scale(0.9);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
  `,
    pulse: `
    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }
  `,
    spin: `
    @keyframes spin {
      from {
        transform: rotate(0deg);
      }
      to {
        transform: rotate(360deg);
      }
    }
  `,
} as const;

// Helper to create transition strings
export const createTransition = (
    property: string | string[],
    duration: keyof typeof durations = 'normal',
    easing: keyof typeof easings = 'easeOut'
) => {
    const props = Array.isArray(property) ? property : [property];
    return props
        .map(prop => `${prop} ${durations[duration]} ${easings[easing]}`)
        .join(', ');
};
