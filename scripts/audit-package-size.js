const fs = require("fs");
const path = require("path");
const asar = require("@electron/asar");

const bannedTopLevelNames = new Set([
    ".agent",
    ".analysis",
    ".cursor",
    ".github",
    "docs",
    "report",
    "scripts",
    "src",
]);

const bannedTopLevelPatterns = [
    /^AGENTS\.md$/i,
    /^\.gitignore$/i,
    /^build(?:[^/]+)?\.log$/i,
    /^build_.+\.log$/i,
    /^build_log\.txt$/i,
    /^cinematic-effects\.md$/i,
    /^FFMPEG_SETUP\.md$/i,
    /^forge(?:[^/]+)?\.log$/i,
    /^forge\.config\.ts$/i,
    /^out\.log$/i,
    /^package-lock\.json$/i,
    /^startup.+\.txt$/i,
    /^test-.+/i,
    /^tsc.+\.txt$/i,
    /^tsconfig\.json$/i,
    /^webpack\..+\.ts$/i,
];

const formatMb = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;

const getDirectorySize = (targetPath) => {
    let total = 0;

    const visit = (currentPath) => {
        const stats = fs.statSync(currentPath);
        if (stats.isFile()) {
            total += stats.size;
            return;
        }

        for (const entry of fs.readdirSync(currentPath)) {
            visit(path.join(currentPath, entry));
        }
    };

    visit(targetPath);
    return total;
};

const getAsarNodeSize = (node) => {
    if (!node || typeof node !== "object") return 0;
    if (typeof node.size === "number") return node.size;

    let total = 0;
    if (node.files && typeof node.files === "object") {
        for (const child of Object.values(node.files)) {
            total += getAsarNodeSize(child);
        }
    }
    return total;
};

const collectAsarFiles = (currentPath, node, rows) => {
    if (!node || typeof node !== "object") return;

    if (typeof node.size === "number") {
        rows.push({ path: currentPath, size: node.size });
        return;
    }

    if (!node.files || typeof node.files !== "object") return;

    for (const [childName, childNode] of Object.entries(node.files)) {
        const nextPath = currentPath ? `${currentPath}/${childName}` : childName;
        collectAsarFiles(nextPath, childNode, rows);
    }
};

const getTopLevelEntries = (appAsarPath) => {
    const packageEntries = asar
        .listPackage(appAsarPath)
        .map((entry) => entry.replace(/^\\/, "").replace(/\\/g, "/"));

    return [...new Set(packageEntries.map((entry) => entry.split("/")[0]).filter(Boolean))].sort();
};

const outDir = path.resolve(process.cwd(), "out");
if (!fs.existsSync(outDir)) {
    console.error("[audit:package-size] Missing out/ directory. Build a package first.");
    process.exit(1);
}

const appDirs = fs
    .readdirSync(outDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("ageofscreen-win32-"))
    .map((entry) => path.join(outDir, entry.name));

if (appDirs.length === 0) {
    console.error("[audit:package-size] No packaged app directories found in out/.");
    process.exit(1);
}

let hasBannedPaths = false;

for (const appDir of appDirs) {
    const appName = path.basename(appDir);
    const appAsarPath = path.join(appDir, "resources", "app.asar");

    if (!fs.existsSync(appAsarPath)) {
        console.warn(`[audit:package-size] Skipping ${appName}: missing resources/app.asar`);
        continue;
    }

    const appSize = getDirectorySize(appDir);
    const appAsarSize = fs.statSync(appAsarPath).size;
    const topLevelEntries = getTopLevelEntries(appAsarPath);

    const topLevelRows = topLevelEntries
        .map((entry) => {
            const node = asar.statFile(appAsarPath, entry, false);
            return { path: entry, size: getAsarNodeSize(node) };
        })
        .sort((a, b) => b.size - a.size);

    const fileRows = [];
    for (const entry of topLevelEntries) {
        const node = asar.statFile(appAsarPath, entry, false);
        collectAsarFiles(entry, node, fileRows);
    }
    fileRows.sort((a, b) => b.size - a.size);

    const bannedEntries = topLevelEntries.filter((entry) =>
        bannedTopLevelNames.has(entry) || bannedTopLevelPatterns.some((pattern) => pattern.test(entry))
    );

    if (bannedEntries.length > 0) {
        hasBannedPaths = true;
    }

    console.log(`\n[audit:package-size] ${appName}`);
    console.log(`  unpacked app folder: ${formatMb(appSize)}`);
    console.log(`  app.asar: ${formatMb(appAsarSize)}`);
    console.log("  top-level packaged paths:");
    for (const row of topLevelRows.slice(0, 12)) {
        console.log(`    - ${row.path}: ${formatMb(row.size)}`);
    }
    console.log("  largest packaged files:");
    for (const row of fileRows.slice(0, 12)) {
        console.log(`    - ${row.path}: ${formatMb(row.size)}`);
    }

    if (bannedEntries.length > 0) {
        console.error(`  banned packaged paths detected: ${bannedEntries.join(", ")}`);
    }
}

if (hasBannedPaths) {
    console.error("\n[audit:package-size] Failed: packaged app still contains banned repo-only paths.");
    process.exit(1);
}

console.log("\n[audit:package-size] Passed: no banned repo-only paths found in packaged apps.");
