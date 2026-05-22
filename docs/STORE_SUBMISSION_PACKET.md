# Microsoft Store Submission Packet

Use this as the single working packet for a Partner Center submission.
It pulls together the package inputs, listing assets, compliance notes, and evidence we still need before upload.

## Submission Snapshot
- Product: `AgeofScreen`
- Version: `1.0.0`
- Target channel: `Microsoft Store`
- Initial rollout: `private flight recommended`
- Architectures: `x64` and `arm64`
- Package format: `MSIX`
- Baseline updated: `2026-04-26`

## Package Inputs
- Identity name: from Partner Center `WINDOWS_STORE_IDENTITY_NAME`
- Reserved name: from Partner Center `WINDOWS_STORE_RESERVED_NAME`
- Publisher: from Partner Center `WINDOWS_PUBLISHER`
- Signing cert: `WINDOWS_CERT_FILE`
- Signing password: `WINDOWS_CERT_PASSWORD`
- Build commands:
  - `npm run make:store-win-x64`
  - `npm run make:store-win-arm64`
- Expected artifacts:
  - `out/make/msix/x64/ageofscreen.msix`
  - `out/make/msix/arm64/ageofscreen.msix`

## Automated Evidence
- [x] `npm test`
- [x] `npm run release:gate`
- [x] `npm run test:smoke`
- [x] `npm run test:smoke:packaged`
- [x] Windows packaging workflow builds Store packages for `x64` and `arm64`
- [ ] Fresh candidate CI run archived for the submission build

## Manual Evidence Still Required
- [ ] Real-hardware fullscreen recording validation
- [ ] Real-hardware window recording validation
- [ ] Real-hardware webcam-enabled recording validation
- [ ] ARM64 physical-device validation for Store-installed build
- [ ] WACK results for final `x64` package
- [ ] WACK results for final `arm64` package
- [ ] Private-flight or bug-bash evidence attached

## Partner Center Content Sources
- Store metadata fill-in: `docs/STORE_METADATA_FILLIN.md`
- Store listing draft: `docs/store/STORE_LISTING.md`
- Certification notes: `docs/store/CERTIFICATION_NOTES.md`
- Age rating answers: `docs/store/AGE_RATING_ANSWERS.md`
- Privacy policy source: `docs/store/PRIVACY_POLICY_SOURCE.md`
- Store checklist: `docs/MICROSOFT_STORE_CHECKLIST.md`
- Store deployment plan: `docs/MICROSOFT_STORE_DEPLOYMENT_PLAN.md`

## Submission Metadata Checklist
- [ ] App name matches reserved Partner Center name
- [ ] Short description finalized
- [ ] Full description finalized
- [ ] Screenshots captured and reviewed
- [ ] Privacy policy URL replaced with production URL
- [ ] Support URL replaced with production URL
- [ ] Certification notes updated with final package evidence
- [ ] Age rating questionnaire reviewed against current product scope
- Use `docs/STORE_METADATA_FILLIN.md` as the working owner/value sheet for these items
- Use `npm run store:metadata:check` to catch unresolved placeholders before submission

## Packaging And Install Checklist
- [ ] Store package installs cleanly with App Installer on `x64`
- [ ] Store package installs cleanly with App Installer on physical `arm64`
- [ ] Store-installed app launches without Squirrel assumptions
- [ ] Store-installed app records, edits, and exports successfully
- [ ] Store-installed app writes only to allowed locations
- [ ] Bundled FFmpeg is available in Store-installed builds

## Submission Notes
- Prefer a private flight for the first submission.
- Keep only `Windows.Desktop` selected unless additional device families are intentionally supported.
- Keep the direct-download channel available while Store rollout risk is still unknown.

## Final Go/No-Go
- Submission owner:
- Candidate build SHA:
- Candidate CI run:
- Decision:
- Notes:
