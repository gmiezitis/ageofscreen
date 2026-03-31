import { app } from "electron";
import fs from "fs";
import path from "path";

const ensureDirectory = (targetPath: string): string => {
    fs.mkdirSync(targetPath, { recursive: true });
    return targetPath;
};

export const getSnipFocusTempDir = (): string => ensureDirectory(path.join(app.getPath("temp"), "snipfocus"));

export const getSupportBundleDir = (): string => ensureDirectory(path.join(app.getPath("userData"), "support"));

export const listRecentTempLogs = (prefix: string, limit = 5): Array<{ name: string; path: string }> => {
    const tempDir = getSnipFocusTempDir();
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
