import assert from 'node:assert/strict';
import { createCreature, createImpact, createParticlesForTool, stepCreatures, stepParticles } from '../src/playground/engine';
import { run } from './run';

run('screen playground creates bounded impact events for each tool', () => {
    for (const tool of ['hammer', 'burn', 'scatter', 'glyph', 'skeleton', 'spider', 'laser', 'throw', 'monster'] as const) {
        const impact = createImpact(tool, 120, 240);
        assert.equal(impact.tool, tool);
        assert.equal(impact.x, 120);
        assert.equal(impact.y, 240);
        assert.ok(impact.radius > 0);
        assert.ok(impact.id.startsWith('impact-'));
    }
});

run('screen playground creatures move and stay bounded', () => {
    const creatures = [
        createCreature('skeleton', 400, 220),
        createCreature('spider', 250, 160),
    ];
    const next = stepCreatures(creatures, 500, 300);
    assert.equal(next.length, creatures.length);
    assert.ok(next.every((creature) => creature.x >= 0 && creature.x <= 500));
    assert.ok(next.every((creature) => creature.y >= 0 && creature.y <= 300));
    assert.ok(next.some((creature, index) => creature.x !== creatures[index].x || creature.y !== creatures[index].y));
});

run('screen playground spiders roam across the playfield', () => {
    let spider = {
        ...createCreature('spider', 80, 80),
        x: 80,
        y: 80,
        vx: 1.4,
        vy: 0,
        size: 48,
        roamTargetX: 420,
        roamTargetY: 240,
        roamCooldown: 220,
    };

    for (let frame = 0; frame < 70; frame += 1) {
        [spider] = stepCreatures([spider], 500, 300);
    }

    assert.ok(Math.hypot(spider.x - 80, spider.y - 80) > 80);
    assert.ok(spider.x >= 0 && spider.x <= 500);
    assert.ok(spider.y >= 0 && spider.y <= 300);
});



run('screen playground skeleton can enter and finish rib dance state', () => {
    const skeleton = {
        ...createCreature('skeleton', 260, 190),
        ribDance: 2,
        ribDanceCooldown: 2,
    };
    const [dancing] = stepCreatures([skeleton], 500, 300);
    assert.equal(dancing.kind, 'skeleton');
    assert.equal(dancing.ribDance, 1);

    const [released] = stepCreatures([dancing], 500, 300);
    assert.equal(released.ribDance, undefined);
    assert.ok((released.ribDanceCooldown ?? 0) > 2);
});

run('screen playground creatures bump and separate from each other', () => {
    const skelA = {
        ...createCreature('skeleton', 250, 160),
        x: 250,
        y: 160,
        vx: 0.2,
        vy: 0,
        size: 42,
    };
    const skelB = {
        ...createCreature('skeleton', 254, 160),
        x: 254,
        y: 160,
        vx: -0.2,
        vy: 0,
        size: 42,
    };
    const [nextA, nextB] = stepCreatures([skelA, skelB], 500, 300);
    assert.ok(Math.hypot(nextA.x - nextB.x, nextA.y - nextB.y) > Math.hypot(skelA.x - skelB.x, skelA.y - skelB.y));
    assert.ok((nextA.bumpReact ?? 0) > 0);
    assert.ok((nextB.bumpReact ?? 0) > 0);
    assert.ok(nextA.vx < skelA.vx);
    assert.ok(nextB.vx > skelB.vx);
});

run('screen playground particle systems decay over time', () => {
    const particles = createParticlesForTool('glyph', 100, 100);
    assert.ok(particles.length > 0);
    assert.ok(particles.some((particle) => particle.glyph));

    const next = stepParticles(particles);
    assert.equal(next.length, particles.length);
    assert.ok(next.every((particle, index) => particle.life < particles[index].life));
});

run('screen playground shot emits arrow sparks instead of pixels', () => {
    const particles = createParticlesForTool('scatter', 180, 120, undefined, 0);
    assert.ok(particles.length > 0);
    assert.ok(particles.every((particle) => particle.shape === 'spark'));
});

run('screen playground laser bypasses generic particle spray', () => {
    const particles = createParticlesForTool('laser', 180, 120, undefined, 0);
    assert.equal(particles.length, 0);
});

run('screen playground slinger bypasses generic sticky particles', () => {
    const particles = createParticlesForTool('throw', 180, 120, '#ef4444', 0);
    assert.equal(particles.length, 0);
});

run('screen playground monster places without particle spray', () => {
    const particles = createParticlesForTool('monster', 180, 120, undefined, 0);
    assert.equal(particles.length, 0);
});
