# Direct Download Release Notes

Use this for the non-Store Windows release channel so packaging and rollout notes do not stay implicit.
Drafted for the current `1.0.0` candidate.

## Release
- Version: `1.0.0`
- Release date: TBD
- Channels: `Windows direct-download`
- Artifacts:
  - `out/make/**/*.zip`

## Packaging Notes
- Distribution format remains `Squirrel + ZIP`
- `x64` and `arm64` direct-download packages are both supported
- Keep direct-download available while Store rollout risk is still being evaluated
- Primary goal is to keep a fallback Windows channel available while Microsoft Store certification is still in progress

## Install / Update Notes
- Clean install path verified: TBD
- Update path verified: TBD
- Rollback path verified: TBD

## Known Packaging Risks
- Native module packaging must be validated on both `x64` and `arm64`
- FFmpeg-backed export behavior must be confirmed on packaged builds
- Real-hardware validation is still required before broad launch

## User-Facing Notes
- Local-first screen recording and editing workflow
- Export and reopen flow validated in automated smoke coverage
- Microsoft Store release may lag direct-download while certification is in progress
- This channel remains the fastest path for early testers while manual validation is still being completed

## Support
- Support URL: `https://ageofscreen.app/support`
- Privacy policy: `https://gmiezitis.github.io/ageofscreen/privacy.html`
- Support email: `ageofai.support@gmail.com`
