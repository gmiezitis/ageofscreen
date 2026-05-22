# Release Notes

Drafted for the current `1.0.0` candidate.
Use this as the working release-notes source for both direct-download and Store channels, then trim per channel as needed.

## Release
- Version: `1.0.0`
- Release date: TBD
- Channel: `both`

## Highlights
- Windows packaging and release workflow now cover both direct-download and Microsoft Store channels
- Core smoke coverage now exercises app launch, media load, export, and reopen flows
- Export handling is more reliable in packaged builds, including preset selection and FFmpeg-backed paths

## Improvements
- Faster developer feedback with `Vitest` and focused helper/export tests
- Dev smoke can rebuild its own `.webpack` bundle before running
- CI now publishes release readiness summaries, smoke artifacts, and failure logs

## What's New In This Version
- App now starts automatically with Windows so the top trigger line is ready after restart.
- Stopping a recording now opens the editor more reliably.
- Recording controls restore the script/subtitles, drawing, webcam, and edit-after-stop options.

## Fixes
- Fixed export preset timing so `Vertical` no longer silently falls back to `Original`
- Fixed direct-opened media approval so exported files can be reopened correctly
- Fixed Pro entitlement watermark behavior so paid users are not incorrectly flagged for watermark output

## Known Issues
- Real-hardware validation is still pending for fullscreen, window, and webcam-enabled recording
- Private beta feedback is still pending before a broad market rollout
- Microsoft Store release timing may lag the direct-download channel while certification is in progress

## Support
- Support URL: `https://ageofscreen.app/support`
- Privacy policy: `https://gmiezitis.github.io/ageofscreen/privacy.html`
- Support email: `ageofai.support@gmail.com`
