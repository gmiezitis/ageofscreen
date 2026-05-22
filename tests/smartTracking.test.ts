import assert from 'node:assert/strict';
import { buildSmartTrackingEffects } from '../src/videoEditor/smartTracking';
import { run } from './run';

run('smart tracking emits focus zooms from move-only Store metadata', () => {
    const events = [
        { type: 'meta', t: 0, x: 0, y: 0, bounds: { x: 0, y: 0, width: 1000, height: 800 } },
        { type: 'move', t: 0, x: 420, y: 280 },
        { type: 'move', t: 220, x: 424, y: 282 },
        { type: 'move', t: 440, x: 427, y: 283 },
        { type: 'move', t: 660, x: 425, y: 281 },
        { type: 'move', t: 880, x: 426, y: 284 },
        { type: 'move', t: 1100, x: 428, y: 282 },
        { type: 'move', t: 1320, x: 430, y: 283 },
        { type: 'move', t: 1540, x: 429, y: 282 },
    ] as any[];

    const effects = buildSmartTrackingEffects(events, { durationHint: 6, profile: 'smooth_focus' });
    const zoom = effects.find((effect) => effect.type === 'zoom');
    const exposure = effects.find((effect) => effect.type === 'exposure');

    assert.ok(zoom);
    assert.equal(zoom?.label, 'SMART FOCUS');
    assert.ok(exposure);
});
