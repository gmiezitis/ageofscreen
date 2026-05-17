export type ReleaseProfileName = "dev" | "direct-download" | "store";

export interface ReleaseProfile {
    name: ReleaseProfileName;
    label: string;
    storeSafe: boolean;
    packagedBuild: boolean;
    allowExternalExecutableInterop: boolean;
    allowBundledFfmpegOnly: boolean;
    allowAgentSurfaces: boolean;
    defaultFeatures: {
        teleprompter: boolean;
        drawing: boolean;
        focusWidget: boolean;
        focusTimerBuiltinSounds: boolean;
        smartTargetingOcr: boolean;
        liveMagnifier: boolean;
        autoZoomAdvanced: boolean;
        proFeatures: boolean;
        agentSurfaces: boolean;
    };
}

const normalizeReleaseProfileName = (value: string | undefined): ReleaseProfileName | null => {
    const normalized = value?.trim().toLowerCase();
    if (normalized === "dev") return "dev";
    if (normalized === "direct-download" || normalized === "direct") return "direct-download";
    if (normalized === "store" || normalized === "microsoft-store") return "store";
    return null;
};

export const inferReleaseProfileName = (): ReleaseProfileName => {
    const envProfile = normalizeReleaseProfileName(process.env?.AGEOFSCREEN_RELEASE_PROFILE);
    if (envProfile) return envProfile;

    const processWithStore = process as NodeJS.Process & { windowsStore?: boolean; defaultApp?: boolean };
    if (processWithStore.windowsStore === true) {
        return "store";
    }

    if (processWithStore.defaultApp === false && process.env.NODE_ENV !== "development") {
        return "direct-download";
    }

    return "dev";
};

export const buildReleaseProfile = (name: ReleaseProfileName): ReleaseProfile => {
    switch (name) {
        case "store":
            return {
                name,
                label: "Microsoft Store",
                storeSafe: true,
                packagedBuild: true,
                allowExternalExecutableInterop: false,
                allowBundledFfmpegOnly: true,
                allowAgentSurfaces: true,
                defaultFeatures: {
                    teleprompter: true,
                    drawing: true,
                    focusWidget: false,
                    focusTimerBuiltinSounds: false,
                    smartTargetingOcr: false,
                    liveMagnifier: false,
                    autoZoomAdvanced: false,
                    proFeatures: false,
                    agentSurfaces: true,
                },
            };
        case "direct-download":
            return {
                name,
                label: "Direct Download",
                storeSafe: false,
                packagedBuild: true,
                allowExternalExecutableInterop: true,
                allowBundledFfmpegOnly: true,
                allowAgentSurfaces: false,
                defaultFeatures: {
                    teleprompter: true,
                    drawing: true,
                    focusWidget: false,
                    focusTimerBuiltinSounds: false,
                    smartTargetingOcr: false,
                    liveMagnifier: false,
                    autoZoomAdvanced: false,
                    proFeatures: false,
                    agentSurfaces: true,
                },
            };
        case "dev":
        default:
            return {
                name: "dev",
                label: "Development",
                storeSafe: false,
                packagedBuild: false,
                allowExternalExecutableInterop: true,
                allowBundledFfmpegOnly: false,
                allowAgentSurfaces: true,
                defaultFeatures: {
                    teleprompter: true,
                    drawing: true,
                    focusWidget: true,
                    focusTimerBuiltinSounds: false,
                    smartTargetingOcr: false,
                    liveMagnifier: false,
                    autoZoomAdvanced: false,
                    proFeatures: false,
                    agentSurfaces: true,
                },
            };
    }
};

export const RELEASE_PROFILE = buildReleaseProfile(inferReleaseProfileName());
