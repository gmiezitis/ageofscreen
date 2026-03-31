# SnipFocus Agent Execution Playbook

## Purpose
This is the operational plan for agents to simplify SnipFocus without losing existing project potential.

Primary goal: make the app instantly understandable and reliable for
`Record -> Trim -> Style -> Export` local AI demo videos.

---

## Non-Negotiables
- Do not delete legacy features yet; hide behind flags/UI sections.
- Reliability work is always higher priority than feature work.
- Any capture pipeline change must include fallback behavior.
- No major UX redesign until core recording is stable.

---

## Product Scope (Now)

### Core (Visible in main UI)
- Record (fullscreen + window modes)
- Trim/Cut
- Style (simple presets)
- Export (format presets)

### Hidden for now (not deleted)
- Teleprompter
- Live magnifier
- Experimental drawing/auto-zoom variants
- Complex hotkey-heavy controls in default path

### Pro-ready (feature gated, can ship later)
- Advanced effects/transitions
- Batch rendering/templates
- Auto-polish advanced controls
- Watermark removal

---

## Current File Map (Important)
- Main process orchestration: `src/index.ts`
- Recording pipeline: `src/components/RecordingManager.tsx`
- Recording setup UX: `src/components/RecordingSetup.tsx`
- Main launcher UI: `src/components/RadialMenu.tsx`
- Webcam overlay window: `src/webcam/webcam.tsx`
- Video editor UI/logic: `src/videoEditor/videoEditor.tsx`, hooks in `src/videoEditor/`
- Export/render service: `src/services/videoRenderer.ts`

---

## Execution Phases

## Phase 0: Stabilize Branching and Feature Flags
### Tasks
1. Add central feature flag file (`src/config/features.ts`) with:
   - `ENABLE_TELEPROMPTER`
   - `ENABLE_DRAWING`
   - `ENABLE_LIVE_MAGNIFIER`
   - `ENABLE_AUTO_ZOOM_ADVANCED`
   - `ENABLE_PRO_FEATURES`
2. Replace scattered feature toggles with this central config.
3. Ensure hidden features are removed from primary UI but callable in dev.

### Acceptance
- App launches with only core flow visible.
- No runtime errors when hidden features are disabled.

---

## Phase 1: Reliability Lock (P0)
### Tasks
1. Lock two capture paths only:
   - Fullscreen direct path (no duplicate webcam streams)
   - Window-mode compositor path
2. Add capture health diagnostics:
   - dropped frame count
   - buffer failure count
   - effective fps estimate
3. Add safe degradation:
   - if buffer errors spike, lower fps and resolution automatically.
4. Add a visible “capture health” badge in recording session (simple green/yellow/red).

### Acceptance
- No duplicate webcam in output.
- No black webcam during recording resize.
- Video plays smoothly in media player for 3-minute test.

---

## Phase 2: Simplicity UX Pass
### Tasks
1. In `RecordingSetup`, keep only:
   - camera on/off
   - mode (fullscreen/window)
   - camera shape/size
   - presenter name (optional)
2. Move non-core controls into collapsed “Advanced (Beta)” section.
3. In launcher/radial menu, only expose core entry points.
4. Make one clear primary CTA: “Start Recording”.

### Acceptance
- New user can start recording in <= 2 clicks.
- Main recording setup reads clearly without explanation.

---

## Phase 3: Free/Pro Framework + Watermark
### Tasks
1. Add plan config (`src/config/plan.ts`):
   - `plan: 'free' | 'pro'`
2. Implement export watermark in free plan:
   - `Made with SnipFocus`
   - bottom-right, low-opacity, resolution-aware.
3. Add watermark toggle logic at export stage only.
4. Keep core quality same in free and pro.

### Acceptance
- Free exports always include watermark.
- Pro exports never include watermark.
- Export speed/performance remains acceptable.

---

## Phase 4: Killer Feature (v1) - Local Auto-Polish
### Scope for v1
- One-click action in editor: “Auto-Polish”
- Pipeline:
  1) smart start/end trim
  2) silence cut (conservative)
  3) loudness normalize
  4) apply clean style preset
  5) export with selected format preset

### Tasks
1. Add deterministic preset pipeline configuration.
2. Provide preview diff: before/after duration and quick quality summary.
3. Keep v1 deterministic (no unpredictable AI decisions).

### Acceptance
- One click runs full local pipeline.
- Output is visibly cleaner without manual edits.
- Works offline, no cloud calls required.

---

## Hide vs Delete Policy
- Hide now: feature removed from default UI and disabled by flag.
- Delete later: only after 2 stable releases and no dependency usage.
- Keep old code paths isolated and documented under `legacy` comments until removal.

---

## Agent Guardrails
- Never add new surface features before P0 reliability goals pass.
- Avoid introducing new external infra for this phase.
- Prefer simple config flags over deep branching logic.
- Keep changed files small and focused; extract modules if files exceed ~300 lines.

---

## Test Checklist (Every PR in this phase)
1. Record fullscreen with webcam, move/resize webcam while recording.
2. Record window mode with webcam.
3. Stop recording using widget and Escape.
4. Open result in media player and verify smooth playback.
5. Export free plan output and verify watermark.
6. Confirm hidden features are absent from main UI.

---

## Suggested Agent Ticket Order
1. `ticket-01-feature-flags-core`
2. `ticket-02-recording-health-metrics`
3. `ticket-03-core-ui-simplification`
4. `ticket-04-free-pro-plan-config`
5. `ticket-05-watermark-export`
6. `ticket-06-auto-polish-v1`

Each ticket should be independently mergeable and testable.
