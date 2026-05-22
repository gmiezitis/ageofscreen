# Test And Release Plan

## Goal
Ship `ageofscreen` with enough confidence that the core user promise is reliable:

`Record -> Trim -> Style -> Export`

---

## Current Status
- Unit and helper tests are now running through `Vitest`
- Export and timeline helper logic has baseline automated coverage
- Legacy test runner still works as a fallback
- Packaging workflow exists in `.github/workflows/windows-packaging.yml`
- Dev smoke tests now rebuild their own `.webpack` bundle when needed
- Packaged smoke tests now verify:
  - app launch
  - media editor load
  - original export round-trip
  - vertical export round-trip
  - smoke failure artifacts with screenshots and logs in CI
- Bundled FFmpeg payloads now exist for `win32-x64` and `win32-arm64`
- `npm run release:gate` enforces the automated release baseline
- `npm run release:gate:market` stays blocked until every manual item in `config/release-readiness.json` is cleared
- `npm run release:readiness` lists the manual launch items, and you can update one with `npm run release:readiness -- done --id=<item-id>`
- Launch assets now have starting points in `docs/RELEASE_CHECKLIST.md` and `docs/RELEASE_NOTES_TEMPLATE.md`
- Launch-day ownership now has a dedicated template in `docs/RELEASE_OWNERSHIP.md`
- A working cross-channel release-notes draft now exists in `docs/RELEASE_NOTES.md`

This means the project is no longer starting from zero, but it is not market-ready yet.

---

## Phase 1: Fast Safety Net
Target: now to next few days

What we need:
- Keep `npm test` green on every change
- Add tests for export decision logic
- Add tests for auto-polish decisions
- Add tests for timeline transitions and cursor overlay behavior

Exit criteria:
- Core pure logic has solid coverage in `tests/*.test.ts`
- No repeated regressions in export math, cursor remapping, or timeline packing

---

## Phase 2: Core Flow Smoke Tests
Target: after helper tests are stable

What we need:
- Add automated smoke tests for:
  - open app
  - load media
  - basic trim
  - basic style change
  - export completes
- Add a small set of packaged-build smoke checks
- Verify both `win32 x64` and `win32 arm64` packaging paths

Recommended tooling:
- `Playwright` for app-level and UI smoke coverage

Exit criteria:
- One automated smoke path covers the main happy flow
- Packaged builds can be exercised without manual guesswork

---

## Phase 3: Release Reliability
Target: before any public launch

What we need:
- Crash and export failure triage on real test machines
- Manual checklist for:
  - fullscreen recording
  - window recording
  - webcam enabled
  - editor trim
  - export with watermark
  - export without advanced effects
- Validate support bundle generation
- Validate FFmpeg path behavior in packaged builds

Exit criteria:
- No blocker bugs in the core flow
- No major export failures on packaged builds
- No repeated crashes during a 3-minute recording/export session

---

## Phase 4: Pre-Market Gate
Target: right before Store/private beta submission

What we need:
- Private test group using packaged builds
- A short bug-bash round focused only on the core workflow
- Fix P0 and P1 issues only
- Freeze feature work during the stabilization window

Exit criteria:
- 10 to 20 clean end-to-end runs across test devices
- No open P0 bugs
- No open P1 bugs in the main workflow
- Store package and direct-download package both pass smoke checks

---

## When We Are Ready To Push
We should consider the app ready for market when all of this is true:

1. `npm test` is stable and part of the default workflow
2. At least one automated end-to-end smoke test covers the core flow
3. Packaged Windows builds pass the manual checklist on real hardware
4. Export works reliably for the default path without hidden setup
5. No open blocker bugs in recording, trimming, or exporting
6. Store submission artifacts and release notes are prepared

You can also run `npm run release:status` for a quick repo-level readiness snapshot.
Use `npm run release:gate` to enforce automated readiness, and `npm run release:gate:market` when you want the repo to tell you if launch blockers are truly cleared.

---

## Current Blocking Gaps
Validation:
- Real hardware validation is still needed for:
  - fullscreen recording
  - window recording
  - webcam-on capture
- Private beta / bug-bash validation has not happened yet

Launch Ops:
- We still need a short release checklist for launch day ownership
- Release notes still need a final pass for direct-download and store channels

Working docs:
- Use `docs/RELEASE_CHECKLIST.md` to track launch-day owners and sign-off
- Use `docs/RELEASE_NOTES.md` as the working release-notes draft
- Use `docs/RELEASE_NOTES_TEMPLATE.md` only if a fresh template is needed later
- Use `docs/RELEASE_OWNERSHIP.md` to assign the release lead, go/no-go approver, and rollback owners

Store And Submission:
- Store submission materials still need final review
- Direct-download packaging notes still need final review

Working docs:
- Use `docs/STORE_SUBMISSION_PACKET.md` as the single working packet for Partner Center prep
- Use `docs/MICROSOFT_STORE_CHECKLIST.md` and `docs/MICROSOFT_STORE_DEPLOYMENT_PLAN.md` for Store-specific validation and sequencing
- Use `docs/STORE_METADATA_FILLIN.md` to track final Partner Center values, public URLs, and screenshot ownership
- Use `docs/WINDOWS_RELEASE_VALIDATION_RUNSHEET.md` for real-hardware validation evidence
- Use `docs/PRIVATE_BETA_EVIDENCE.md` for bug-bash or private-flight proof
- Use `docs/DIRECT_DOWNLOAD_RELEASE_NOTES.md` for the non-Store release channel notes

---

## Practical Recommendation
Best launch sequence:

1. Finish unit and export-path tests
2. Add one Playwright smoke test for the happy path
3. Run private packaged testing on Windows x64 first
4. Validate ARM64 on real hardware
5. Ship to a private/beta audience before broad release

That is the point where pushing to market becomes responsible instead of risky.
