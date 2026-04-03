# Open Source MIT Research for ageofscreen

Last updated: 2026-03-24

## Why this exists

ageofscreen is in a pivot where reliability and simplicity matter more than feature count.
The current pain is not "missing features" but "existing features feel laggy, fragile, and too complex."

This document maps our current feature surface to MIT-licensed GitHub projects that already solve similar problems well enough to benchmark, learn from, or partially adopt.

The goal is:

1. Keep the features that matter.
2. Remove avoidable complexity.
3. Copy proven architecture patterns instead of inventing everything ourselves.
4. Improve recording smoothness, playback reliability, and export correctness first.

Important note:
MIT on the repo is a strong starting filter, but we still need to review each repo's dependency tree, bundled binaries, attribution requirements, and platform limitations before vendoring or copying code.

## ageofscreen feature inventory

### Core flow

- Record fullscreen
- Record window mode
- Webcam overlay
- Trim / cut timeline
- Style presets
- Export with FFmpeg
- Free watermark / Pro unlock
- Local auto-polish

### Hidden or legacy features

- Teleprompter
- Drawing overlay
- Live magnifier
- Advanced auto-zoom / typing zoom
- Focus widget / focus timer workflow

## Feature-to-reference map

Use this section when we want to answer a simple question:
"For this ageofscreen feature, which MIT project should we benchmark first?"

### Core recording and media features

| ageofscreen feature | Priority | Best MIT benchmark repos | What to learn |
| --- | --- | --- | --- |
| Fullscreen recording | P0 | `robmikh/Win32CaptureSample`, `evansalter/kap` | Stable capture loop, frame delivery, native-vs-Electron boundaries |
| Window recording | P0 | `robmikh/Win32CaptureSample`, `sunnyone/ScreenCaptureWrapper` | Window-target capture flow, simpler capture presets, fallback paths |
| Webcam overlay | P0 | `theterminalguy/floatcam`, `contrastio/recorder`, `addyosmani/recorder` | Separate camera lifecycle, smaller overlay subsystem, composition strategy |
| Recording setup UX | P0 | `addyosmani/recorder`, `contrastio/recorder`, `evansalter/kap` | Minimal controls, cleaner pre-record flow, fewer blocking setup steps |
| Live preview during recording | P0 | `robmikh/Win32CaptureSample`, `contrastio/recorder` | Lighter preview path, reduced UI work on the hot path |
| Trim / cut timeline | P1 | `pansyjs/video-editing-timeline`, `limistah/react-video-trimmer` | Simpler clip interactions, lighter rendering model, trim-first workflow |
| Style presets | P1 | `drawcall/FFCreatorLite`, `OpenNewsLabs/autoEdit_2` | Keep presets deterministic and export-friendly instead of overly dynamic |
| Export pipeline | P0 | `drawcall/FFCreatorLite`, `daem-on/fwf` | Simpler FFmpeg orchestration, fewer fragile branches, clearer preview/export split |
| Auto-polish | P1 | `OpenNewsLabs/autoEdit_2`, `drawcall/FFCreatorLite` | Deterministic edit pipeline, conservative automation, export-safe transforms |

### Secondary and legacy features

| ageofscreen feature | Priority | Best MIT benchmark repos | What to learn |
| --- | --- | --- | --- |
| Teleprompter | P2 | `addyosmani/recorder` | How to keep it useful without adding setup complexity |
| Drawing overlay | P2 | `excalidraw/excalidraw` | Better scene model, simpler input handling, exportable annotations |
| Live magnifier | P2 | no strong MIT match yet | Only research deeper if the feature survives the pivot |
| Advanced auto-zoom / typing zoom | P2 | `OpenNewsLabs/autoEdit_2`, `drawcall/FFCreatorLite` | Prefer export-safe zoom logic over fragile live behavior |
| Focus widget / focus timer | P2 | no strong MIT match yet | Keep isolated from recording unless it directly improves core flow |
| OCR smart targeting | P2 | no strong MIT match yet | Do not prioritize until capture reliability is stable |

### Best first repo by feature area

If we want the fastest possible research sequence, start here:

1. Recording engine: `robmikh/Win32CaptureSample`
2. Webcam window: `theterminalguy/floatcam`
3. Recorder UX: `addyosmani/recorder`
4. Timeline simplification: `pansyjs/video-editing-timeline`
5. Export simplification: `drawcall/FFCreatorLite`

## Best MIT benchmark repos by subsystem

### 1. Recording pipeline

#### robmikh/Win32CaptureSample
- Repo: https://github.com/robmikh/Win32CaptureSample
- License: MIT
- Why it matters:
  Windows-native capture benchmark for the exact platform that matters most to ageofscreen.
- What to study:
  Windows.Graphics.Capture usage, frame pool threading, picker setup, preview presentation path.
- Why it is especially relevant:
  The sample explicitly documents `Create` vs `CreateFreeThreaded`, which is directly relevant to dropped frames, callback threading, and deadlock-prone capture loops.
- ageofscreen use:
  Benchmark against our current Windows capture engine and main-process orchestration before changing anything UI-side.

#### evansalter/kap
- Repo: https://github.com/evansalter/kap
- License: MIT
- Why it matters:
  Electron screen recorder built with web technology.
- What to study:
  App structure, recorder lifecycle boundaries, separation between capture UI and processing, packaging discipline.
- ageofscreen use:
  Good benchmark for "simple recorder product shape" and what should stay out of the hot path during capture.

#### addyosmani/recorder
- Repo: https://github.com/addyosmani/recorder
- License: MIT
- Why it matters:
  Browser-based local recorder with screen + camera, camera shape controls, teleprompter, and MP4-oriented workflow.
- What to study:
  Screen/camera composition, preview UX, teleprompter integration, camera customization, local-first flow.
- ageofscreen use:
  Strong benchmark for simplifying our recording setup UX without losing useful creator features.

#### contrastio/recorder
- Repo: https://github.com/contrastio/recorder
- License: MIT
- Why it matters:
  Local screen and camera recording with picture-in-picture and insertable-streams focus.
- What to study:
  Camera + screen recording flow, browser-native composition patterns, local-first UX.
- ageofscreen use:
  Benchmark for how much of our camera/preview path can be simplified before we reach export.

#### sunnyone/ScreenCaptureWrapper
- Repo: https://github.com/sunnyone/ScreenCaptureWrapper
- License: MIT
- Why it matters:
  Simple FFmpeg-first screen capture frontend.
- What to study:
  Minimal preset-driven recording model, capture presets, how little UI is actually needed for screen recording.
- Caveat:
  Old project, so use for ideas, not for direct architecture copying.

### 2. Webcam and overlay windows

#### theterminalguy/floatcam
- Repo: https://github.com/theterminalguy/floatcam
- License: MIT
- Why it matters:
  Very close to one of our laggiest surfaces: floating webcam window for screen recording.
- What to study:
  Always-on-top window behavior, move/resize simplicity, camera-only product shape, separation from the recorder itself.
- ageofscreen use:
  Likely the best benchmark for simplifying our webcam window into a more reliable standalone subsystem.

#### SnosMe/electron-overlay-window
- Repo: https://github.com/SnosMe/electron-overlay-window
- License: MIT
- Why it matters:
  Dedicated overlay-window syncing library for Electron.
- What to study:
  Window position/size sync, target tracking, lifecycle handling.
- ageofscreen use:
  Benchmark for whether our webcam / recording widget / overlay positioning logic should be simplified around a proven sync primitive instead of custom code in `src/index.ts`.

### 3. Timeline and trim UX

#### pansyjs/video-editing-timeline
- Repo: https://github.com/pansyjs/video-editing-timeline
- License: MIT
- Why it matters:
  Lightweight purpose-built timeline library with React package support.
- What to study:
  Timeline rendering model, zoom strategy, clip interaction model, canvas-based performance approach.
- ageofscreen use:
  Benchmark for replacing custom heavy DOM timeline behavior if our current timeline gets janky with more clips/effects.

#### limistah/react-video-trimmer
- Repo: https://github.com/limistah/react-video-trimmer
- License: MIT
- Why it matters:
  Focused trimmer component rather than full editor.
- What to study:
  Trim-first UX, minimal control surface, ffmpeg-in-browser loading states.
- ageofscreen use:
  Benchmark for reducing trim complexity in the editor and tightening the beginner path.

### 4. Video editor / export architecture

#### daem-on/fwf
- Repo: https://github.com/daem-on/fwf
- License: MIT
- Why it matters:
  Electron + FFmpeg editor with a timeline, preview, and filter editor.
- What to study:
  Main/renderer split, FFmpeg command orchestration, preview streaming, IPC boundary design.
- ageofscreen use:
  Benchmark for simplifying our `renderer -> IPC -> FFmpeg` architecture around clear render instructions.

#### drawcall/FFCreatorLite
- Repo: https://github.com/drawcall/FFCreatorLite
- License: MIT
- Why it matters:
  FFmpeg-first composition library that explicitly prioritizes speed and simpler installation over maximum features.
- What to study:
  Filter graph construction, fast composition philosophy, effect selection discipline.
- ageofscreen use:
  Great benchmark for deciding which export effects should remain FFmpeg-native and which should be cut.

#### OpenNewsLabs/autoEdit_2
- Repo: https://github.com/OpenNewsLabs/autoEdit_2
- License: MIT
- Why it matters:
  Electron desktop editor built around a simplified editing workflow instead of a feature-maximal timeline.
- What to study:
  Workflow design, deterministic editing pipeline, how to reduce editor complexity around a specific production use case.
- ageofscreen use:
  Useful benchmark for the future of Auto-Polish and simplified edit flows.

### 5. Drawing / annotation

#### excalidraw/excalidraw
- Repo: https://github.com/excalidraw/excalidraw
- License: MIT
- Why it matters:
  Mature MIT drawing/annotation engine with strong export and interaction primitives.
- What to study:
  Input handling, scene data model, lightweight annotation UX, export primitives.
- ageofscreen use:
  Benchmark for whether our drawing overlay should become much simpler and more declarative instead of custom ad hoc canvas behavior.

## Recommended research order

### P0: capture and playback reliability

1. `robmikh/Win32CaptureSample`
2. `floatcam`
3. `addyosmani/recorder`
4. `contrastio/recorder`

Why:
This is the highest-value cluster for ageofscreen because our biggest product risk is still recording lag, black preview, duplicate webcam behavior, and unstable capture flow.

### P1: editor simplification

1. `video-editing-timeline`
2. `react-video-trimmer`
3. `fwf`

Why:
These give us the best signal on how much editor code we can simplify without losing the `Trim -> Style -> Export` workflow.

### P1: export speed and correctness

1. `FFCreatorLite`
2. `fwf`
3. `autoEdit_2`

Why:
Our export path should stay deterministic and boring. These repos are useful benchmarks for reducing fancy-but-fragile logic.

### P2: legacy feature triage

1. `excalidraw`
2. `addyosmani/recorder` for teleprompter ideas
3. more targeted research for magnifier / auto-zoom only if those features survive the pivot

Why:
These features should not be rewritten until recording and export are stable.

## What we should extract from each repo

For every candidate repo we should capture the same fields:

- Feature match to ageofscreen
- Platform match
- License confirmed
- Last meaningful activity
- Architecture style
- Performance strategy
- Complexity level
- What to copy
- What to avoid
- Whether we should:
  copy ideas,
  copy structure,
  wrap a library,
  or rewrite our implementation using the repo only as a benchmark

## ageofscreen-specific hypotheses to test

### Recording lag

Likely causes in our app:
- too much work happening on the capture path
- multiple overlay windows participating in the recording session
- webcam/window sync logic coupled too tightly to recording lifecycle
- Electron/Chromium capture path carrying responsibilities that should be native or separate

Best repos to benchmark:
- `robmikh/Win32CaptureSample`
- `floatcam`
- `addyosmani/recorder`

### Playback and editor lag

Likely causes in our app:
- custom timeline/preview logic doing too much per frame
- heavy DOM-based timeline interactions
- preview state coupled too tightly to editor state

Best repos to benchmark:
- `video-editing-timeline`
- `react-video-trimmer`
- `fwf`

### Export lag or fragility

Likely causes in our app:
- overly complex FFmpeg graph generation
- effects included in export that should be preview-only or cut
- too many fallback branches

Best repos to benchmark:
- `FFCreatorLite`
- `fwf`

## Suggested next deliverables

1. Create a per-feature audit spreadsheet or markdown matrix for the repos above.
2. For the top 4 recording-related repos, inspect code structure and summarize:
   - capture pipeline
   - preview composition
   - overlay/window strategy
   - performance-critical choices
3. Convert findings into concrete ageofscreen refactor tickets:
   - capture engine
   - webcam overlay isolation
   - recording setup simplification
   - timeline rendering simplification
   - FFmpeg pipeline reduction

## Source links used

- https://github.com/robmikh/Win32CaptureSample
- https://github.com/evansalter/kap
- https://github.com/addyosmani/recorder
- https://github.com/contrastio/recorder
- https://github.com/sunnyone/ScreenCaptureWrapper
- https://github.com/theterminalguy/floatcam
- https://github.com/SnosMe/electron-overlay-window
- https://github.com/pansyjs/video-editing-timeline
- https://github.com/limistah/react-video-trimmer
- https://github.com/daem-on/fwf
- https://github.com/OpenNewsLabs/autoEdit_2
- https://github.com/drawcall/FFCreatorLite
- https://github.com/excalidraw/excalidraw
