# Windows Support Matrix

ageofscreen supports modern Windows desktop releases through two distribution channels:

| Architecture | Minimum OS | Latest Windows 11 | Direct Download | Microsoft Store |
| --- | --- | --- | --- | --- |
| `x64` | Windows 10 (`10.0.19041.0`) | Yes | `Squirrel + ZIP` | `MSIX` |
| `arm64` | Windows 10 (`10.0.19041.0`) | Yes | `Squirrel + ZIP` | `MSIX` |

## Build Commands

- Direct download x64: `npm run make:win-x64`
- Direct download ARM64: `npm run make:win-arm64`
- Store MSIX x64: `npm run make:store-win-x64`
- Store MSIX ARM64: `npm run make:store-win-arm64`
- Store MSIX both arches: `npm run make:store-win-all`

## Environment Variables

These values are read by Forge for Microsoft Store packaging and signing:

- `WINDOWS_CERT_FILE`: path to the `.pfx` signing certificate
- `WINDOWS_CERT_PASSWORD`: password for the signing certificate
- `WINDOWS_PUBLISHER`: package publisher, for example `CN=ageofscreen LLC`
- `WINDOWS_STORE_IDENTITY_NAME`: Store package identity, for example `ageofscreen.Desktop`
- `WINDOWS_STORE_RESERVED_NAME`: exact reserved Store name to write into the MSIX manifest, for example `Age of Screen`
- `WINDOWS_KIT_PATH`: optional full path to the Windows SDK bin folder, for example `C:\Program Files (x86)\Windows Kits\10\bin\10.0.19041.0\x64`
- `WINDOWS_KIT_VERSION`: optional SDK version if you want Forge to resolve the bin folder by version instead of path

If `WINDOWS_CERT_FILE` and `WINDOWS_CERT_PASSWORD` are not set, the Store build scripts generate a temporary development certificate with `powershell.exe` so local MSIX validation does not depend on `pwsh.exe`.

Defaults are development-safe:

- `WINDOWS_PUBLISHER`: `CN=ageofscreen Dev`
- `WINDOWS_STORE_IDENTITY_NAME`: `ageofscreen.Desktop`
- `WINDOWS_STORE_RESERVED_NAME`: `Age of Screen`

## Notes

- Store packages use `MSIX`; direct downloads keep the existing Windows installer flow.
- Store builds must not rely on Squirrel startup behavior. The main process now skips Squirrel install handling when running inside a Windows Store package.
- `@ffmpeg-installer/ffmpeg` does not currently publish a native `win32-arm64` bundle, so Windows ARM64 export validation must confirm either a packaged custom FFmpeg binary or a system-installed FFmpeg is available.
