import type { SmartEffect } from './types';

export const DEFAULT_ZOOM_INTENSITY = 15;

type EffectType = SmartEffect['type'] | string;

export const getDefaultEffectIntensity = (type: EffectType): number => (
    type === 'zoom' || type === 'slow_zoom' ? DEFAULT_ZOOM_INTENSITY : 100
);

export const getEffectIntensity = (effect: { type: EffectType; intensity?: number | null }): number => (
    typeof effect.intensity === 'number' ? effect.intensity : getDefaultEffectIntensity(effect.type)
);
