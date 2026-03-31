import { app } from "electron";
import fs from "fs";
import path from "path";
import { FEATURES } from "../config/features";
import { RELEASE_PROFILE } from "../config/releaseProfile";
import { getWindowsRuntimeSupport } from "../config/windowsSupport";
import { getSnipFocusTempDir, getSupportBundleDir, listRecentTempLogs } from "./runtimePaths";

export interface SupportBundleInput {
    captureHealth: { droppedFrames: number; bufferErrors: number; effectiveFps: number | null; status: string } | null;
    sourceStatus: { screen: boolean; camera: boolean; mic: boolean } | null;
    ffmpegPath: string | null;
}

const readUtf8IfPresent = (filePath: string): string | null => {
    try {
        return fs.readFileSync(filePath, "utf8");
    } catch {
        return null;
    }
};

export const buildSupportBundlePayload = ({ captureHealth, sourceStatus, ffmpegPath }: SupportBundleInput) => {
    const recentLogs = listRecentTempLogs("snipfocus-ffmpeg-error-", 5)
        .map((entry) => ({
            name: entry.name,
            contents: readUtf8IfPresent(entry.path),
        }))
        .filter((entry) => typeof entry.contents === "string");

    return {
        exportedAt: new Date().toISOString(),
        app: {
            name: app.getName(),
            version: app.getVersion(),
        },
        releaseProfile: RELEASE_PROFILE,
        runtime: {
            ...getWindowsRuntimeSupport(),
            electron: process.versions.electron,
            chrome: process.versions.chrome,
            node: process.versions.node,
            v8: process.versions.v8,
            tempDir: getSnipFocusTempDir(),
            supportDir: getSupportBundleDir(),
        },
        features: FEATURES,
        captureHealth,
        sourceStatus,
        ffmpegPath,
        recentLogs,
    };
};

export const writeSupportBundle = async (targetPath: string, input: SupportBundleInput): Promise<string> => {
    const payload = buildSupportBundlePayload(input);
    const normalizedTargetPath = targetPath.endsWith(".json") ? targetPath : `${targetPath}.json`;
    await fs.promises.mkdir(path.dirname(normalizedTargetPath), { recursive: true });
    await fs.promises.writeFile(normalizedTargetPath, JSON.stringify(payload, null, 2), "utf8");
    return normalizedTargetPath;
};
