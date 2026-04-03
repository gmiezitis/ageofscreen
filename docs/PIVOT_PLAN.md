# ageofscreen Pivot Plan (Local AI Demo Video Maker)

## Vision
ageofscreen becomes the fastest way to create polished AI demo clips locally:
`Record -> Trim -> Style -> Export`.

## Core Problem To Solve
Users need to quickly turn raw AI tool walkthroughs into presentation-ready videos without cloud upload, heavy editors, or unstable capture.

## Current Pain Moments (Critical)
- Recording reliability is inconsistent (frame drops, duplicate webcam, black preview).
- Too many overlapping features reduce clarity and trust.
- In-recording controls can interfere with capture stability.
- Users cannot quickly understand the intended workflow.

## Product Strategy (Simple + Fast)

### Free Version
- Stable local recording
- Basic trim/cut
- Basic style presets (background/frame/webcam shape)
- Export presets (16:9, 1:1, 9:16)
- Small watermark in exported videos

### Pro Version
- Watermark removal
- Advanced effects/transitions
- Batch exports and reusable templates
- Advanced automation and AI polish features

## One Cutting-Edge Killer Feature
## Local AI Auto-Polish (One Click)
- Generates a cleaned demo cut automatically (silence trim + cursor smoothing + chapter markers).
- Runs locally for privacy.
- Outputs both final video and summary chapters.
- Free: limited usage per day; Pro: unlimited + advanced controls.

## 6-Week Execution Plan

### Phase 1 (Week 1-2): Reliability First
- Lock 2 stable capture pipelines only:
  - Fullscreen direct capture
  - Window mode compositor capture
- Eliminate dual-webcam-stream scenarios.
- Add capture health metrics: dropped frame count, buffer errors, effective fps.
- Add safe fallback when capture degrades.

### Phase 2 (Week 3-4): UX Simplification
- Reduce primary UI to the 4-step flow.
- Hide non-core features from default navigation.
- Add onboarding tips for first recording and export presets.
- Improve in-recording controls to minimal, non-blocking set.

### Phase 3 (Week 5-6): Monetization + Differentiation
- Implement watermarking pipeline for free exports.
- Add Pro unlock model (flag-based entitlements).
- Ship v1 Local AI Auto-Polish.
- Add "Google-style clean" default preset theme.

## Watermark Implementation Notes
- Placement: bottom-right, low opacity, safe margins.
- Text: "Made with ageofscreen" (short and tasteful).
- Applied at export stage only.
- Ensure resolution-aware scaling for all export formats.

## Success Metrics
- Recording success rate (start to valid playable file): target > 98%.
- Median time from record start to export complete: target < 90 seconds.
- Crash/critical capture error rate per session: trend down weekly.
- Free-to-Pro conversion trigger: watermark removal + auto-polish value.

## Feature Triage Policy (Until Stability)
- P0 only: reliability, core flow, export correctness.
- P1: simplification and onboarding.
- P2: advanced/pro features.
- No new side features unless they directly improve core completion.
