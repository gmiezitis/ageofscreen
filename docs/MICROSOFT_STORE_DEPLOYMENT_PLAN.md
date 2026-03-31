# Microsoft Store Deployment Plan

This plan turns SnipFocus into a Microsoft Store-ready release with the smoothest possible first submission and update path.

It follows the current product priority order:
1. Recording reliability and smooth playback
2. Clear, simple core UX
3. Fast, correct export
4. Pro-tier features

## Goal

Ship a Store-safe Windows release of SnipFocus that:
- installs cleanly through `MSIX`
- passes Windows App Certification Kit
- preserves the core `Record -> Trim -> Style -> Export` flow
- avoids Store-only regressions around file access, native modules, FFmpeg, and updates

## Current Baseline

Already in place:
- MSIX maker is configured in `forge.config.ts`
- x64 and arm64 Store build scripts exist in `package.json`
- Store runtime skips Squirrel startup handling in `src/index.ts`
- Windows support and ARM64 validation docs already exist

Current risks to resolve before submission:
- real-device validation for capture and export on Store-installed builds
- FFmpeg availability, especially on Windows ARM64
- native module rebuild and packaging stability
- file-system behavior under packaged app constraints
- Store listing assets, privacy policy, and Partner Center metadata
- repeatable signing/release pipeline

## Release Strategy

Use two Windows channels in parallel:
- Direct download: `Squirrel + ZIP`
- Microsoft Store: `MSIX`

Do not make Store packaging the first release gate. First make the app reliable in packaged Windows builds, then certify, then submit.

## Phase 1: Product Readiness Gate

Objective: do not take an unstable recorder into Store certification.

Tasks:
- Verify the main user flow works reliably in packaged Windows builds:
  - Record
  - Trim
  - Style
  - Export
- Run the playbook test checklist on packaged x64 builds, not only dev mode
- Fix any issues where packaged runtime behaves differently from `electron-forge start`
- Confirm the free plan watermark works only at export stage and does not affect editing or preview
- Keep hidden legacy features behind flags and out of the main Store-facing UX

Exit criteria:
- 3-minute fullscreen recording plays back smoothly
- 3-minute window recording plays back smoothly
- webcam overlay behaves predictably
- export succeeds for at least one free-plan and one pro-plan configuration
- no critical crash in the core flow on packaged x64

## Phase 2: Store Compatibility Hardening

Objective: remove the main reasons Store apps fail certification or behave differently after installation.

Tasks:
- Audit all write locations used by the app:
  - temp files
  - cursor sidecars
  - export outputs
  - logs
  - app settings
- Ensure the app writes only to:
  - `app.getPath('temp')`
  - `app.getPath('userData')`
  - user-selected save locations via dialogs
- Review packaged behavior for:
  - `electron-store`
  - FFmpeg temp/filter files
  - annotation temp assets
  - imported media paths
- Confirm no install/update logic depends on Squirrel in Store mode
- Verify any protocol/file access used by the editor works inside MSIX
- Review permissions and privacy-sensitive behavior:
  - screen capture
  - microphone/audio capture
  - webcam usage

Exit criteria:
- no writes to protected install directories
- no startup/install dependence on Squirrel in Store mode
- packaged editor can open local recordings and exports correctly
- file dialogs and export destinations work cleanly in MSIX install

## Phase 3: Native Binary and Export Pipeline Validation

Objective: make export and recording dependable in the exact binaries submitted to the Store.

Tasks:
- Validate native capture module packaging on x64 and arm64
- Confirm `npm run build:native:*` and `npm run rebuild:native:*` are enough for clean release builds
- Decide the FFmpeg strategy for Store builds:
  - packaged custom binary
  - architecture-specific bundled binary
  - documented fallback to system FFmpeg only if truly unavoidable
- Prefer bundled FFmpeg for Store submission to avoid user setup friction
- Test export with:
  - watermark enabled
  - watermark disabled
  - trimmed segments
  - styled output
  - fallback export path when smart effects fail
- Validate real ARM64 behavior on physical hardware before submission

Exit criteria:
- x64 MSIX records and exports successfully
- arm64 MSIX records and exports successfully on physical hardware
- no runtime native rebuild prompt appears
- FFmpeg is consistently found in Store-installed builds

## Phase 4: Submission Pipeline and Signing

Objective: make release creation boring and repeatable.

Tasks:
- Lock final Partner Center app identity
- Set production values for:
  - `WINDOWS_STORE_IDENTITY_NAME`
  - `WINDOWS_PUBLISHER`
  - `WINDOWS_CERT_FILE`
  - `WINDOWS_CERT_PASSWORD`
- Create a release checklist for:
  - version bump
  - clean dependency install
  - native rebuild
  - x64 Store package build
  - arm64 Store package build
  - local install smoke test
  - certification run
- Automate MSIX build commands in CI where possible
- Archive produced artifacts and certification logs per release candidate

Exit criteria:
- release candidate packages can be generated repeatably
- identity and publisher exactly match Partner Center values
- signing works without manual patching of manifests

## Phase 5: Certification and Store Listing

Objective: remove submission friction before the first upload.

Tasks:
- Run Windows App Certification Kit on final x64 and arm64 packages
- Fix all blocking certification issues before submission
- Prepare Store listing assets:
  - app description aligned to local-first AI demo video maker positioning
  - screenshots showing the 4-step flow
  - privacy policy URL
  - support/contact URL
  - feature bullets for free vs pro
- Keep screenshots focused on:
  - recording setup
  - editor trim/style
  - export presets
  - local/offline workflow
- Decide launch scope:
  - private test audience first
  - or public release

Exit criteria:
- certification passes
- all listing assets are approved internally
- submission metadata matches actual app behavior

## Phase 6: Soft Launch and Update Safety

Objective: reduce risk on the first Store release.

Tasks:
- Submit first to a limited audience if possible
- Test upgrade flow from Store version `1.0.0` to next patched version
- Monitor:
  - launch success
  - recording success
  - export failures
  - crash rate
- Keep direct-download channel available as fallback during early Store rollout
- Document known limitations clearly, especially around ARM64 if anything remains architecture-specific

Exit criteria:
- Store install, launch, recording, and export succeed for early users
- at least one update has been validated successfully through the Store channel

## Recommended Ticket Breakdown

1. `store-01-packaged-smoke-tests`
2. `store-02-filesystem-audit`
3. `store-03-ffmpeg-store-bundling`
4. `store-04-native-module-release-validation`
5. `store-05-signing-and-partner-center-config`
6. `store-06-certification-kit`
7. `store-07-store-listing-assets`
8. `store-08-soft-launch-and-update-validation`

## Go/No-Go Gate

Do not submit to the Microsoft Store until all of the following are true:
- packaged x64 build passes the full core-flow smoke test
- packaged arm64 build passes on physical hardware
- FFmpeg/export path is deterministic in Store installs
- certification kit passes
- listing assets and policy links are ready
- signing identity matches Partner Center exactly

## Suggested Immediate Next Steps

1. Run a packaged x64 smoke test against the core flow and log all Store-specific failures.
2. Decide the Store FFmpeg bundling strategy, because that is the highest-risk export dependency.
3. Audit every write path in main/export code and explicitly mark allowed locations.
4. Create a release checklist artifact for signing, MSIX generation, certification, and submission.
