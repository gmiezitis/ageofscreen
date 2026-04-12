const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const FFMPEG_ROOT = path.join(REPO_ROOT, 'resources', 'ffmpeg');

const CONFIG = {
    x64: {
        url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
        zipName: 'ffmpeg-x64.zip'
    },
    arm64: {
        url: 'https://github.com/ShareX/FFmpeg/releases/download/v8.0/ffmpeg-8.0-win-arm64.zip',
        zipName: 'ffmpeg-arm64.zip'
    }
};

function downloadFile(url, dest) {
    console.log(`Downloading ${url} to ${dest}...`);
    try {
        execSync(`curl -L -f -o "${dest}" "${url}"`, { stdio: 'inherit' });
    } catch (err) {
        throw new Error(`Failed to download ${url}: ${err.message}`);
    }
}

function extractZip(zipPath, outDir) {
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    console.log(`Extracting ${zipPath} to ${outDir}...`);
    try {
        execSync(`powershell.exe -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force"`, {
            stdio: 'inherit',
            timeout: 120000,
        });
    } catch (err) {
        throw new Error(`Failed to extract ${zipPath}: ${err.message}`);
    }
}

/** Recursively list all files in a directory (for debug logging) */
function listAllFiles(dir, prefix = '') {
    const entries = [];
    try {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const relativePath = prefix ? `${prefix}/${item}` : item;
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                entries.push(`[DIR]  ${relativePath}`);
                entries.push(...listAllFiles(fullPath, relativePath));
            } else {
                entries.push(`[FILE] ${relativePath} (${stat.size} bytes)`);
            }
        }
    } catch (e) {
        entries.push(`[ERROR] Could not read ${dir}: ${e.message}`);
    }
    return entries;
}

function findFile(dir, fileName) {
    try {
        const files = fs.readdirSync(dir);
        for (const file of files) {
            const fullPath = path.join(dir, file);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
                const found = findFile(fullPath, fileName);
                if (found) return found;
            } else if (file.toLowerCase() === fileName.toLowerCase()) {
                return fullPath;
            }
        }
    } catch (e) {
        // Skip unreadable dirs
    }
    return null;
}

async function setup(arch) {
    if (!CONFIG[arch]) {
        throw new Error(`Unsupported architecture: ${arch}`);
    }

    const archDir = path.join(FFMPEG_ROOT, `win32-${arch}`);
    const ffmpegExe = path.join(archDir, 'ffmpeg.exe');
    const ffprobeExe = path.join(archDir, 'ffprobe.exe');

    if (fs.existsSync(ffmpegExe) && fs.existsSync(ffprobeExe)) {
        console.log(`FFmpeg/FFprobe already exist for win32-${arch}. Skipping.`);
        return;
    }

    const config = CONFIG[arch];
    const tempDir = path.join(REPO_ROOT, 'temp_ffmpeg');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const zipPath = path.join(tempDir, config.zipName);
    const extractPath = path.join(tempDir, `extracted-${arch}`);

    try {
        downloadFile(config.url, zipPath);

        // Verify the downloaded file exists and has size
        const zipStat = fs.statSync(zipPath);
        console.log(`Downloaded ZIP size: ${zipStat.size} bytes`);

        extractZip(zipPath, extractPath);

        // Debug: list everything that was extracted
        console.log(`\n--- Contents of ${extractPath} ---`);
        const allFiles = listAllFiles(extractPath);
        allFiles.forEach(f => console.log(`  ${f}`));
        console.log(`--- End of listing (${allFiles.length} entries) ---\n`);

        const foundFfmpeg = findFile(extractPath, 'ffmpeg.exe');
        const foundFfprobe = findFile(extractPath, 'ffprobe.exe');

        if (!foundFfmpeg) {
            console.error('ERROR: ffmpeg.exe not found anywhere in extracted directory.');
            // Fallback: if ffprobe is also missing, try to find ANY .exe
            const anyExe = findFile(extractPath, '*.exe');
            if (anyExe) console.log(`  (found some exe: ${anyExe})`);
        }
        if (!foundFfprobe) {
            console.error('ERROR: ffprobe.exe not found anywhere in extracted directory.');
        }

        if (!foundFfmpeg || !foundFfprobe) {
            throw new Error(`Could not find ffmpeg.exe or ffprobe.exe in ${extractPath}`);
        }

        if (!fs.existsSync(archDir)) fs.mkdirSync(archDir, { recursive: true });

        console.log(`Copying ffmpeg from ${foundFfmpeg} to ${ffmpegExe}`);
        fs.copyFileSync(foundFfmpeg, ffmpegExe);
        console.log(`Copying ffprobe from ${foundFfprobe} to ${ffprobeExe}`);
        fs.copyFileSync(foundFfprobe, ffprobeExe);

        console.log(`Successfully set up FFmpeg/FFprobe for win32-${arch}`);
    } catch (err) {
        console.error(`Error during FFmpeg setup for ${arch}:`, err.message);
        process.exit(1);
    } finally {
        if (fs.existsSync(tempDir)) {
            fs.rmSync(tempDir, { recursive: true, force: true });
        }
    }
}

const args = process.argv.slice(2);
const archArg = args.find(a => a.startsWith('--arch='))?.split('=')[1] || process.arch;

setup(archArg);
