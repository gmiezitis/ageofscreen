const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const FFMPEG_ROOT = path.join(REPO_ROOT, 'resources', 'ffmpeg');

const CONFIG = {
    x64: {
        // Gyan.dev stable release
        url: 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip',
        zipName: 'ffmpeg-x64.zip'
    },
    arm64: {
        // ShareX provides high-quality, stable ARM64 binaries
        url: 'https://github.com/ShareX/FFmpeg/releases/download/v8.0/ffmpeg-8.0-win-arm64.zip',
        zipName: 'ffmpeg-arm64.zip'
    }
};

async function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        };
        https.get(url, options, (response) => {
            if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
                console.log(`Redirecting to ${response.headers.location}...`);
                downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                return;
            }
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download: ${response.statusCode} from ${url}`));
                return;
            }

            const file = fs.createWriteStream(dest);
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
            file.on('error', (err) => {
                fs.unlink(dest, () => {});
                reject(err);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => {});
            reject(err);
        });
    });
}

function extractZip(zipPath, outDir) {
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }
    console.log(`Extracting ${zipPath} to ${outDir}...`);
    execSync(`powershell.exe -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${outDir}' -Force"`);
}

/**
 * Recursively find a file by name in a directory
 */
function findFile(dir, fileName) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            const found = findFile(fullPath, fileName);
            if (found) return found;
        } else if (file.toLowerCase() === fileName.toLowerCase()) {
            return fullPath;
        }
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
        console.log(`Downloading FFmpeg for win32-${arch} from ${config.url}`);
        await downloadFile(config.url, zipPath);
        
        extractZip(zipPath, extractPath);

        const foundFfmpeg = findFile(extractPath, 'ffmpeg.exe');
        const foundFfprobe = findFile(extractPath, 'ffprobe.exe');
        
        if (!foundFfmpeg || !foundFfprobe) {
            throw new Error(`Could not find ffmpeg.exe or ffprobe.exe inside the downloaded archive for ${arch}`);
        }

        if (!fs.existsSync(archDir)) fs.mkdirSync(archDir, { recursive: true });

        console.log(`Copying binaries to ${archDir}...`);
        fs.copyFileSync(foundFfmpeg, ffmpegExe);
        fs.copyFileSync(foundFfprobe, ffprobeExe);

        console.log(`Successfully set up FFmpeg/FFprobe for win32-${arch}`);
    } catch (err) {
        console.error(`Error setting up FFmpeg for ${arch}:`, err);
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
