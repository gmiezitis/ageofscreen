const crypto = require("crypto");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const cleanScript = path.join(repoRoot, "scripts", "clean-generated.js");
const ensureMsixDevCertScript = path.join(repoRoot, "scripts", "ensure-msix-dev-cert.ps1");
const windowsKitRoot = process.env.WINDOWS_KIT_ROOT || "C:\\Program Files (x86)\\Windows Kits\\10\\bin";
const requiredWindowsKitExecutables = ["makeappx.exe", "makepri.exe", "signtool.exe", "makecert.exe"];
const storePackageName = "ageofscreen.msix";
const ffmpegResourceRoot = path.join(repoRoot, "resources", "ffmpeg");
const nativeCaptureAddonPath = path.join(repoRoot, "src", "native", "capture_engine", "build", "Release", "capture_engine.node");
const outDir = path.join(repoRoot, "out");
const npmBin = process.platform === "win32" ? "npm.cmd" : "npm";
const electronForgeBin = path.join(
    repoRoot,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "electron-forge.cmd" : "electron-forge"
);

function parseArgs(argv) {
    const [command, ...rest] = argv;
    if (!command) {
        throw new Error("Usage: node scripts/run-forge.js <package|make> [--profile=<name>] [...forge args]");
    }

    let releaseProfile = "direct-download";
    const forgeArgs = [];

    for (const arg of rest) {
        if (arg.startsWith("--profile=")) {
            releaseProfile = arg.slice("--profile=".length);
            continue;
        }

        forgeArgs.push(arg);
    }

    return { command, releaseProfile, forgeArgs };
}

function hasWindowsKitExecutables(candidatePath) {
    return Boolean(candidatePath)
        && requiredWindowsKitExecutables.every((fileName) => {
            return fs.existsSync(path.join(candidatePath, fileName));
        });
}

function readForgeArgValue(args, name) {
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === `--${name}`) {
            return args[index + 1];
        }

        if (arg.startsWith(`--${name}=`)) {
            return arg.slice(name.length + 3);
        }
    }

    return undefined;
}

function normalizeTargetArch(value) {
    if (value === "x64" || value === "arm64") {
        return value;
    }

    return null;
}

function resolveStoreTargetArch(forgeArgs) {
    const explicitArch = normalizeTargetArch(readForgeArgValue(forgeArgs, "arch"));
    if (explicitArch) {
        return explicitArch;
    }

    return normalizeTargetArch(process.arch) || "x64";
}

function getExpectedBundledFfmpegPaths(targetArch) {
    const archDir = path.join(ffmpegResourceRoot, `win32-${targetArch}`);
    return [
        path.join(archDir, "ffmpeg.exe"),
        path.join(archDir, "ffprobe.exe"),
    ];
}

function ensureFilesExist(paths, label) {
    const missing = paths.filter((candidatePath) => !fs.existsSync(candidatePath));
    if (missing.length === 0) {
        return;
    }

    throw new Error([
        `[store-preflight] Missing ${label}.`,
        ...missing.map((candidatePath) => `  - ${candidatePath}`),
    ].join("\n"));
}

function getNativeAddonScripts(targetArch) {
    if (targetArch === "arm64") {
        return ["build:native:win-arm64", "rebuild:native:win-arm64"];
    }

    return ["build:native", "rebuild:native"];
}

function collectFilesRecursively(rootPath) {
    if (!fs.existsSync(rootPath)) {
        return [];
    }

    const results = [];
    const visit = (currentPath) => {
        const stats = fs.statSync(currentPath);
        if (stats.isFile()) {
            results.push(currentPath);
            return;
        }

        for (const entry of fs.readdirSync(currentPath)) {
            visit(path.join(currentPath, entry));
        }
    };

    visit(rootPath);
    return results;
}

function preserveExistingStoreArtifacts() {
    const storeMsixRoot = path.join(outDir, "make", "msix");
    const files = collectFilesRecursively(storeMsixRoot);
    if (files.length === 0) {
        return null;
    }

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ageofscreen-store-msix-"));
    const entries = [];

    for (const filePath of files) {
        const relativePath = path.relative(outDir, filePath);
        const snapshotPath = path.join(tempDir, relativePath);
        fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
        fs.copyFileSync(filePath, snapshotPath);
        entries.push(relativePath);
    }

    return { tempDir, entries };
}

function restorePreservedStoreArtifacts(snapshot) {
    if (!snapshot) {
        return;
    }

    try {
        for (const relativePath of snapshot.entries) {
            const sourcePath = path.join(snapshot.tempDir, relativePath);
            const destinationPath = path.join(outDir, relativePath);
            if (fs.existsSync(destinationPath) || !fs.existsSync(sourcePath)) {
                continue;
            }

            fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
            fs.copyFileSync(sourcePath, destinationPath);
        }
    } finally {
        fs.rmSync(snapshot.tempDir, { recursive: true, force: true });
    }
}

function compareWindowsKitVersions(left, right) {
    const leftParts = left.split(".").map(Number);
    const rightParts = right.split(".").map(Number);
    const maxParts = Math.max(leftParts.length, rightParts.length);

    for (let index = 0; index < maxParts; index += 1) {
        const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
        if (diff !== 0) {
            return diff;
        }
    }

    return 0;
}

function resolveWindowsKitPath(env) {
    if (env.WINDOWS_KIT_PATH && hasWindowsKitExecutables(env.WINDOWS_KIT_PATH)) {
        return env.WINDOWS_KIT_PATH;
    }

    if (!fs.existsSync(windowsKitRoot)) {
        return undefined;
    }

    const resolveVersionPath = (version) => {
        const versionedCandidates = [
            path.join(windowsKitRoot, version, "x64"),
            path.join(windowsKitRoot, version, "arm64"),
        ];

        return versionedCandidates.find(hasWindowsKitExecutables);
    };

    if (env.WINDOWS_KIT_VERSION) {
        return resolveVersionPath(env.WINDOWS_KIT_VERSION);
    }

    const installedVersions = fs.readdirSync(windowsKitRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^10\.0\.\d+\.\d+$/.test(entry.name))
        .map((entry) => entry.name)
        .sort((left, right) => compareWindowsKitVersions(right, left));

    for (const version of installedVersions) {
        const resolved = resolveVersionPath(version);
        if (resolved) {
            return resolved;
        }
    }

    return [
        path.join(windowsKitRoot, "x64"),
        path.join(windowsKitRoot, "arm64"),
    ].find(hasWindowsKitExecutables);
}

function resolveWindowsSignToolPath(env) {
    if (env.WINDOWS_SIGNTOOL_PATH && fs.existsSync(env.WINDOWS_SIGNTOOL_PATH)) {
        return env.WINDOWS_SIGNTOOL_PATH;
    }

    if (!fs.existsSync(windowsKitRoot)) {
        return undefined;
    }

    const signToolRelativePath = path.join("signtool.exe");
    const preferredArchitectures = ["x64", "arm64"];
    const versionedCandidates = [];

    if (env.WINDOWS_KIT_VERSION) {
        for (const architecture of preferredArchitectures) {
            versionedCandidates.push(path.join(windowsKitRoot, env.WINDOWS_KIT_VERSION, architecture, signToolRelativePath));
        }
    } else {
        const installedVersions = fs.readdirSync(windowsKitRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && /^10\.0\.\d+\.\d+$/.test(entry.name))
            .map((entry) => entry.name)
            .sort((left, right) => compareWindowsKitVersions(right, left));

        for (const version of installedVersions) {
            for (const architecture of preferredArchitectures) {
                versionedCandidates.push(path.join(windowsKitRoot, version, architecture, signToolRelativePath));
            }
        }
    }

    const fallbackCandidates = preferredArchitectures.map((architecture) => {
        return path.join(windowsKitRoot, architecture, signToolRelativePath);
    });

    return [...versionedCandidates, ...fallbackCandidates].find((candidatePath) => fs.existsSync(candidatePath));
}

function runProcess(command, args, env) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: repoRoot,
            env,
            shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
            stdio: "inherit",
        });

        child.on("error", reject);
        child.on("exit", (code, signal) => {
            if (signal) {
                reject(new Error(`${command} exited with signal ${signal}`));
                return;
            }

            resolve(code ?? 0);
        });
    });
}

async function cleanGenerated(env) {
    const exitCode = await runProcess(process.execPath, [cleanScript], env);
    if (exitCode !== 0) {
        throw new Error(`clean-generated failed with exit code ${exitCode}`);
    }
}

async function runNpmScript(scriptName, env) {
    console.log(`[store-preflight] Running npm script: ${scriptName}`);
    const exitCode = await runProcess(npmBin, ["run", scriptName], env);
    if (exitCode !== 0) {
        throw new Error(`[store-preflight] npm run ${scriptName} failed with exit code ${exitCode}`);
    }
}

async function ensureStoreSigningEnv(baseEnv) {
    if (baseEnv.WINDOWS_CERT_FILE && baseEnv.WINDOWS_CERT_PASSWORD) {
        return baseEnv;
    }

    if (process.platform !== "win32") {
        throw new Error("Store builds currently require Windows to generate or use an MSIX signing certificate.");
    }

    const certDirectory = path.join(os.tmpdir(), "ageofscreen-msix-signing");
    const certFile = path.join(certDirectory, "ageofscreen-Development.pfx");
    const cerFile = path.join(certDirectory, "ageofscreen-Development.cer");
    const certPassword = crypto.randomBytes(24).toString("base64url");
    const publisherName = (baseEnv.WINDOWS_PUBLISHER || "CN=ageofscreen Dev").replace(/^CN=/i, "");
    const args = [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        ensureMsixDevCertScript,
        "-CertFile",
        certFile,
        "-CertPassword",
        certPassword,
        "-PublisherName",
        publisherName,
        "-CerFile",
        cerFile,
    ];

    const exitCode = await runProcess("powershell.exe", args, baseEnv);
    if (exitCode !== 0) {
        throw new Error(`MSIX dev certificate generation failed with exit code ${exitCode}`);
    }

    return {
        ...baseEnv,
        WINDOWS_CERT_FILE: certFile,
        WINDOWS_CERT_PASSWORD: certPassword,
        WINDOWS_CERTIFICATE_FILE: certFile,
        WINDOWS_CERTIFICATE_PASSWORD: certPassword,
    };
}

async function ensureStoreBuildEnv(baseEnv) {
    const signingEnv = await ensureStoreSigningEnv(baseEnv);
    const windowsKitPath = signingEnv.WINDOWS_KIT_PATH || resolveWindowsKitPath(signingEnv);
    const signToolPath = resolveWindowsSignToolPath({
        ...signingEnv,
        ...(windowsKitPath ? { WINDOWS_KIT_PATH: windowsKitPath } : {}),
    });

    return {
        ...signingEnv,
        ...(windowsKitPath ? { WINDOWS_KIT_PATH: windowsKitPath } : {}),
        ...(signToolPath ? { WINDOWS_SIGNTOOL_PATH: signToolPath } : {}),
    };
}

async function enforceStorePackagingPreflight(env, forgeArgs) {
    if (process.platform !== "win32") {
        throw new Error("[store-preflight] Microsoft Store packaging is only supported on Windows builders.");
    }

    const targetArch = resolveStoreTargetArch(forgeArgs);
    ensureFilesExist(
        getExpectedBundledFfmpegPaths(targetArch),
        `bundled FFmpeg resources for win32-${targetArch}`,
    );

    for (const scriptName of getNativeAddonScripts(targetArch)) {
        await runNpmScript(scriptName, env);
    }

    ensureFilesExist(
        [nativeCaptureAddonPath],
        `native capture addon output for ${targetArch}`,
    );

    return { targetArch };
}

function verifyStoreMsixOutput(targetArch) {
    const outputPath = path.join(outDir, "make", "msix", targetArch, storePackageName);
    ensureFilesExist(
        [outputPath],
        `Store package output for ${targetArch}`,
    );
    return outputPath;
}

async function main() {
    const { command, releaseProfile, forgeArgs } = parseArgs(process.argv.slice(2));
    const baseEnv = {
        ...process.env,
        AGEOFSCREEN_RELEASE_PROFILE: releaseProfile,
    };

    const preserveStoreArtifacts = releaseProfile === "store" && command === "make";
    const preservedStoreArtifacts = preserveStoreArtifacts ? preserveExistingStoreArtifacts() : null;

    let exitCode = 1;
    let storeArtifactPath = null;

    try {
        await cleanGenerated(baseEnv);

        const env = releaseProfile === "store"
            ? await ensureStoreBuildEnv(baseEnv)
            : baseEnv;

        const storeBuild = releaseProfile === "store"
            ? await enforceStorePackagingPreflight(env, forgeArgs)
            : null;

        exitCode = await runProcess(electronForgeBin, [command, ...forgeArgs], env);

        if (exitCode === 0 && releaseProfile === "store" && command === "make") {
            storeArtifactPath = verifyStoreMsixOutput(storeBuild.targetArch);
        }
    } finally {
        restorePreservedStoreArtifacts(preservedStoreArtifacts);
    }

    if (storeArtifactPath) {
        console.log(`[store-preflight] Store upload candidate: ${storeArtifactPath}`);
    }

    process.exit(exitCode);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
});
