# Media Simplification Blueprint for ageofscreen

Last updated: 2026-03-24

## Goal

Keep ageofscreen feeling like ageofscreen.
Do not redesign the product.
Do not change the core flow:

`Record -> Trim -> Style -> Export`

The goal is to replace complex or fragile internal logic with lighter open-source patterns so the app becomes:

- smoother
- easier to maintain
- easier to export correctly
- less crash-prone

This blueprint focuses on four problem areas:

1. Picture clips in the timeline and pictures over video
2. Pin/overlay behavior on the preview and timeline
3. Annotation tools and editing UX
4. Auto-Polish export workflow

## Non-negotiables

- Keep the visible editor structure mostly the same
- Keep local-first processing
- Keep the main timeline metaphor
- Keep image clips as real timeline items
- Keep over-video images/overlays as separate visual items
- Keep Auto-Polish as a simple one-click action
- Prefer deleting custom glue code over adding more glue code

## Current hotspots in our code

These are the places where complexity is currently concentrated:

- [src/videoEditor/useTimelineDrag.ts](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/videoEditor/useTimelineDrag.ts)
- [src/components/videoEditor/Timeline.tsx](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/components/videoEditor/Timeline.tsx)
- [src/components/videoEditor/PreviewStage.tsx](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/components/videoEditor/PreviewStage.tsx)
- [src/components/videoEditor/VideoAnnotationLayer.tsx](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/components/videoEditor/VideoAnnotationLayer.tsx)
- [src/components/AnnotationCanvas.tsx](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/components/AnnotationCanvas.tsx)
- [src/services/annotationManager.ts](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/services/annotationManager.ts)
- [src/videoEditor/useEditorExport.ts](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/videoEditor/useEditorExport.ts)
- [src/services/videoRenderer.ts](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/services/videoRenderer.ts)
- [src/videoEditor/autoPolishPlan.ts](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/videoEditor/autoPolishPlan.ts)

### What looks risky today

#### 1. Image behavior is split across multiple models

Right now we have separate structures for:

- `segments`
- `imageClips`
- `overlayImages`
- `textOverlays`
- `smartEffects`

That creates custom shifting logic whenever a clip is inserted or deleted.
The current insertion path in [src/videoEditor/useTimelineDrag.ts](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/videoEditor/useTimelineDrag.ts) manually shifts multiple arrays together.

#### 2. Preview interaction uses custom DOM math

[src/components/videoEditor/PreviewStage.tsx](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/components/videoEditor/PreviewStage.tsx) is responsible for:

- crop-aware positioning
- effect preview bounds
- overlay dragging
- overlay resizing
- text editing docking
- annotation layer mounting
- image clip visibility

That is too much responsibility for one preview surface.

#### 3. Annotation exists in more than one style

We currently have both:

- [src/components/AnnotationCanvas.tsx](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/components/AnnotationCanvas.tsx)
- [src/components/videoEditor/VideoAnnotationLayer.tsx](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/components/videoEditor/VideoAnnotationLayer.tsx)

plus shared rendering/state helpers:

- [src/services/annotationManager.ts](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/services/annotationManager.ts)
- [src/services/canvasRenderer.ts](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/services/canvasRenderer.ts)

That is a strong sign we need one annotation engine, not two.

#### 4. Export and Auto-Polish are still too tightly coupled to editor state

[src/videoEditor/useEditorExport.ts](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/videoEditor/useEditorExport.ts) builds export payloads directly from many editor arrays and also rasterizes annotations to temporary image overlays.
[src/videoEditor/autoPolishPlan.ts](/C:/Users/Gunars/Documents/GitHub/snip-focus/src/videoEditor/autoPolishPlan.ts) is already more disciplined, but Auto-Polish still has special-case restrictions such as mixed image-clip timelines.

## Best open-source patterns to borrow

These are the strongest MIT references for our exact needs.

### Timeline and trim

- [pansyjs/video-editing-timeline](https://github.com/pansyjs/video-editing-timeline)
  Why it matters:
  canvas-based timeline, React package support, very small footprint

- [limistah/react-video-trimmer](https://github.com/limistah/react-video-trimmer)
  Why it matters:
  trim-first workflow, small control surface, simple ffmpeg loading model

### Overlay and canvas interaction

- [konvajs/react-konva](https://github.com/konvajs/react-konva)
  Why it matters:
  declarative React bindings for complex canvas graphics and transforms

### Annotation UX

- [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw)
  Why it matters:
  mature annotation interaction model, selection/transform/undo behavior, image support, export support

### Export pipeline and composition

- [drawcall/FFCreatorLite](https://github.com/drawcall/FFCreatorLite)
  Why it matters:
  simple scene-based composition over FFmpeg, supports pictures, video, text, audio, and transitions

### Auto-edit workflow

- [OpenNewsLabs/autoEdit_2](https://github.com/OpenNewsLabs/autoEdit_2)
  Why it matters:
  edit-decision style workflow, simplified editing logic, Electron desktop app focused on faster editing decisions

## Area 1: Pictures in timeline and pictures over video

### Keep

- Image clip row under video
- Ability to place an image between video parts so only the image is visible
- Ability to place an image over the video as an overlay
- Ability to export both behaviors

### Replace

- Custom cross-array shifting as the long-term source of truth
- Separate ad hoc timing behavior for clip mode vs overlay mode
- Preview-only positioning logic that differs from export logic

### Best open-source mix

- Timeline structure from `video-editing-timeline`
- Preview transform behavior from `react-konva`
- Export scene thinking from `FFCreatorLite`

### Recommendation

Move to one normalized visual item schema for all timeline-bound media:

```ts
type VisualItem =
  | { id: string; kind: 'video'; startTime: number; duration: number; sourceStart: number }
  | { id: string; kind: 'image_clip'; startTime: number; duration: number; file: string }
  | { id: string; kind: 'overlay_image'; startTime: number; duration: number; file: string; x: number; y: number; width: number; height: number }
  | { id: string; kind: 'text'; startTime: number; duration: number; ... }
  | { id: string; kind: 'annotation'; startTime: number; duration?: number; ... };
```

This does not mean one UI track.
It means one shared timing model behind the UI.

### Low-risk migration

1. Keep the current rows in the UI.
2. Introduce one internal `VisualItem` list behind adapters.
3. Make image clip insert/delete operate on the unified item list first.
4. Generate `segments`, `imageClips`, and `overlayImages` views from that shared source temporarily.
5. After the new model is stable, delete the old manual shifting helpers.

### Why this helps

- inserting an image becomes one timeline operation
- deleting an image becomes one timeline operation
- export reads one scene description instead of rebuilding meaning from several arrays
- preview and export stop disagreeing about what exists on screen

## Area 2: Pin and overlay behavior on preview and timeline

### Keep

- Images can be placed over the video
- Users can drag and resize overlays
- Timeline still shows when overlays appear
- Existing ageofscreen layout can stay mostly intact

### Replace

- DOM-heavy overlay interaction
- custom pointer math spread across preview code
- separate positioning logic for each overlay type

### Best open-source mix

- Interaction primitives from `react-konva`
- Timeline row behavior from `video-editing-timeline`
- Export scene mapping from `FFCreatorLite`

### Recommendation

Inference from the open-source sources:
the cleanest way to preserve our UI while reducing bugs is to move interactive overlay transforms onto a single canvas scene layer.

That means:

- video stays as the media surface
- overlay selection boxes, drag handles, and resize handles live in one canvas scene
- overlay positions are always stored in normalized coordinates
- timeline only edits `startTime` and `duration`
- preview only edits geometry

### Suggested data model change

Add a stable anchor concept for every overlay:

```ts
type OverlayPlacement = {
  x: number;        // 0..1
  y: number;        // 0..1
  width: number;    // 0..1
  height: number;   // 0..1
  anchor: 'content';
};
```

Do not keep mixing pixel-based preview edits with percent-based export conversion late in the pipeline.
Normalize immediately on edit.

### Expected win

- fewer coordinate bugs
- less resize jitter
- easier crop-aware behavior
- easier fullscreen-vs-overlay mode switching

## Area 3: Annotation tools need to be more user-friendly

### Keep

- Drawing on top of the video
- Timed annotations
- Simple tools like pen, arrow, rectangle, step, text
- Undo/redo and delete

### Replace

- Two annotation systems
- custom interaction logic duplicated in multiple places
- annotation export as many individual rasterized items when one grouped scene would be enough

### Best open-source mix

- Interaction and object-model ideas from `excalidraw`
- Canvas scene interaction from `react-konva`

### Recommendation

Do not import the full Excalidraw UI.
Instead, copy the parts of its workflow that make annotation feel obvious:

- single selection model
- consistent bounding boxes
- clear transform handles
- stable undo/redo
- one object model for pen, arrow, shape, text, step

Then keep our own small ageofscreen toolbar and styling.

### Concrete simplification path

1. Choose one annotation surface:
   use the video editor annotation layer as the future path
2. Migrate all annotation object editing to one model
3. Keep rendering and hit-testing together
4. Remove the older generic annotation canvas after parity is reached

### Export recommendation

Instead of converting each annotation independently during export, group active annotations by time slice and rasterize one composite overlay image per slice.

That keeps export simple while preserving the same visible result.

## Area 4: Auto-Polish must stay simple and export-safe

### Keep

- One-click Auto-Polish
- Deterministic behavior
- Clean summary of what changed
- Local processing only

### Replace

- Editor-state-heavy application flow
- mixed responsibility between "analysis", "edit decisions", and "export rendering"
- hard special cases that make Auto-Polish fragile on richer timelines

### Best open-source mix

- Workflow shape from `autoEdit_2`
- Composition discipline from `FFCreatorLite`
- Keep our own cursor/focus logic where it is already product-specific

### Recommendation

Turn Auto-Polish into a clean two-step pipeline:

1. `analyze -> produce edit decision list`
2. `apply -> preview and export using the same decision list`

The decision list should contain only:

- keep ranges
- generated focus effects
- chosen clean preset values
- voice enhancement choice

It should not directly mutate random editor state while analysis is still being computed.

### Important product rule

Auto-Polish should not become a giant AI system.
It should remain a conservative deterministic assistant.
That matches the pivot.

### Phase handling for image clips

Low-risk approach:

1. Phase 1:
   keep Auto-Polish video-first, but make the limitation explicit and safe
2. Phase 2:
   support mixed timelines by only applying keep-ranges to video items and preserving image clips by timeline position

That is safer than trying to solve every mixed-media case in one refactor.

## Recommended implementation order

### Step 1

Create a unified scene/timeline schema behind adapters.

Why first:
without this, every other feature keeps duplicating timing logic.

### Step 2

Move overlay interaction to one canvas scene layer.

Why second:
this should remove a lot of preview jitter and geometry bugs without changing the UI much.

### Step 3

Unify annotation on top of that same scene model.

Why third:
annotations then stop being a special subsystem.

### Step 4

Make Auto-Polish emit and apply a clean edit decision list.

Why fourth:
it becomes easier once timeline items and export inputs are normalized.

## What we should not copy

- Do not adopt Excalidraw's full product UI
- Do not adopt a feature-maximal timeline editor
- Do not add more transitions just because `FFCreatorLite` supports them
- Do not make overlay editing more advanced than users need
- Do not rebuild everything at once

## Best practical choices for ageofscreen

If we want the lowest-risk set of ideas to implement, the best combination is:

- `video-editing-timeline` for lighter timeline rendering ideas
- `react-konva` for overlay and annotation interaction
- `excalidraw` for annotation UX behavior
- `FFCreatorLite` for scene-based export thinking
- `autoEdit_2` for simplified edit-decision workflow

## Sources

- [pansyjs/video-editing-timeline](https://github.com/pansyjs/video-editing-timeline)
- [limistah/react-video-trimmer](https://github.com/limistah/react-video-trimmer)
- [konvajs/react-konva](https://github.com/konvajs/react-konva)
- [excalidraw/excalidraw](https://github.com/excalidraw/excalidraw)
- [drawcall/FFCreatorLite](https://github.com/drawcall/FFCreatorLite)
- [OpenNewsLabs/autoEdit_2](https://github.com/OpenNewsLabs/autoEdit_2)
