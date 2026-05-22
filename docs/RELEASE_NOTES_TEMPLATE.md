# Release Notes Template

Use this template for both direct-download and Store-facing release notes.
Keep it short, concrete, and user-visible.
Current draft baseline updated: `2026-04-26`

## Release
- Version: `1.0.0`
- Release date: TBD
- Channel: `both`

## Highlights
- Windows packaging and release workflow now cover both direct-download and Store channels
- Core smoke coverage now exercises app launch, media load, and export round-trips
- Export reliability has improved around packaged FFmpeg-backed flows and preset handling

## Improvements
- Faster developer feedback loop with `Vitest` and focused helper/export tests
- Dev smoke can rebuild its own `.webpack` bundle automatically before running
- CI now publishes release readiness summaries, smoke artifacts, and failure logs for faster triage

## Fixes
- Fixed export preset timing so `Vertical` does not silently fall back to `Original`
- Fixed direct-opened media approval so exported files can be reopened correctly
- Fixed Pro entitlement watermark behavior so paid users are not incorrectly flagged for watermark output

## Known Issues
- Real-hardware validation is still pending for fullscreen, window, and webcam-enabled recording
- Private beta feedback and final launch-ops review are still pending before a broad market release

## Upgrade Notes
- Before release, replace placeholder notes with user-facing wording only and remove internal validation language

## Support
- Support contact: TBD
- Docs / help link: TBD
