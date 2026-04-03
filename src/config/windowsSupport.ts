import os from "os";

export const WINDOWS_MIN_OS_VERSION = "10.0.19041.0";
export const WINDOWS_MAX_TESTED_VERSION = "10.0.26100.0";
export const WINDOWS_STORE_IDENTITY_DEFAULT = "ageofscreen.Desktop";
export const WINDOWS_PUBLISHER_DEFAULT = "CN=ageofscreen Dev";
export const WINDOWS_PUBLISHER_DISPLAY_NAME = "ageofscreen";

export type WindowsDistributionChannel = "direct-download" | "microsoft-store";

export interface WindowsSupportEntry {
    platform: "win32";
    arch: "x64" | "arm64";
    minOsVersion: string;
    latestWindows11Supported: boolean;
    microsoftStoreChannel: "msix";
    directChannel: "squirrel+zip";
}

export const WINDOWS_SUPPORT_MATRIX: WindowsSupportEntry[] = [
    {
        platform: "win32",
        arch: "x64",
        minOsVersion: WINDOWS_MIN_OS_VERSION,
        latestWindows11Supported: true,
        microsoftStoreChannel: "msix",
        directChannel: "squirrel+zip",
    },
    {
        platform: "win32",
        arch: "arm64",
        minOsVersion: WINDOWS_MIN_OS_VERSION,
        latestWindows11Supported: true,
        microsoftStoreChannel: "msix",
        directChannel: "squirrel+zip",
    },
];

export const isWindowsStorePackage = (): boolean => {
    const processWithWindowsStore = process as NodeJS.Process & { windowsStore?: boolean };
    return process.platform === "win32" && processWithWindowsStore.windowsStore === true;
};

export const getWindowsDistributionChannel = (): WindowsDistributionChannel => {
    return isWindowsStorePackage() ? "microsoft-store" : "direct-download";
};

export const getWindowsRuntimeSupport = () => ({
    platform: process.platform,
    arch: process.arch,
    release: process.platform === "win32" ? os.release() : null,
    minOsVersion: WINDOWS_MIN_OS_VERSION,
    latestWindows11Supported: process.platform === "win32",
    distributionChannel: getWindowsDistributionChannel(),
    isWindowsStorePackage: isWindowsStorePackage(),
    isArm64: process.platform === "win32" && process.arch === "arm64",
});
