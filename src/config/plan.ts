/**
 * Runtime defaults for Free/Pro tiers.
 * Entitlement state should come from the main-process provider, not from this file.
 */

const parsePlanTier = (value: string | undefined): PlanTier | null => {
    const normalized = value?.trim().toLowerCase();
    if (normalized === "free") return "free";
    if (normalized === "pro") return "pro";
    return null;
};

const parseBooleanFlag = (value: string | undefined): boolean | null => {
    if (value == null) return null;
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return null;
};

export type PlanTier = "free" | "pro";

export const PLAN_CONFIG = {
    defaultTier: parsePlanTier(process.env.SNIPFOCUS_DEFAULT_TIER) ?? "free" as PlanTier,
    devOverrideTier: parsePlanTier(process.env.SNIPFOCUS_DEV_TIER),
    freeRecordingSeconds: 180,
    storeProAddOnId: process.env.SNIPFOCUS_STORE_PRO_ADDON_ID || "pro_features_unlock",
    allowManualTierOverride: parseBooleanFlag(process.env.SNIPFOCUS_ALLOW_TIER_OVERRIDE)
        ?? (process.env.NODE_ENV === "development"),
} as const;
