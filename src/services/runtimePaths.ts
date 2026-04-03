import { app } from "electron";
import fs from "fs";
import path from "path";

const TEMP_FILE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const ensureDirectory = (targetPath: string): string => {
    fs.mkdirSync(targetPath, { recursive: true });
    return targetPath;
};

const pruneOldTempArtifacts = (targetPath: string) => {
    try {
        const cutoff = Date.now() - TEMP_FILE_MAX_AGE_MS;
        for (const entry of fs.readdirSync(targetPath, { withFileTypes: true })) {
            if (!entry.isFile()) continue;
            const entryPath = path.join(targetPath, entry.name);
            const stats = fs.statSync(entryPath);
            if (stats.mtimeMs < cutoff) {
                fs.unlinkSync(entryPath);
            }
        }
    } catch {
        // Temp cleanup should never block app startup or exports.
    }
};

export const getageofscreenTempDir = (): string => {
    const tempDir = ensureDirectory(path.join(app.getPath("temp"), "ageofscreen"));
    pruneOldTempArtifacts(tempDir);
    return tempDir;
};

export const getSupportBundleDir = (): string => ensureDirectory(path.join(app.getPath("userData"), "support"));

export const listRecentTempLogs = (prefix: string, limit = 5): Array<{ name: string; path: string }> => {
    const tempDir = getageofscreenTempDir();
    const entries = fs.readdirSync(tempDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.startsWith(prefix))
        .map((entry) => ({
            name: entry.name,
            path: path.join(tempDir, entry.name),
            mtimeMs: fs.statSync(path.join(tempDir, entry.name)).mtimeMs,
        }))
        .sort((a, b) => b.mtimeMs - a.mtimeMs)
        .slice(0, limit);

    return entries.map(({ name, path: entryPath }) => ({ name, path: entryPath }));
};
