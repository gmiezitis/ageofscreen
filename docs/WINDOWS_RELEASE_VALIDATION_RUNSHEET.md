# Windows Release Validation Run Sheet

Use this sheet for final manual validation on real Windows hardware before release.
This is the evidence source for the remaining validation blocker in `release:status`.

## Candidate
- Version: `1.0.0`
- Build SHA: TBD
- Validation date: TBD
- Validator: TBD

## Devices
- Device 1: `x64` / OS version / tester
- Device 2: `arm64` / OS version / tester

## Direct Download Validation

### x64
- [ ] Install direct-download build
- [ ] Launch app from clean install
- [ ] Record fullscreen session
- [ ] Record window session
- [ ] Record webcam-enabled session
- [ ] Open recording in editor
- [ ] Trim media
- [ ] Apply style/background change
- [ ] Export default/original output
- [ ] Reopen exported file
- [ ] Export support bundle
- Notes:

### arm64
- [ ] Install direct-download build
- [ ] Launch app from clean install
- [ ] Record fullscreen session
- [ ] Record window session
- [ ] Record webcam-enabled session
- [ ] Open recording in editor
- [ ] Trim media
- [ ] Apply style/background change
- [ ] Export default/original output
- [ ] Reopen exported file
- [ ] Export support bundle
- Notes:

## Store Validation

### x64 MSIX
- [ ] Install Store package with App Installer
- [ ] Launch app from clean install
- [ ] Confirm no Squirrel-specific install behavior is required
- [ ] Record fullscreen session
- [ ] Record window session
- [ ] Record webcam-enabled session
- [ ] Open recording in editor
- [ ] Export styled output
- [ ] Confirm write paths stay in allowed locations
- [ ] Run WACK
- Notes:

### arm64 MSIX
- [ ] Install Store package with App Installer
- [ ] Launch app from clean install
- [ ] Confirm no Squirrel-specific install behavior is required
- [ ] Record fullscreen session
- [ ] Record window session
- [ ] Record webcam-enabled session
- [ ] Open recording in editor
- [ ] Export styled output
- [ ] Confirm bundled/native FFmpeg behavior
- [ ] Run WACK
- Notes:

## Outcome Summary
- Fullscreen recording on real hardware: `pass` / `fail`
- Window recording on real hardware: `pass` / `fail`
- Webcam-enabled recording on real hardware: `pass` / `fail`
- x64 Store install/export: `pass` / `fail`
- arm64 Store install/export: `pass` / `fail`
- Final validation decision: `go` / `needs-fixes`
- Follow-up issues:
