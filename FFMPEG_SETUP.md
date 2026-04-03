# FFmpeg Setup for ageofscreen

## For Windows ARM64 Users

Since you're on Windows ARM64, you need to manually download FFmpeg:

### Quick Setup:

1. **Download FFmpeg ARM64** from: https://github.com/tordona/ffmpeg-win-arm64/releases
   - Download the latest `ffmpeg-*-essentials_build.zip`

2. **Extract and place** the `ffmpeg.exe` file in one of these locations:
   - `C:\ffmpeg\bin\ffmpeg.exe` (recommended)
   - Or add the folder containing `ffmpeg.exe` to your system PATH

3. **Restart ageofscreen** - it will automatically detect FFmpeg

### Verification

After installing FFmpeg, you should see this message in the console when starting ageofscreen:
```
[VideoRenderer] FFmpeg available at: C:\ffmpeg\bin\ffmpeg.exe
```

### Alternative: Install via Scoop or Chocolatey

```powershell
# Using Scoop (if you have ARM64 version)
scoop install ffmpeg

# Or download directly and add to PATH
```

## What FFmpeg enables:

- ✅ Video cropping export
- ✅ Video trimming/cutting
- ✅ Multi-segment concatenation
- ✅ Format conversion (WebM to MP4)

Without FFmpeg, videos will be exported in their original format without crop/trim applied.
