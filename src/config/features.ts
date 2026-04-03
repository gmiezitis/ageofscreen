/**
 * Central feature flags for ageofscreen.
 * Hidden features are disabled by default; enable in dev for testing.
 */

import { RELEASE_PROFILE } from "./releaseProfile";

const parseBooleanFlag = (value: string | undefined): boolean | undefined => {
    if (value === undefined) return undefined;

    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;

    return undefined;
};

const envFlag = (name: string, fallback: boolean): boolean => {
    const value = typeof process !== "undefined" ? process.env?.[name] : undefined;
    return parseBooleanFlag(value) ?? fallback;
};

export const FEATURES = {
    /** Teleprompter during recording */
    ENABLE_TELEPROMPTER: envFlag("ENABLE_TELEPROMPTER", RELEASE_PROFILE.defaultFeatures.teleprompter),
    /** Drawing overlay during recording */
    ENABLE_DRAWING: envFlag("ENABLE_DRAWING", RELEASE_PROFILE.defaultFeatures.drawing),
    /** Focus/timer workflow in the launcher */
    ENABLE_FOCUS_WIDGET: envFlag("ENABLE_FOCUS_WIDGET", RELEASE_PROFILE.defaultFeatures.focusWidget),
    /** Ship bundled ambient timer sounds in production */
    ENABLE_FOCUS_TIMER_BUILTIN_SOUNDS: envFlag("ENABLE_FOCUS_TIMER_BUILTIN_SOUNDS", RELEASE_PROFILE.defaultFeatures.focusTimerBuiltinSounds),
    /** OCR-based smart targeting */
    ENABLE_SMART_TARGETING_OCR: envFlag("ENABLE_SMART_TARGETING_OCR", RELEASE_PROFILE.defaultFeatures.smartTargetingOcr),
    /** Live magnifier (Alt+1 zoom on click areas) */
    ENABLE_LIVE_MAGNIFIER: envFlag("ENABLE_LIVE_MAGNIFIER", RELEASE_PROFILE.defaultFeatures.liveMagnifier),
    /** Advanced auto-zoom variants (Alt+Z, Alt+3) */
    ENABLE_AUTO_ZOOM_ADVANCED: envFlag("ENABLE_AUTO_ZOOM_ADVANCED", RELEASE_PROFILE.defaultFeatures.autoZoomAdvanced),
    /** Pro tier features (watermark removal, advanced effects) */
    ENABLE_PRO_FEATURES: envFlag("ENABLE_PRO_FEATURES", RELEASE_PROFILE.defaultFeatures.proFeatures),
    /** Agent/demo automation surfaces in the launcher */
    ENABLE_AGENT_SURFACES: envFlag("ENABLE_AGENT_SURFACES", RELEASE_PROFILE.defaultFeatures.agentSurfaces),
} as const;

export type FeatureFlags = typeof FEATURES;

