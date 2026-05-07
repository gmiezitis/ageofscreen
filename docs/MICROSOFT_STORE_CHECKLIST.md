# Microsoft Store Submission Checklist

Use this with `docs/MICROSOFT_STORE_DEPLOYMENT_PLAN.md` for sequencing and go/no-go criteria.

## Package Setup

- Set `WINDOWS_STORE_IDENTITY_NAME`
- Set `WINDOWS_STORE_RESERVED_NAME` to the exact reserved Partner Center app name
- Set `WINDOWS_PUBLISHER`
- Set signing secrets: `WINDOWS_CERT_FILE` and `WINDOWS_CERT_PASSWORD`
- Build `MSIX` for `x64` and `arm64`
- Upload the Forge-generated Store packages:
  - `out/make/msix/x64/AgeofScreen.msix`
  - `out/make/msix/arm64/AgeofScreen.msix`
- Do not switch to a Visual Studio Publish workflow unless Partner Center rejects the Forge-generated `MSIX`
- In Partner Center device-family availability, keep only `Windows.Desktop` checked unless you also ship packages for the other selected families
- Do not check `Xbox` unless you are intentionally targeting it and have a compatible neutral or `x64` package

## Local Validation

- Install the MSIX locally through App Installer
- Verify launch, record, edit, export, and save flows
- Confirm the app no longer depends on Squirrel startup behavior in Store mode
- Confirm the package writes only to allowed temp/user-selected locations

## Certification Readiness

- Run Windows App Certification Kit
- Validate package identity and publisher match Partner Center
- Confirm architecture-specific packages are labeled correctly
- Confirm screenshots, descriptions, and privacy statements are ready for submission
- Confirm Website URL is the public repository page `https://github.com/gmiezitis/ageofscreen`, not the `.git` clone URL
- Confirm Support URL and Privacy Policy URL resolve in a browser without requiring repository access

## Release Notes

- Direct-download Windows builds remain `Squirrel + ZIP`
- Microsoft Store builds are `MSIX`
- ARM64 is treated as a native release target and must be validated on physical hardware
