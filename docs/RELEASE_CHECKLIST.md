# Release Checklist

Use this checklist for a direct-download or Store release candidate.
Do not mark the launch-op blocker complete until every required item here has an owner and a real status.
Current baseline updated: `2026-04-26`

## Release Candidate
- Version: `1.0.0`
- Target date: TBD
- Channel: `both` (`direct-download` zip and `store` MSIX)
- Build SHA: TBD at release cut
- Release owner: see `docs/RELEASE_OWNERSHIP.md`
- Go/no-go approver: see `docs/RELEASE_OWNERSHIP.md`

## Automated Gates
- [x] `npm test` is wired into the release workflow
- [x] `npm run test:smoke` is wired for the direct/x64 release lane
- [x] `npm run test:smoke:packaged` is wired for the packaged direct/x64 release lane
- [x] `npm run release:gate` is wired into CI
- [x] Windows packaging workflow builds `direct` and `store` channels for `x64` and `arm64`
- [ ] Candidate commit has a fresh green CI run recorded

## Manual Validation
- [ ] Fullscreen recording validated on real hardware
- [ ] Window recording validated on real hardware
- [ ] Webcam-enabled capture validated on real hardware
- [ ] Trim/edit flow validated with sample media
- [ ] Default export validated end-to-end
- [ ] Watermark/non-Pro behavior validated
- [ ] FFmpeg-dependent export path validated in packaged build
- Current repo signal: automated smoke covers app launch, editor load, original export round-trip, and vertical export round-trip in dev and packaged flows
- Evidence sheet: `docs/WINDOWS_RELEASE_VALIDATION_RUNSHEET.md`

## Launch Ops
- [ ] Release notes reviewed and finalized
- [ ] Support contact and support docs verified
- [ ] Known issues section reviewed
- [ ] Rollback plan confirmed
- [ ] Go/no-go owner confirmed for launch window
- [ ] Release announcement owner confirmed
- Current repo signal: a working release-notes draft now exists in `docs/RELEASE_NOTES.md`
- Support references: `https://ageofscreen.app/support`, `https://gmiezitis.github.io/ageofscreen/privacy.html`, `ageofai.support@gmail.com`
- Current repo signal: launch ownership now has a dedicated home in `docs/RELEASE_OWNERSHIP.md`
- Beta evidence: `docs/PRIVATE_BETA_EVIDENCE.md`

## Store And Submission
- [ ] Store listing copy reviewed
- [ ] Screenshots and submission assets reviewed
- [ ] Privacy/support links verified
- [ ] Certification notes reviewed
- [ ] Direct-download packaging notes reviewed
- Current repo signal: store-facing docs already exist under `docs/store/` and `docs/MICROSOFT_STORE_CHECKLIST.md`
- Direct-download notes: `docs/DIRECT_DOWNLOAD_RELEASE_NOTES.md`

## Sign-Off
- Engineering:
- QA:
- Product/Launch:
- Final decision: `go` / `no-go`
- Notes:
