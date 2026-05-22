import assert from 'node:assert/strict';
import { remapExportCursorTrack, resolvePremiumVoiceEnabled } from '../src/videoEditor/useEditorExport';
import { run } from './run';

run('premium voice export stays disabled unless the entitlement allows it', () => {
    assert.equal(resolvePremiumVoiceEnabled(false, { canUseStudioVoice: false }), false);
    assert.equal(resolvePremiumVoiceEnabled(true, { canUseStudioVoice: false }), false);
    assert.equal(resolvePremiumVoiceEnabled(true, { canUseStudioVoice: true }), true);
});

run('cursor track remap deduplicates points that collapse onto the same export timestamp', () => {
    const remapped = remapExportCursorTrack([
        { time: 0, x: 0.1, y: 0.2 },
        { time: 0.001, x: 0.1, y: 0.2 },
        { time: 1.2, x: 0.4, y: 0.5 },
    ], (time) => (time < 0.01 ? 0 : time - 0.2));

    assert.deepEqual(remapped, [
        { time: 0, x: 0.1, y: 0.2 },
        { time: 1, x: 0.4, y: 0.5 },
    ]);
});
