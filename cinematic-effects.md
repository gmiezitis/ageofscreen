# Cinematic Effects — 3D Flip, Smooth Zoom & Breathing Padding

## Goal
Add 3 premium cinematic effects to the video editor, inspired by the Google Gemini 3.1 demo. These are new Smart Effect types that users can add to the timeline.

---

## Current Architecture

**Smart Effects pipeline:**
1. User adds effect via Timeline → `SmartEffect` object with `type`, `startTime`, `duration`, `intensity`
2. `getEffectStyle()` in `src/videoEditor/utils.ts` converts active effects → CSS transforms
3. `PreviewStage.tsx` applies the style to `<video>` via `effectStyle` prop
4. Existing types: `cursor_follow`, `zoom`, `3d_tilt`, `vignette`, `exposure`, `blur_area`

**Files involved:**
- `src/videoEditor/types.ts` — `SmartEffect` interface (line 46-56)
- `src/videoEditor/utils.ts` — `getEffectStyle()` function (line 37-105)
- `src/components/videoEditor/PreviewStage.tsx` — renders effects on video
- `src/videoEditor/videoEditor.tsx` — passes effects to PreviewStage
- `src/components/videoEditor/Timeline.tsx` — UI for adding/managing effects

---

## Feature 1: 3D Card Flip

**What:** Video flips like a card in 3D space (Y-axis rotation with perspective). Smooth 180° flip with preserved depth.

**How it looks:** Video rotates around its Y-axis, revealing the "back" (which shows the same video, creating a dramatic transition moment).

### Tasks

- [x] **1.1** Add `'card_flip'` to `SmartEffect.type` union in `types.ts`
  → Verify: No TypeScript errors

- [x] **1.2** Add flip logic in `getEffectStyle()` in `utils.ts`:
  ```
  perspective(1000px) rotateY(progress * 180deg)
  ```
  - Ease: cubic-bezier for smooth acceleration/deceleration
  - Hold at 180° briefly (10% of duration), then flip back
  - Use `backface-visibility: hidden` during mid-flip
  → Verify: Add card_flip effect to timeline, video rotates in 3D

- [x] **1.3** Add "Card Flip" button in Timeline effect picker
  → Verify: Button appears, creates effect on timeline

- [x] **1.4** Add effect badge icon in `PreviewStage.tsx` (use `RotateCcw` from lucide)
  → Verify: Badge shows when effect is active

---

## Feature 2: Smooth Zoom (Parallax Dive)

**What:** Enhances the existing zoom — instead of a flat scale, it uses perspective + translateZ for a cinematic "dive into the screen" feel. Background elements move slower than foreground (parallax).

**How it looks:** Camera pushes forward into the video, creating depth. The zoom area feels like you're flying into it.

### Tasks

- [x] **2.1** Add `'smooth_zoom'` to `SmartEffect.type` union in `types.ts`
  → Verify: No TypeScript errors

- [x] **2.2** Add smooth_zoom logic in `getEffectStyle()` in `utils.ts`:
  ```
  perspective(1200px) translateZ(progress * 300px * intensity)
  ```
  - Use same area-based origin as regular zoom (`zoomArea`)
  - Easing: slow start, accelerate, slow end (custom cubic)
  - Add subtle `rotateX(2deg)` tilt during dive for cinema feel
  → Verify: Effect creates depth-based zoom, feels different from flat zoom

- [x] **2.3** Add "Smooth Zoom" button in Timeline effect picker
  → Verify: Button appears, creates effect with `zoomArea` support

- [x] **2.4** Reuse `AreaOverlay` from PreviewStage for area selection (same as regular zoom)
  → Verify: User can draw zoom target area

---

## Feature 3: Breathing Padding

**What:** The video padding animates smoothly — the video "breathes" by gently pulsing its scale. Creates a living, premium feel.

**How it looks:** Video gently pulses in and out (±2-3% scale) with a slow, organic rhythm. Like the video is breathing.

### Tasks

- [x] **3.1** Add `'breathing'` to `SmartEffect.type` union in `types.ts`
  → Verify: No TypeScript errors

- [x] **3.2** Add breathing logic in `getEffectStyle()` in `utils.ts`:
  ```
  scale(1 - sin(progress * PI * 2) * 0.03 * intensity)
  ```
  - Smooth sinusoidal oscillation
  - Very subtle (max ±3% at full intensity)
  - Affects video scale, revealing more/less background padding
  → Verify: Video gently pulses when effect is active and padding > 0

- [ ] **3.3** Add "Breathing" button in Timeline effect picker
  → Verify: Button appears, creates effect on timeline

- [ ] **3.4** Add effect badge icon in `PreviewStage.tsx` (use `Wind` from lucide)
  → Verify: Badge shows when effect is active

---

## Implementation Order

| Step | What | Risk | Time |
|------|------|------|------|
| 1 | Add 3 new types to `types.ts` | Low | 2 min |
| 2 | Add 3 effect calculations to `utils.ts` | Medium | 10 min |
| 3 | Add 3 buttons to Timeline effect picker | Low | 5 min |
| 4 | Add badges + overlay support in PreviewStage | Low | 5 min |
| 5 | Test all 3 effects in editor | — | 5 min |

**Total: ~30 min**

---

## Scope Decisions

- **Preview only** — effects render in the editor via CSS transforms. No FFmpeg export baking (too complex for v1).
- **No AI integration** — pure local CSS/JS. AI hooks (Veo/Gemini) can be added later as an enhancement layer.
- **Smart Effects pattern** — reuses the existing timeline-based effect system. No new UI paradigm needed.

---

## Done When

- [ ] All 3 effects appear in Timeline effect picker
- [ ] Card Flip: video rotates 180° and back during effect duration
- [ ] Smooth Zoom: video pushes forward with depth perspective
- [ ] Breathing: video gently pulses scale when active
- [ ] No regressions to existing effects (zoom, blur, tilt, etc.)
- [ ] `npm start` runs without new TypeScript errors
