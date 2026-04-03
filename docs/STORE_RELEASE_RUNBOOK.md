# ageofscreen Store Release Runbook

## Toolchain

- Node: `22.x`
- npm: `>=11`
- Electron Forge: `7.x`
- Windows SDK: required on release builders

## Required release inputs

- `WINDOWS_STORE_IDENTITY_NAME`
- `WINDOWS_PUBLISHER`
- `WINDOWS_CERT_FILE`
- `WINDOWS_CERT_PASSWORD`
- `WINDOWS_KIT_PATH` or `WINDOWS_KIT_VERSION` if the builder cannot auto-detect the Windows SDK bin folder
- `resources/ffmpeg/win32-x64/{ffmpeg.exe,ffprobe.exe}`
- `resources/ffmpeg/win32-arm64/{ffmpeg.exe,ffprobe.exe}`

If the certificate variables are omitted for a local private-flight dry run, `npm run make:store-win-x64` and `npm run make:store-win-arm64` now generate a temporary development `.pfx` automatically. Release-candidate artifacts should still use the Partner Center identity/publisher values and your real signing material.

## Default Store upload artifact

- This repo uses Electron Forge `MakerMSIX` as the Store packaging owner.
- The default upload candidates are:
  - `out/make/msix/x64/ageofscreen.msix`
  - `out/make/msix/arm64/ageofscreen.msix`
- Do not create a Visual Studio Publish project by default just because Partner Center shows generic app-package guidance.
- Only add a `.msixupload` or Visual Studio conversion path if Partner Center explicitly rejects the Forge-generated `MSIX`.

## Automated gate

```powershell
npm run lint
npm test
npx tsc --noEmit
npm run make:win-x64
npm run make:store-win-x64
npm run make:store-win-arm64
npm run audit:package-size
```

## Manual gate

1. Install the produced `MSIX` on a clean `x64` Windows 11 machine.
2. Install the produced `MSIX` on a physical Windows ARM64 device.
3. Validate `Record -> Trim -> Style -> Export`.
4. Export a support bundle from the launcher and attach it to the release candidate notes.
5. Run Windows App Certification Kit on both Store packages.
6. Submit to a private flight first.

## Hard blockers

- `npm run package` or `make` is not repeatable after a clean preflight
- packaged app cannot find bundled FFmpeg
- window-mode recording still depends on PowerShell
- WACK fails
- identity/publisher do not match Partner Center exactly
