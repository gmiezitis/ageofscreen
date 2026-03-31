# Windows ARM64 Validation Checklist

Run this checklist on a real Windows ARM64 device before release.

## Packaging

- Build direct installer: `npm run make:win-arm64`
- Build Store package: `npm run make:store-win-arm64`
- Confirm app installs without architecture mismatch warnings

## Runtime

- Launch the app from a clean install
- Start fullscreen recording
- Start window recording
- Verify cursor metadata is captured
- Verify webcam overlay works
- Open the editor and play back the recording
- Export a styled video successfully

## Native / Binary Checks

- Run `npm run build:native:win-arm64`
- Run `npm run rebuild:native:win-arm64`
- Confirm no native module rebuild prompt appears at runtime
- Confirm FFmpeg is detected on the device during export

## Store-Specific Checks

- Install the generated MSIX through App Installer
- Verify update/install identity is stable across rebuilds
- Confirm temp files, save dialogs, and export destinations work
- Run Windows App Certification Kit before Partner Center submission
