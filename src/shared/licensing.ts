import type { PlanTier } from "../config/plan";

export type CaptureShortcutPreference = "trigger_line" | "print_screen";

export interface EntitlementState {
    tier: PlanTier;
    maxRecordingSeconds: number | null;
    watermarkEnabled: boolean;
    canUseAutoPolish: boolean;
    canUseStudioVoice: boolean;
    purchaseAvailable: boolean;
    provider: "manual" | "dev_override" | "store_stub" | "store_native";
    lastSyncAt: string | null;
}

export type UpgradeSource =
    | "generic"
    | "recording_limit"
    | "auto_polish"
    | "studio_voice"
    | "export_watermark";

export interface PurchaseProResult {
    success: boolean;
    state: EntitlementState;
    message: string;
    source: UpgradeSource;
}

export interface EntitlementProvider {
    initialize(): Promise<EntitlementState>;
    getState(): Promise<EntitlementState>;
    refresh(): Promise<EntitlementState>;
    purchasePro(source?: UpgradeSource): Promise<PurchaseProResult>;
    restoreIfNeeded(): Promise<EntitlementState>;
}

export interface OnboardingState {
    hasCompletedOnboarding: boolean;
    preferredCaptureShortcut: CaptureShortcutPreference;
}

