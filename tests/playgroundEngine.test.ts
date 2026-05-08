import assert from 'node:assert/strict';
import { createImpact, createParticlesForTool, stepParticles } from '../src/playground/engine';
import { run } from './run';

run('screen playground creates bounded impact events for each tool', () => {
    for (const tool of ['hammer', 'burn', 'scatter', 'glyph'] as const) {
        const impact = createImpact(tool, 120, 240);
        assert.equal(impact.tool, tool);
        assert.equal(impact.x, 120);
        assert.equal(impact.y, 240);
        assert.ok(impact.radius > 0);
        assert.ok(impact.id.startsWith('impact-'));
    }
});

run('screen playground particle systems decay over time', () => {
    const particles = createParticlesForTool('glyph', 100, 100);
    assert.ok(particles.length > 0);
    assert.ok(particles.some((particle) => particle.glyph));

    const next = stepParticles(particles);
    assert.equal(next.length, particles.length);
    assert.ok(next.every((particle, index) => particle.life < particles[index].life));
});
