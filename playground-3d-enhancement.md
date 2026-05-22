# Playground 3D Enhancement & Entity Interaction

## Goal
Transform the Screen Playground into a high-fidelity 3D experience where screenshot elements (icons, text) become interactive physical objects.

## Tasks
- [ ] **Task 1: Transition to Unified WebGL Scene** → Replace the hybrid Canvas/WebGL renderer with a single, high-performance Three.js scene for better lighting and performance.
- [ ] **Task 2: Implement "Entity Extraction" Logic** → Add a function to `engine.ts` that samples the screenshot around an impact to detect "islands" of content (icons/text) and extracts them as textures.
- [ ] **Task 3: Create 3D Physics Engine (Lite)** → Implement a simple 3D physics solver for entities (gravity, floor collision, momentum) to make them bounce and tumble realistically.
- [ ] **Task 4: Procedural 3D Creatures** → Replace the 2D Skeleton with procedurally generated 3D models (using Three.js primitives) with smooth IK-based (Inverse Kinematics) animations.
- [ ] **Task 5: Realistic Impact Effects** → Update Hammer, Laser, and Burn tools to produce 3D particles and lighting that interacts with the extracted entities.
- [ ] **Task 6: Performance Optimization (Offline Focus)** → Ensure all textures and shaders are generated or loaded locally; implement instanced rendering for high particle counts.

## Done When
- [ ] Clicking an icon on the screenshot causes it to "pop out" or shatter into 3D pieces that interact with the floor.
- [ ] Creatures (Skeleton) have smooth 3D motions and realistic walking cycles.
- [ ] The Hammer tool has realistic swing physics and impact feedback.
- [ ] The entire experience runs at a consistent 60fps offline.

## Notes
- We will use a simple "island detection" (connected-component labeling) on a downsampled version of the screenshot to identify icons/folders without needing heavy OCR.
- The Scandi-minimalist style will be maintained through clean lighting (rim lights) and a neutral palette for procedural models.
