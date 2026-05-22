import assert from 'node:assert/strict';
import { DEFAULT_ZOOM_INTENSITY, getDefaultEffectIntensity, getEffectIntensity } from '../src/videoEditor/effectIntensity';
import { computeZoomCropStartOffset } from '../src/videoEditor/effectMath';
import { buildFfmpegEffectEnvelopeExpr } from '../src/videoEditor/ffmpegExpressions';
import { getPreviewOverlayFrameSize, getRenderedVideoFrameSize, resolveExportFrameStyle, resolveExportOutputFrameSize, resolveRenderExportFrameStyle, scaleTextOverlayForExport } from '../src/videoEditor/exportOverlayMath';
import { getPreviewCropForDisplay, isNoOpCrop, normalizeAppliedCrop } from '../src/videoEditor/useCrop';
import { run } from './run';

run('export overlay helpers scale text styling into the real render frame', () => {
    assert.deepEqual(
        getRenderedVideoFrameSize({ width: 1920, height: 1080 }, { x: 10, y: 5, width: 50, height: 50 }),
        { width: 960, height: 540 },
    );
    assert.deepEqual(
        getPreviewOverlayFrameSize(
            { width: 1440, height: 810 },
            { width: 1600, height: 900 },
            { x: 10, y: 5, width: 50, height: 50 },
        ),
        { width: 1600, height: 900 },
    );

    const scaled = scaleTextOverlayForExport({
        id: 'text-1',
        text: 'Hello',
        startTime: 0,
        duration: 3,
        x: 50,
        y: 50,
        fontSize: 24,
        color: '#ffffff',
        padding: 10,
        borderWidth: 2,
        shadowOffsetX: 3,
        shadowOffsetY: 4,
    }, { width: 960, height: 540 }, { width: 1920, height: 1080 });

    assert.equal(scaled.fontSize, 48);
    assert.equal(scaled.padding, 20);
    assert.equal(scaled.borderWidth, 4);
    assert.equal(scaled.shadowOffsetX, 6);
    assert.equal(scaled.shadowOffsetY, 8);
});

run('original export stays edge-to-edge only when no framing was requested', () => {
    assert.deepEqual(
        resolveExportFrameStyle({
            selectedPlatform: 'original',
            backgroundColor: '#000000',
            videoPadding: 18,
        }),
        { backgroundColor: '#000000', videoPadding: 18 },
    );

    assert.deepEqual(
        resolveExportFrameStyle({
            selectedPlatform: 'original',
            backgroundColor: '#0f172a',
            videoPadding: 18,
        }),
        { backgroundColor: '#0f172a', videoPadding: 18 },
    );

    assert.deepEqual(
        resolveExportFrameStyle({
            selectedPlatform: 'vertical',
            backgroundColor: '#000000',
            videoPadding: 4,
        }),
        { backgroundColor: '#000000', videoPadding: 4 },
    );
});

run('render export collapses the untouched original default frame but preserves intentional styling', () => {
    assert.deepEqual(
        resolveRenderExportFrameStyle({
            selectedPlatform: 'original',
            backgroundColor: '#000000',
            videoPadding: 4,
        }),
        { backgroundColor: 'transparent', videoPadding: 0 },
    );

    assert.deepEqual(
        resolveRenderExportFrameStyle({
            selectedPlatform: 'original',
            backgroundColor: '#0f172a',
            videoPadding: 2,
        }),
        { backgroundColor: 'transparent', videoPadding: 0 },
    );

    assert.deepEqual(
        resolveRenderExportFrameStyle({
            selectedPlatform: 'original',
            backgroundColor: '#ff6600',
            videoPadding: 4,
        }),
        { backgroundColor: '#ff6600', videoPadding: 4 },
    );

    assert.deepEqual(
        resolveRenderExportFrameStyle({
            selectedPlatform: 'original',
            backgroundColor: '#000000',
            videoPadding: 12,
        }),
        { backgroundColor: '#000000', videoPadding: 12 },
    );
});

run('export output frame size follows the selected platform preset', () => {
    assert.deepEqual(
        resolveExportOutputFrameSize({
            selectedPlatform: 'vertical',
            sourceFrameSize: { width: 1920, height: 1080 },
        }),
        { width: 1080, height: 1920 },
    );

    assert.deepEqual(
        resolveExportOutputFrameSize({
            selectedPlatform: 'square',
            sourceFrameSize: { width: 1280, height: 720 },
        }),
        { width: 1080, height: 1080 },
    );

    assert.deepEqual(
        resolveExportOutputFrameSize({
            selectedPlatform: 'original',
            sourceFrameSize: { width: 1280, height: 720 },
        }),
        { width: 1280, height: 720 },
    );
});

run('zoom effects use the shared lighter default intensity', () => {
    assert.equal(DEFAULT_ZOOM_INTENSITY, 15);
    assert.equal(getDefaultEffectIntensity('zoom'), 15);
    assert.equal(getDefaultEffectIntensity('slow_zoom'), 15);
    assert.equal(getDefaultEffectIntensity('blur_area'), 100);
    assert.equal(getEffectIntensity({ type: 'zoom', intensity: undefined } as any), 15);
    assert.equal(getEffectIntensity({ type: 'slow_zoom', intensity: undefined } as any), 15);
    assert.equal(getEffectIntensity({ type: 'zoom', intensity: 48 } as any), 48);
});

run('zoom crop math preserves off-center focus before centering blend', () => {
    const centered = computeZoomCropStartOffset(240, 200, 0.5, 0);
    const leftBiased = computeZoomCropStartOffset(240, 200, 0.1, 0);
    const rightBiased = computeZoomCropStartOffset(240, 200, 0.9, 0);
    const fullyCentered = computeZoomCropStartOffset(240, 200, 0.9, 1);

    assert.equal(centered, 20);
    assert.equal(leftBiased, 4);
    assert.equal(rightBiased, 36);
    assert.equal(fullyCentered, 116);
});

run('ffmpeg effect envelope stays valid for slow zoom export expressions', () => {
    const progress = 'max(0\\,min(1\\,(t-0.000)/4.000))';
    const envelope = buildFfmpegEffectEnvelopeExpr(progress, 0.32);

    assert.equal(envelope.includes('\\,1)\\,1)'), false);
    assert.equal(envelope.includes('undefined'), false);

    let depth = 0;
    for (const char of envelope) {
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        assert.ok(depth >= 0);
    }
    assert.equal(depth, 0);
});

run('crop preview reopens on the uncropped source frame', () => {
    const appliedCrop = { x: 58, y: 4, width: 34, height: 76 };

    assert.equal(getPreviewCropForDisplay(true, appliedCrop), null);
    assert.deepEqual(getPreviewCropForDisplay(false, appliedCrop), appliedCrop);
});

run('no-op crop helper clears near-full selections', () => {
    assert.equal(isNoOpCrop(null), true);
    assert.equal(isNoOpCrop({ x: 0.2, y: 0.4, width: 99.4, height: 99.1 }), true);
    assert.equal(isNoOpCrop({ x: 0.8, y: 0.4, width: 99.4, height: 99.1 }), false);
    assert.equal(normalizeAppliedCrop({ x: 0.2, y: 0.4, width: 99.4, height: 99.1 }), null);
    assert.deepEqual(normalizeAppliedCrop({ x: 12, y: 8, width: 60, height: 72 }), { x: 12, y: 8, width: 60, height: 72 });
});
