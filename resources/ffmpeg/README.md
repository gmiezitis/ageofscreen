Drop architecture-specific FFmpeg/FFprobe binaries here before packaging release builds.

Expected layout:

- `resources/ffmpeg/win32-x64/ffmpeg.exe`
- `resources/ffmpeg/win32-x64/ffprobe.exe`
- `resources/ffmpeg/win32-arm64/ffmpeg.exe`
- `resources/ffmpeg/win32-arm64/ffprobe.exe`

Packaged builds now prefer these app-owned binaries and no longer rely on PATH/WinGet fallbacks.
