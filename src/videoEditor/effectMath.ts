/**
 * Canonical effect math shared by preview (React) and export (FFmpeg).
 *
 * Every coordinate helper and constant lives here so the two pipelines
 * can never drift out of sync.
 */

/* ─── Spring physics for 3D tilt ─── */

import { TiltDirection, SmartEffect } from './types';

/**
 * Damped spring envelope: f(t) = 1 - e^(-ζωt) · cos(ω√(1-ζ²)·t)
 * Returns 0→1 with overshoot/bounce based on stiffness & damping.
 */
export const springEnvelope = (t: number, stiffness: number, damping: number): number => {
    const omega = stiffness;
    const zeta = damping;
    if (zeta >= 1) {
        return 1 - Math.exp(-omega * t) * (1 + omega * t);
    }
    const wd = omega * Math.sqrt(1 - zeta * zeta);
    return 1 - Math.exp(-zeta * omega * t) * Math.cos(wd * t);
};

/** Map user-facing snappiness (0-100) to physics parameters. */
export const snapToSpring = (snap: number): { stiffness: number; damping: number } => {
    const t = Math.max(0, Math.min(100, snap)) / 100;
    return {
        stiffness: 8 + t * 24,
        damping: 0.85 - t * 0.4,
    };
};

/**
 * Compute 3D tilt angles at a given progress (0→1) in the effect.
 * Returns { rotateX, rotateY, scale } ready for CSS or FFmpeg.
 */
export const computeTilt = (
    progress: number,
    direction: TiltDirection,
    intensity: number,
    snap: number,
): { translateX: number; translateY: number; rotate: number; scale: number } => {
    const mult = intensity / 100;
    const { stiffness, damping } = snapToSpring(snap);
    const spring = springEnvelope(progress * 3, stiffness, damping);
    const maxX = 20 * mult;
    const maxY = 14 * mult;
    const maxRotate = 4.5 * mult;

    let translateX = 0;
    let translateY = 0;
    let rotate = 0;

    switch (direction) {
        case 'left':
            translateX = -maxX * spring;
            rotate = -maxRotate * spring;
            break;
        case 'right':
            translateX = maxX * spring;
            rotate = maxRotate * spring;
            break;
        case 'up':
            translateY = -maxY * spring;
            rotate = -maxRotate * 0.35 * spring;
            break;
        case 'down':
            translateY = maxY * spring;
            rotate = maxRotate * 0.35 * spring;
            break;
        case 'orbital':
        default:
            translateX = Math.sin(progress * Math.PI * 2) * maxX * 0.7 * spring;
            translateY = Math.cos(progress * Math.PI * 2) * maxY * 0.45 * spring;
            rotate = Math.sin(progress * Math.PI * 2) * maxRotate * 0.8 * spring;
            break;
    }

    const scale = 1 + 0.08 * mult * Math.min(1, spring);

    return { translateX, translateY, rotate, scale };
};

/* ─── Area normalisation ─── */

export interface NormalizedArea {
    x: number;
    y: number;
    width: number;
    height: number;
}

export const normalizeArea = (area: { x: number; y: number; width: number; height: number }): NormalizedArea => {
    const width = Math.max(2, Math.min(100, area.width || 40));
    const height = Math.max(2, Math.min(100, area.height || 40));
    const x = Math.max(0, Math.min(100 - width, area.x || 0));
    const y = Math.max(0, Math.min(100 - height, area.y || 0));
    return { x, y, width, height };
};

/* ─── Zoom math (used by both preview CSS + FFmpeg filter) ─── */

export const ZOOM_EASE_IN = 0.52;
export const ZOOM_EASE_OUT = 0.68;
export const ZOOM_MAX = 2;
export const TILT_RANGE = 18; // max % shift at full tilt
export const PREVIEW_ZOOM_CENTER_STRENGTH = 0.88;

export const easeInOutCubic = (t: number): number =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const smootherStep = (t: number): number => {
    const p = Math.max(0, Math.min(1, t));
    return p * p * p * (p * (p * 6 - 15) + 10);
};

/**
 * Soft ramp-in/ramp-out envelope for any effect.
 * fadeIn/fadeOut are fractions of the effect's duration (0-1 range).
 */
export const effectEnvelope = (progress: number, fadeIn = 0.08, fadeOut = 0.08): number => {
    const p = Math.max(0, Math.min(1, progress));
    if (p < fadeIn) return easeInOutCubic(p / Math.max(0.0001, fadeIn));
    if (p > 1 - fadeOut) return easeInOutCubic((1 - p) / Math.max(0.0001, fadeOut));
    return 1;
};

export const computeEffectFadeRatio = (duration: number): number => {
    const safeDuration = Math.max(0, duration);
    const targetFadeSecs = Math.min(1.25, Math.max(0.75, safeDuration * 0.32));
    return safeDuration > 0
        ? Math.max(0.0001, Math.min(0.45, targetFadeSecs / safeDuration))
        : 0.18;
};

export const computeZoomFactor = (progress: number): number => {
    const p = Math.max(0, Math.min(1, progress));
    if (p <= 0 || p >= 1) return 0;
    if (p < ZOOM_EASE_IN) {
        const attack = p / Math.max(0.0001, ZOOM_EASE_IN);
        return smootherStep(attack);
    }
    if (p > ZOOM_EASE_OUT) {
        const release = (1 - p) / Math.max(0.0001, 1 - ZOOM_EASE_OUT);
        return smootherStep(release);
    }
    return 1;
};

export const computeBaseZoom = (area: NormalizedArea): number =>
    Math.min(ZOOM_MAX, 100 / Math.max(20, Math.min(area.width, area.height)));

export const computeEffectiveCx = (cx: number, tiltNorm: number): number =>
    Math.max(0, Math.min(100, cx + tiltNorm * TILT_RANGE));

export const computeFollowCursorCoord = (baseCoord: number, cursorCoord: number, intensity = 100): number => {
    const safeBase = Math.max(0, Math.min(100, baseCoord));
    const safeCursor = Math.max(0, Math.min(100, cursorCoord));
    const followStrength = Math.max(0, Math.min(1, intensity / 100));
    return safeBase + (safeCursor - safeBase) * followStrength;
};

export const computeSafeFocusCoord = (coord: number, span: number): number => {
    // Keep the selected focus area on-screen without blocking edge/corner targets.
    const margin = Math.max(0.5, Math.min(49.5, span / 2));
    return Math.max(margin, Math.min(100 - margin, coord));
};

export const computeFocusCenteringOffset = (coord: number): number => {
    const safeCoord = Math.max(0, Math.min(100, coord));
    return 50 - safeCoord;
};

export const computeZoomEdgeDamping = (x: number, y: number): number => {
    const safeX = Math.max(0, Math.min(100, x));
    const safeY = Math.max(0, Math.min(100, y));
    const edgeSeverity = Math.max(Math.abs(safeX - 50) / 50, Math.abs(safeY - 50) / 50);
    return 1 - 0.24 * Math.pow(edgeSeverity, 1.35);
};

export const computeZoomCropStartOffset = (
    scaledSpan: number,
    outputSpan: number,
    focusRatio: number,
    centerWeight: number,
): number => {
    const safeScaledSpan = Math.max(0, scaledSpan);
    const safeOutputSpan = Math.max(0, outputSpan);
    const safeFocus = Math.max(0, Math.min(1, focusRatio));
    const safeCenterWeight = Math.max(0, Math.min(1, centerWeight));
    const overflow = Math.max(0, safeScaledSpan - safeOutputSpan);

    // Matching the preview requires keeping the transform-origin bias even before
    // the focus-centering blend kicks in. Starting from a centered crop makes
    // different zoom areas collapse toward the same exported region.
    return overflow * safeFocus + safeOutputSpan * (safeFocus - 0.5) * safeCenterWeight;
};

/* ─── Gradient mapping (preview CSS ↔ FFmpeg solid fallback) ─── */

export const GRADIENT_CSS: Record<string, string> = {
    gradient_midnight: 'linear-gradient(135deg, #0a0f1e, #162140)',
    gradient_obsidian: 'linear-gradient(135deg, #0d1117, #1c2432)',
    gradient_indigo: 'linear-gradient(135deg, #0f0a2a, #1e1258)',
    gradient_violet: 'linear-gradient(135deg, #13111f, #221a3a)',
    gradient_oxide: 'linear-gradient(135deg, #180a0a, #2d1010)',
    gradient_forest: 'linear-gradient(135deg, #091812, #122d1a)',
    gradient_carbon: 'linear-gradient(135deg, #18181b, #27272a)',
    gradient_space: 'linear-gradient(135deg, #0d0d0d, #0d0d1a, #16213e)',
    glow_blue: 'linear-gradient(180deg, #04070f 0%, #09101c 100%)',
    glow_red: 'linear-gradient(180deg, #0b0610 0%, #140914 100%)',
    glow_green: 'linear-gradient(180deg, #04090a 0%, #091112 100%)',
    glow_sky_soft: 'linear-gradient(180deg, #050811 0%, #0b1322 100%)',
    glow_sky_dense: 'linear-gradient(180deg, #04070f 0%, #09101c 100%)',
    glow_rose_soft: 'linear-gradient(180deg, #0c0710 0%, #160b14 100%)',
    glow_rose_dense: 'linear-gradient(180deg, #0b0610 0%, #140914 100%)',
    glow_mint_soft: 'linear-gradient(180deg, #050b0c 0%, #0b1415 100%)',
    glow_mint_dense: 'linear-gradient(180deg, #04090a 0%, #091112 100%)',
};

import bgFluidContours from '../assets/backgrounds/bg_fluid_contours.png';
import bgGeometricFolds from '../assets/backgrounds/bg_geometric_folds.png';
import bgObsidianTerrain from '../assets/backgrounds/bg_obsidian_terrain.png';
import bgWavyGrid from '../assets/backgrounds/bg_wavy_grid.png';
import bgNeonPulse from '../assets/backgrounds/bg_neon_pulse.png';
import bgGraphiteDunes from '../assets/backgrounds/bg_graphite_dunes.png';
import bgTitaniumCurves from '../assets/backgrounds/bg_titanium_curves.png';
import bgEtherealSmoke from '../assets/backgrounds/bg_ethereal_smoke.png';
import bgAuroraDark from '../assets/backgrounds/bg_aurora_dark.png';
import bgVelvetShadow from '../assets/backgrounds/bg_velvet_shadow.png';
import bgAbyssalWaves from '../assets/backgrounds/bg_abyssal_waves.png';
import bgLunarDust from '../assets/backgrounds/bg_lunar_dust.png';
import bgCosmicWeb from '../assets/backgrounds/bg_cosmic_web.png';
import bgSilentVoid from '../assets/backgrounds/bg_silent_void.png';
import bgMetallicMesh from '../assets/backgrounds/bg_metallic_mesh.png';
import bgStarlightBlur from '../assets/backgrounds/bg_starlight_blur.png';
import bgDeepOceanGlow from '../assets/backgrounds/bg_deep_ocean_glow.png';

export const CINEMATIC_CSS: Record<string, string> = {
    bg_geometric_folds: `url(${bgGeometricFolds})`,
    bg_wavy_grid: `url(${bgWavyGrid})`,
    bg_fluid_contours: `url(${bgFluidContours})`,
    bg_abyssal_waves: `url(${bgAbyssalWaves})`,
    bg_obsidian_terrain: `url(${bgObsidianTerrain})`,
    bg_neon_pulse: `url(${bgNeonPulse})`,
    bg_graphite_dunes: `url(${bgGraphiteDunes})`,
    bg_titanium_curves: `url(${bgTitaniumCurves})`,
    bg_ethereal_smoke: `url(${bgEtherealSmoke})`,
    bg_aurora_dark: `url(${bgAuroraDark})`,
    bg_velvet_shadow: `url(${bgVelvetShadow})`,
    bg_lunar_dust: `url(${bgLunarDust})`,
    bg_cosmic_web: `url(${bgCosmicWeb})`,
    bg_silent_void: `url(${bgSilentVoid})`,
    bg_metallic_mesh: `url(${bgMetallicMesh})`,
    bg_starlight_blur: `url(${bgStarlightBlur})`,
    bg_deep_ocean_glow: `url(${bgDeepOceanGlow})`,
};

export const GRADIENT_SOLID_FALLBACK: Record<string, string> = {
    gradient_midnight: '#0a0f1e',
    gradient_obsidian: '#0d1117',
    gradient_indigo: '#0f0a2a',
    gradient_violet: '#13111f',
    gradient_oxide: '#180a0a',
    gradient_forest: '#091812',
    gradient_carbon: '#18181b',
    gradient_space: '#0d0d0d',
    glow_blue: '#09101c',
    glow_red: '#140914',
    glow_green: '#091112',
    glow_sky_soft: '#0b1322',
    glow_sky_dense: '#09101c',
    glow_rose_soft: '#160b14',
    glow_rose_dense: '#140914',
    glow_mint_soft: '#0b1415',
    glow_mint_dense: '#091112',
    anim_glow: '#0a0a0f',
    anim_particles: '#0a0a0f',
    anim_waves: '#0a0a0f',
    anim_aurora: '#0a0a0f',
    anim_fireflies: '#0a0a0f',
};

/** Resolve a background key to the CSS value used by the preview. */
export const resolveBackgroundCSS = (bg: string | undefined): string => {
    if (!bg || bg === 'transparent') return 'transparent';
    if (bg === 'smart_light') return '#0a0a0f';
    if (bg.startsWith('#')) return bg;
    if (GRADIENT_CSS[bg]) return GRADIENT_CSS[bg];
    if (CINEMATIC_CSS[bg]) return CINEMATIC_CSS[bg];
    if (bg.startsWith('anim_')) return '#0a0a0f';
    return bg;
};

/** Resolve a background key to a solid hex for FFmpeg (no gradients).*/
export const resolveBackgroundFFmpeg = (bg: string | undefined): string => {
    if (!bg || bg === 'transparent') return '#000000';
    if (bg === 'smart_light') return '#000000';
    if (GRADIENT_SOLID_FALLBACK[bg]) return GRADIENT_SOLID_FALLBACK[bg];
    if (CINEMATIC_CSS[bg]) return '#1a1a2e';
    if (bg.startsWith('bg_')) return '#1a1a2e';
    if (bg.startsWith('#')) return bg;
    return '#000000';
};

/** Returns blur px (0–10) based on how fast the zoom level is changing at `timeS`. */
export function computeZoomTransitionBlur(effects: SmartEffect[], timeS: number): number {
    return 0;
}
