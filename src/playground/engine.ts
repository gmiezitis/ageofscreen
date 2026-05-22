export type PlaygroundToolId = "hammer" | "burn" | "scatter" | "glyph" | "skeleton" | "spider" | "laser" | "throw" | "monster";
export type CreatureKind = "skeleton" | "spider";

export type Impact = {
    id: string;
    tool: PlaygroundToolId;
    x: number;
    y: number;
    radius: number;
    rotation: number;
    createdAt: number;
    seed: number;
};

export type Particle = {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    color: string;
    glyph?: string;
    spin: number;
    shape?: "dust" | "ember" | "pixel" | "spark";
};

export type Creature = {
    id: string;
    kind: CreatureKind;
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: number;
    phase: number;
    seed: number;
    ribDance?: number;
    ribDanceCooldown?: number;
    bumpReact?: number;
    isMerged?: boolean;
    mergeScale?: number;
    dartSpeed?: number;
    heading?: number;
    damage?: number;
    webCooldown?: number;
    isExploded?: boolean;
    explodeTime?: number;
    roamTargetX?: number;
    roamTargetY?: number;
    roamCooldown?: number;
};

export type PlaygroundState = {
    impacts: Impact[];
    particles: Particle[];
    creatures: Creature[];
};

const GLYPHS = ["A", "G", "E", "S"];
const ICON_GLYPHS = ["*", "+", "#", "@", "%"];

const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min);
const makeId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
const makeSeed = (): number => Math.floor(Math.random() * 2147483646) + 1;

const seededRandom = (seed: number): (() => number) => {
    let state = seed % 2147483647;
    return () => {
        state = (state * 16807) % 2147483647;
        return (state - 1) / 2147483646;
    };
};

const seededBetween = (next: () => number, min: number, max: number): number => min + next() * (max - min);

const angleDelta = (target: number, current: number): number => Math.atan2(Math.sin(target - current), Math.cos(target - current));

const particle = (
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    size: number,
    maxLife: number,
    glyph?: string,
    shape: Particle["shape"] = "pixel",
): Particle => ({
    id: makeId("p"),
    x,
    y,
    vx,
    vy,
    color,
    size,
    life: maxLife,
    maxLife,
    glyph,
    spin: randomBetween(-0.12, 0.12),
    shape,
});

export const createImpact = (tool: PlaygroundToolId, x: number, y: number): Impact => ({
    id: makeId("impact"),
    tool,
    x,
    y,
    radius: tool === "scatter" ? randomBetween(34, 58) : tool === "burn" ? randomBetween(38, 66) : tool === "laser" ? randomBetween(70, 120) : tool === "throw" ? randomBetween(44, 74) : tool === "monster" ? randomBetween(68, 104) : randomBetween(42, 76),
    rotation: randomBetween(0, Math.PI * 2),
    createdAt: performance.now(),
    seed: makeSeed(),
});

export const createCreature = (kind: CreatureKind, x: number, y: number): Creature => {
    const direction = randomBetween(0, Math.PI * 2);
    const speed = kind === "skeleton"
        ? randomBetween(0.24, 0.5)
        : randomBetween(1.28, 1.74);
    return {
        id: makeId(kind),
        kind,
        x,
        y,
        vx: Math.cos(direction) * speed,
        vy: Math.sin(direction) * speed,
        size: kind === "skeleton" ? randomBetween(132, 162) : randomBetween(46, 62),
        phase: randomBetween(0, Math.PI * 2),
        seed: makeSeed(),
        ribDanceCooldown: kind === "skeleton" ? randomBetween(780, 1900) : undefined,
        dartSpeed: kind === "spider" ? randomBetween(1.04, 1.22) : undefined,
        heading: kind === "spider" ? direction : undefined,
        webCooldown: kind === "spider" ? randomBetween(420, 1180) : undefined,
        roamCooldown: kind === "spider" ? randomBetween(40, 140) : undefined,
    };
};

const creatureCollisionRadius = (creature: Creature): number => creature.size * (creature.kind === "skeleton" ? 0.62 : 0.44);

const creatureMargin = (creature: Creature): number => creature.size * (creature.kind === "skeleton" ? 0.98 : 0.82);

const resolveCreatureCollisions = (creatures: Creature[], width: number, height: number): Creature[] => {
    const next = creatures.map((creature) => ({ ...creature }));

    for (let a = 0; a < next.length; a += 1) {
        for (let b = a + 1; b < next.length; b += 1) {
            const first = next[a];
            const second = next[b];
            const dx = second.x - first.x;
            const dy = second.y - first.y;
            const distance = Math.max(0.001, Math.hypot(dx, dy));
            const minDistance = creatureCollisionRadius(first) + creatureCollisionRadius(second);
            if (distance >= minDistance) continue;

            const canMergeSkeletons = first.kind === "skeleton"
                && second.kind === "skeleton"
                && !first.isMerged
                && !second.isMerged
                && Math.min(first.size, second.size) >= 96
                && distance < minDistance * 0.52;

            if (canMergeSkeletons) {
                // Merge Logic: Larger or first skeleton absorbs the other
                const absorber = first.size >= second.size ? first : second;
                const absorbed = absorber === first ? second : first;
                
                // Cap size at 240 for performance/visibility
                const oldSize = absorber.size;
                absorber.size = Math.min(240, absorber.size + absorbed.size * 0.35);
                // juicy scale pop effect
                absorber.mergeScale = (absorber.size / oldSize) * 1.15;
                absorber.vx *= 0.5; // slow down on merge
                absorber.vy *= 0.5;
                
                absorbed.isMerged = true;
                continue; // Skip further collision resolution for these two
            }

            const nx = dx / distance;
            const ny = dy / distance;
            const overlap = minDistance - distance;
            const firstMass = 1.4;
            const secondMass = 1.4;
            const massTotal = firstMass + secondMass;
            const firstPush = overlap * (secondMass / massTotal);
            const secondPush = overlap * (firstMass / massTotal);
            const firstMargin = creatureMargin(first);
            const secondMargin = creatureMargin(second);

            first.x = Math.max(firstMargin, Math.min(width - firstMargin, first.x - nx * firstPush));
            first.y = Math.max(firstMargin, Math.min(height - firstMargin, first.y - ny * firstPush));
            second.x = Math.max(secondMargin, Math.min(width - secondMargin, second.x + nx * secondPush));
            second.y = Math.max(secondMargin, Math.min(height - secondMargin, second.y + ny * secondPush));

            const relVx = second.vx - first.vx;
            const relVy = second.vy - first.vy;
            const closingSpeed = relVx * nx + relVy * ny;
            const bounce = Math.max(0.32, Math.min(1.25, Math.abs(closingSpeed) * 0.55 + 0.24));
            first.vx = (first.vx - nx * bounce) * 0.94;
            first.vy = (first.vy - ny * bounce) * 0.94;
            second.vx = (second.vx + nx * bounce) * 0.94;
            second.vy = (second.vy + ny * bounce) * 0.94;

            first.bumpReact = Math.max(first.bumpReact ?? 0, 34);
            second.bumpReact = Math.max(second.bumpReact ?? 0, 34);
            if (first.kind === "skeleton" && !(first.ribDance ?? 0)) first.ribDanceCooldown = Math.min(first.ribDanceCooldown ?? 900, 220);
            if (second.kind === "skeleton" && !(second.ribDance ?? 0)) second.ribDanceCooldown = Math.min(second.ribDanceCooldown ?? 900, 220);
        }
    }

    return next.filter(c => !c.isMerged);
};

const pickSpiderRoamTarget = (
    creature: Creature,
    margin: number,
    width: number,
    height: number,
): { targetX: number; targetY: number; cooldown: number } => {
    const targetX = creature.roamTargetX ?? creature.x;
    const targetY = creature.roamTargetY ?? creature.y;
    const distance = Math.hypot(targetX - creature.x, targetY - creature.y);
    const cooldown = Math.max(0, (creature.roamCooldown ?? 0) - 1);
    const needsTarget = distance < creature.size * 1.8 || cooldown <= 0 || Math.random() < 0.006;

    if (!needsTarget) {
        return { targetX, targetY, cooldown };
    }

    return {
        targetX: randomBetween(margin, Math.max(margin, width - margin)),
        targetY: randomBetween(margin, Math.max(margin, height - margin)),
        cooldown: randomBetween(90, 260),
    };
};

export const stepCreatures = (creatures: Creature[], width: number, height: number): Creature[] => {
    const stepped = creatures.map((creature) => {
        const margin = creatureMargin(creature);
        let vx = creature.vx;
        let vy = creature.vy;
        let x = creature.x + vx;
        let y = creature.y + vy;
        const bumpReact = Math.max(0, (creature.bumpReact ?? 0) - 1);

        if (x < margin || x > width - margin) {
            vx *= -1;
            x = Math.max(margin, Math.min(width - margin, x));
        }

        if (y < margin || y > height - margin) {
            vy *= -1;
            y = Math.max(margin, Math.min(height - margin, y));
        }

        const wander = Math.sin(creature.phase * 0.37 + creature.seed) * 0.012;
        const cos = Math.cos(wander);
        const sin = Math.sin(wander);
        const nextVx = (vx * cos) - (vy * sin);
        const nextVy = (vx * sin) + (vy * cos);



        if (creature.kind === "skeleton") {
            const activeDance = Math.max(0, creature.ribDance ?? 0);
            if (activeDance > 0) {
                const remaining = activeDance - 1;
                const shimmy = Math.sin(creature.phase * 1.35 + creature.seed) * 0.04;
                const danceCos = Math.cos(shimmy);
                const danceSin = Math.sin(shimmy);
                const danceVx = ((nextVx * danceCos) - (nextVy * danceSin)) * 0.42;
                const danceVy = ((nextVx * danceSin) + (nextVy * danceCos)) * 0.42;

                return {
                    ...creature,
                    x,
                    y,
                    vx: remaining > 0 ? danceVx : nextVx || randomBetween(-0.5, 0.5),
                    vy: remaining > 0 ? danceVy : nextVy || randomBetween(-0.5, 0.5),
                    phase: creature.phase + 0.32,
                    ribDance: remaining > 0 ? remaining : undefined,
                    ribDanceCooldown: remaining > 0 ? creature.ribDanceCooldown : randomBetween(1200, 3000),
                    bumpReact,
                };
            }

            const cooldown = Math.max(0, (creature.ribDanceCooldown ?? randomBetween(780, 1900)) - 1);
            if (cooldown <= 0 && Math.random() < 0.0032) {
                return {
                    ...creature,
                    x,
                    y,
                    vx: nextVx * 0.36,
                    vy: nextVy * 0.36,
                    phase: creature.phase + 0.26,
                    ribDance: 260,
                    ribDanceCooldown: 260,
                    bumpReact,
                };
            }

            return {
                ...creature,
                x,
                y,
                vx: nextVx,
                vy: nextVy,
                phase: creature.phase + 0.12,
                ribDanceCooldown: cooldown,
                bumpReact,
            };
        }

        if (creature.kind === "spider") {
            const roam = pickSpiderRoamTarget(creature, margin, width, height);
            const targetAngle = Math.atan2(roam.targetY - y, roam.targetX - x);
            const currentAngle = Math.atan2(nextVy, nextVx);
            const targetPull = Math.max(0.24, Math.min(0.62, Math.hypot(roam.targetX - x, roam.targetY - y) / Math.max(width, height)));
            const travelAngle = currentAngle + angleDelta(targetAngle, currentAngle) * targetPull;
            const baseSpeed = Math.max(1.08, Math.hypot(nextVx, nextVy));
            const skitter = Math.sin(creature.phase * 0.8 + creature.seed) * 0.022;
            const huntTurn = Math.sin(creature.phase * 0.126 + creature.seed * 0.011) * 0.068;
            const roamTurn = Math.sin(creature.phase * 0.043 + creature.seed * 0.019) * 0.045;
            const panicTurn = Math.random() < 0.012 ? randomBetween(-0.28, 0.28) : 0;
            const legPause = Math.sin(creature.phase * 0.22 + creature.seed * 0.17) > 0.96 ? 0.76 : 1;
            const dartPulse = Math.max(0.84, 1 + Math.sin(creature.phase * 0.46 + creature.seed) * 0.11 + (Math.random() < 0.008 ? 0.18 : 0));
            const dartSpeed = creature.dartSpeed ?? 1;
            const spiderCos = Math.cos(skitter + huntTurn + roamTurn + panicTurn);
            const spiderSin = Math.sin(skitter + huntTurn + roamTurn + panicTurn);
            const travelVx = Math.cos(travelAngle) * baseSpeed;
            const travelVy = Math.sin(travelAngle) * baseSpeed;
            let spiderVx = ((travelVx * spiderCos) - (travelVy * spiderSin)) * legPause * dartPulse * dartSpeed;
            let spiderVy = ((travelVx * spiderSin) + (travelVy * spiderCos)) * legPause * dartPulse * dartSpeed;
            const spiderSpeed = Math.hypot(spiderVx, spiderVy);
            const maxSpiderSpeed = 2.08;
            if (spiderSpeed > maxSpiderSpeed) {
                spiderVx = (spiderVx / spiderSpeed) * maxSpiderSpeed;
                spiderVy = (spiderVy / spiderSpeed) * maxSpiderSpeed;
            }
            const targetHeading = Math.hypot(spiderVx, spiderVy) > 0.03 ? Math.atan2(spiderVy, spiderVx) : creature.heading ?? creature.phase;
            const currentHeading = creature.heading ?? targetHeading;
            const mergeScale = Math.max(1, (creature.mergeScale ?? 1) - 0.01);
            return {
                ...creature,
                x,
                y,
                vx: spiderVx,
                vy: spiderVy,
                phase: creature.phase + 0.11 + dartPulse * 0.035,
                bumpReact,
                mergeScale: mergeScale > 1 ? mergeScale : undefined,
                heading: currentHeading + angleDelta(targetHeading, currentHeading) * 0.12,
                webCooldown: Math.max(0, (creature.webCooldown ?? 300) - 1),
                roamTargetX: roam.targetX,
                roamTargetY: roam.targetY,
                roamCooldown: roam.cooldown,
            };
        }

        const mergeScale = Math.max(1, (creature.mergeScale ?? 1) - 0.01);

        return {
            ...creature,
            x,
            y,
            vx: nextVx,
            vy: nextVy,
            phase: creature.phase + 0.12,
            bumpReact,
            mergeScale: mergeScale > 1 ? mergeScale : undefined,
        };
    });

    return resolveCreatureCollisions(stepped, width, height);
};

export const stepCreaturesMutable = (creatures: Creature[], width: number, height: number): Creature[] => {
    for (const creature of creatures) {
        const margin = creatureMargin(creature);
        let vx = creature.vx;
        let vy = creature.vy;
        let x = creature.x + vx;
        let y = creature.y + vy;
        creature.bumpReact = Math.max(0, (creature.bumpReact ?? 0) - 1);

        if (x < margin || x > width - margin) {
            vx *= -1;
            x = Math.max(margin, Math.min(width - margin, x));
        }

        if (y < margin || y > height - margin) {
            vy *= -1;
            y = Math.max(margin, Math.min(height - margin, y));
        }

        const wander = Math.sin(creature.phase * 0.37 + creature.seed) * 0.012;
        const cos = Math.cos(wander);
        const sin = Math.sin(wander);
        const nextVx = (vx * cos) - (vy * sin);
        const nextVy = (vx * sin) + (vy * cos);

        creature.x = x;
        creature.y = y;

        if (creature.kind === "skeleton") {
            creature.vx = nextVx;
            creature.vy = nextVy;
            creature.phase += 0.12;

            const activeDance = Math.max(0, creature.ribDance ?? 0);
            if (activeDance > 0) {
                const remaining = activeDance - 1;
                const shimmy = Math.sin(creature.phase * 1.35 + creature.seed) * 0.04;
                const danceCos = Math.cos(shimmy);
                const danceSin = Math.sin(shimmy);
                creature.vx = remaining > 0 ? ((nextVx * danceCos) - (nextVy * danceSin)) * 0.42 : nextVx || randomBetween(-0.5, 0.5);
                creature.vy = remaining > 0 ? ((nextVx * danceSin) + (nextVy * danceCos)) * 0.42 : nextVy || randomBetween(-0.5, 0.5);
                creature.phase += 0.2;
                creature.ribDance = remaining > 0 ? remaining : undefined;
                creature.ribDanceCooldown = remaining > 0 ? creature.ribDanceCooldown : randomBetween(1200, 3000);
                continue;
            }

            const cooldown = Math.max(0, (creature.ribDanceCooldown ?? randomBetween(780, 1900)) - 1);
            if (cooldown <= 0 && Math.random() < 0.0032) {
                creature.vx = nextVx * 0.36;
                creature.vy = nextVy * 0.36;
                creature.phase += 0.14;
                creature.ribDance = 260;
                creature.ribDanceCooldown = 260;
            } else {
                creature.ribDanceCooldown = cooldown;
            }
        } else {
            const roam = pickSpiderRoamTarget(creature, margin, width, height);
            const targetAngle = Math.atan2(roam.targetY - y, roam.targetX - x);
            const currentAngle = Math.atan2(nextVy, nextVx);
            const targetPull = Math.max(0.24, Math.min(0.62, Math.hypot(roam.targetX - x, roam.targetY - y) / Math.max(width, height)));
            const travelAngle = currentAngle + angleDelta(targetAngle, currentAngle) * targetPull;
            const baseSpeed = Math.max(1.08, Math.hypot(nextVx, nextVy));
            const skitter = Math.sin(creature.phase * 0.8 + creature.seed) * 0.022;
            const huntTurn = Math.sin(creature.phase * 0.126 + creature.seed * 0.011) * 0.068;
            const roamTurn = Math.sin(creature.phase * 0.043 + creature.seed * 0.019) * 0.045;
            const panicTurn = Math.random() < 0.012 ? randomBetween(-0.28, 0.28) : 0;
            const legPause = Math.sin(creature.phase * 0.22 + creature.seed * 0.17) > 0.96 ? 0.76 : 1;
            const dartPulse = Math.max(0.84, 1 + Math.sin(creature.phase * 0.46 + creature.seed) * 0.11 + (Math.random() < 0.008 ? 0.18 : 0));
            const dartSpeed = creature.dartSpeed ?? 1;
            const spiderCos = Math.cos(skitter + huntTurn + roamTurn + panicTurn);
            const spiderSin = Math.sin(skitter + huntTurn + roamTurn + panicTurn);
            const travelVx = Math.cos(travelAngle) * baseSpeed;
            const travelVy = Math.sin(travelAngle) * baseSpeed;
            creature.vx = ((travelVx * spiderCos) - (travelVy * spiderSin)) * legPause * dartPulse * dartSpeed;
            creature.vy = ((travelVx * spiderSin) + (travelVy * spiderCos)) * legPause * dartPulse * dartSpeed;
            const spiderSpeed = Math.hypot(creature.vx, creature.vy);
            const maxSpiderSpeed = 2.08;
            if (spiderSpeed > maxSpiderSpeed) {
                creature.vx = (creature.vx / spiderSpeed) * maxSpiderSpeed;
                creature.vy = (creature.vy / spiderSpeed) * maxSpiderSpeed;
            }
            const targetHeading = Math.hypot(creature.vx, creature.vy) > 0.03 ? Math.atan2(creature.vy, creature.vx) : creature.heading ?? creature.phase;
            const currentHeading = creature.heading ?? targetHeading;
            creature.heading = currentHeading + angleDelta(targetHeading, currentHeading) * 0.12;
            creature.phase += 0.11 + dartPulse * 0.035;
            creature.webCooldown = Math.max(0, (creature.webCooldown ?? 300) - 1);
            creature.roamTargetX = roam.targetX;
            creature.roamTargetY = roam.targetY;
            creature.roamCooldown = roam.cooldown;
        }

        const mergeScale = Math.max(1, (creature.mergeScale ?? 1) - 0.01);
        creature.mergeScale = mergeScale > 1 ? mergeScale : undefined;
    }

    return resolveCreatureCollisions(creatures, width, height);
};

export const createParticlesForTool = (tool: PlaygroundToolId, x: number, y: number, sampledColor?: string, direction?: number): Particle[] => {
    if (tool === "skeleton" || tool === "spider" || tool === "monster" || tool === "laser" || tool === "throw") {
        return [];
    }

    const count = tool === "glyph" ? 14 : tool === "scatter" ? 12 : tool === "burn" ? 10 : 10;
    const particles: Particle[] = [];

    for (let index = 0; index < count; index += 1) {
        const shotDirection = direction ?? randomBetween(0, Math.PI * 2);
        const burnDirection = direction ?? randomBetween(0, Math.PI * 2);
        const angle = tool === "scatter"
            ? shotDirection + Math.PI + randomBetween(-0.52, 0.52)
            : tool === "burn"
                ? burnDirection + Math.PI + randomBetween(-0.48, 0.48)
                : randomBetween(0, Math.PI * 2);
        const speed = tool === "scatter" ? randomBetween(1.6, 4.8) : tool === "burn" ? randomBetween(0.55, 2.55) : tool === "glyph" ? randomBetween(1.2, 4.8) : randomBetween(2.4, 8.2);
        const glyph = tool === "glyph"
            ? [...GLYPHS, ...ICON_GLYPHS][Math.floor(Math.random() * (GLYPHS.length + ICON_GLYPHS.length))]
            : undefined;
        
        let color = sampledColor || "#ffffff";
        if (tool === "burn") color = ["#fff7ed", "#fef08a", "#facc15", "#fb923c", "#f97316", "#7f1d1d", "#230606"][index % 7];
        else if (tool === "scatter") color = ["#f8fafc", "#bae6fd", "#93c5fd", "#fef3c7"][index % 4];
        else if (tool === "glyph") color = ["#f8fafc", "#93c5fd", "#a7f3d0", "#f0abfc"][index % 4];
        else if (tool === "hammer") color = ["rgba(255,255,255,0.72)", "rgba(226,232,240,0.58)", "rgba(148,163,184,0.42)", "rgba(15,23,42,0.26)"][index % 4];
        else if (!sampledColor) color = ["#e5e7eb", "#94a3b8", "#cbd5e1", "#64748b"][index % 4];

        const maxLife = tool === "hammer"
            ? randomBetween(18, 30)
            : tool === "burn"
                ? randomBetween(50, 84)
                : tool === "scatter"
                    ? randomBetween(26, 42)
                    : randomBetween(32, 52);

        particles.push(particle(
            tool === "scatter" ? x + Math.cos(shotDirection) * randomBetween(-18, 12) + randomBetween(-2, 2) : tool === "burn" ? x + Math.cos(burnDirection) * randomBetween(0, 18) + randomBetween(-6, 6) : x + randomBetween(-12, 12),
            tool === "scatter" ? y + Math.sin(shotDirection) * randomBetween(-18, 12) + randomBetween(-2, 2) : tool === "burn" ? y + Math.sin(burnDirection) * randomBetween(0, 18) + randomBetween(-6, 6) : y + randomBetween(-12, 12),
            Math.cos(angle) * speed,
            Math.sin(angle) * speed,
            color,
            glyph ? randomBetween(13, 19) : tool === "burn" ? randomBetween(7, 14) : tool === "hammer" ? randomBetween(1.2, 3.6) : randomBetween(2, 6),
            maxLife,
            glyph,
            tool === "hammer" ? "dust" : tool === "burn" ? "ember" : tool === "scatter" ? "spark" : "pixel",
        ));
    }

    return particles;
};

export const stepParticlesMutable = (particles: Particle[]): Particle[] => {
    let writeIndex = 0;
    for (const item of particles) {
        item.x += item.vx;
        item.y += item.vy;
        if (item.shape === "ember") {
            const emberAge = item.maxLife - item.life;
            item.vx = (item.vx * 0.956) + Math.sin(emberAge * 0.16 + item.spin * 34) * 0.012;
            item.vy = (item.vy * 0.952) - 0.012 - Math.max(0, Math.sin(emberAge * 0.09 + item.spin * 17)) * 0.006;
        } else {
            item.vx *= 0.982;
            item.vy *= 0.982;
        }
        item.life -= 1;
        item.spin *= 0.992;
        if (item.life > 0) {
            particles[writeIndex] = item;
            writeIndex += 1;
        }
    }
    particles.length = writeIndex;
    return particles;
};

export const stepParticles = (particles: Particle[]): Particle[] => particles
    .map((item) => {
        const emberAge = item.maxLife - item.life;
        return {
            ...item,
            x: item.x + item.vx,
            y: item.y + item.vy,
            vx: item.shape === "ember"
                ? (item.vx * 0.956) + Math.sin(emberAge * 0.16 + item.spin * 34) * 0.012
                : item.vx * 0.982,
            vy: item.shape === "ember"
                ? (item.vy * 0.952) - 0.012 - Math.max(0, Math.sin(emberAge * 0.09 + item.spin * 17)) * 0.006
                : item.vy * 0.982,
            life: item.life - 1,
            spin: item.spin * 0.992,
        };
    })
    .filter((item) => item.life > 0);

const drawCrack = (ctx: CanvasRenderingContext2D, impact: Impact): void => {
    const next = seededRandom(impact.seed);
    ctx.save();
    ctx.translate(impact.x, impact.y);
    ctx.rotate(impact.rotation);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const radius = impact.radius * 1.02;
    const contactShadow = ctx.createRadialGradient(
        impact.radius * 0.08,
        impact.radius * 0.14,
        0,
        impact.radius * 0.08,
        impact.radius * 0.14,
        radius * 1.06,
    );
    contactShadow.addColorStop(0, "rgba(0,0,0,0.26)");
    contactShadow.addColorStop(0.42, "rgba(0,0,0,0.13)");
    contactShadow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.scale(1.18, 0.58);
    ctx.fillStyle = contactShadow;
    ctx.beginPath();
    ctx.arc(0, impact.radius * 0.14, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const baseGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.5);
    baseGradient.addColorStop(0, "rgba(15,23,42,0.24)");
    baseGradient.addColorStop(0.34, "rgba(15,23,42,0.12)");
    baseGradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = baseGradient;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 0.5, 0, Math.PI * 2);
    ctx.fill();

    const chipCount = 18;
    for (let chip = 0; chip < chipCount; chip += 1) {
        const angle = seededBetween(next, 0, Math.PI * 2);
        const distance = radius * seededBetween(next, 0.12, 0.56);
        const size = radius * seededBetween(next, 0.018, 0.045);
        const cx = Math.cos(angle) * distance;
        const cy = Math.sin(angle) * distance;
        ctx.fillStyle = chip % 3 === 0 ? "rgba(255,255,255,0.18)" : "rgba(2,6,23,0.16)";
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(angle) * size, cy + Math.sin(angle) * size);
        ctx.lineTo(cx + Math.cos(angle + 2.2) * size * 0.72, cy + Math.sin(angle + 2.2) * size * 0.72);
        ctx.lineTo(cx + Math.cos(angle - 2.1) * size * 0.62, cy + Math.sin(angle - 2.1) * size * 0.62);
        ctx.closePath();
        ctx.fill();
    }

    const arms = 16;
    for (let arm = 0; arm < arms; arm += 1) {
        const angle = (Math.PI * 2 * arm) / arms + seededBetween(next, -0.19, 0.19);
        const length = radius * seededBetween(next, 0.56, arm % 3 === 0 ? 1.34 : 1.08);
        const points: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
        const segments = arm % 4 === 0 ? 5 : 4;
        for (let s = 1; s <= segments; s++) {
            const t = s / segments;
            const jitter = radius * (0.035 + t * 0.035);
            points.push({
                x: Math.cos(angle) * length * t + seededBetween(next, -jitter, jitter),
                y: Math.sin(angle) * length * t + seededBetween(next, -jitter, jitter),
            });
        }

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let index = 1; index < points.length; index += 1) {
            const current = points[index];
            const previous = points[index - 1];
            ctx.quadraticCurveTo(previous.x, previous.y, (previous.x + current.x) / 2, (previous.y + current.y) / 2);
        }
        const end = points[points.length - 1];
        ctx.lineTo(end.x, end.y);

        ctx.strokeStyle = "rgba(2,6,23,0.34)";
        ctx.lineWidth = seededBetween(next, 0.95, 1.9);
        ctx.stroke();

        ctx.save();
        ctx.translate(0.55, -0.55);
        ctx.strokeStyle = "rgba(255,255,255,0.3)";
        ctx.lineWidth = seededBetween(next, 0.22, 0.56);
        ctx.stroke();
        ctx.restore();

        for (let index = 1; index < points.length - 1; index += 1) {
            if (next() <= 0.34) continue;
            const branch = points[index];
            const bAngle = angle + seededBetween(next, -0.92, 0.92);
            const bLen = length * seededBetween(next, 0.1, 0.28);
            const bend = bAngle + seededBetween(next, -0.32, 0.32);
            ctx.beginPath();
            ctx.moveTo(branch.x, branch.y);
            ctx.quadraticCurveTo(
                branch.x + Math.cos(bAngle) * bLen * 0.48,
                branch.y + Math.sin(bAngle) * bLen * 0.48,
                branch.x + Math.cos(bend) * bLen,
                branch.y + Math.sin(bend) * bLen,
            );
            ctx.strokeStyle = "rgba(2,6,23,0.22)";
            ctx.lineWidth = seededBetween(next, 0.24, 0.62);
            ctx.stroke();
        }
    }

    for (let ring = 0; ring < 4; ring += 1) {
        const ringRadius = radius * seededBetween(next, 0.18 + ring * 0.16, 0.28 + ring * 0.18);
        const startAngle = seededBetween(next, 0, Math.PI * 2);
        ctx.beginPath();
        ctx.arc(0, 0, ringRadius, startAngle, startAngle + seededBetween(next, 0.58, 2.4));
        ctx.strokeStyle = "rgba(2,6,23,0.15)";
        ctx.lineWidth = seededBetween(next, 0.22, 0.48);
        ctx.setLineDash([seededBetween(next, 2, 5), seededBetween(next, 5, 11)]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    for (let i = 0; i < 26; i++) {
        const dAngle = next() * Math.PI * 2;
        const dDist = next() * radius * 0.82;
        const dSize = 0.35 + next() * 0.9;
        ctx.fillStyle = i % 4 === 0 ? "rgba(255,255,255,0.16)" : "rgba(15,23,42,0.18)";
        ctx.beginPath();
        ctx.arc(Math.cos(dAngle) * dDist, Math.sin(dAngle) * dDist, dSize, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
};

const drawBurn = (ctx: CanvasRenderingContext2D, impact: Impact): void => {
    const next = seededRandom(impact.seed);
    const radius = impact.radius * 0.58;
    const forwardX = Math.cos(impact.rotation);
    const forwardY = Math.sin(impact.rotation);

    ctx.save();
    ctx.translate(impact.x, impact.y);
    ctx.rotate(impact.rotation);

    ctx.globalCompositeOperation = "screen";
    const blast = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.72);
    blast.addColorStop(0, "rgba(255,255,255,0.5)");
    blast.addColorStop(0.16, "rgba(254,240,138,0.42)");
    blast.addColorStop(0.38, "rgba(249,115,22,0.28)");
    blast.addColorStop(0.72, "rgba(127,29,29,0.14)");
    blast.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = blast;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.5, radius * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let lobe = 0; lobe < 7; lobe += 1) {
        const flameAngle = seededBetween(next, -Math.PI, Math.PI);
        const distance = radius * seededBetween(next, 0.04, 0.32);
        const fx = Math.cos(flameAngle) * distance;
        const fy = Math.sin(flameAngle) * distance;
        const lobeRadius = radius * seededBetween(next, 0.12, 0.28);
        const flame = ctx.createRadialGradient(fx, fy, 0, fx, fy, lobeRadius);
        flame.addColorStop(0, lobe % 2 === 0 ? "rgba(255,255,255,0.58)" : "rgba(254,240,138,0.52)");
        flame.addColorStop(0.28, "rgba(251,191,36,0.44)");
        flame.addColorStop(0.62, "rgba(249,115,22,0.26)");
        flame.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = flame;
        ctx.beginPath();
        ctx.ellipse(fx, fy, lobeRadius * 0.8, lobeRadius * 0.52, flameAngle, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalCompositeOperation = "multiply";
    for (let s = 0; s < 10; s++) {
        const sx = seededBetween(next, -radius * 0.12, radius * 0.12);
        const sy = seededBetween(next, -radius * 0.07, radius * 0.09);
        const sr = radius * seededBetween(next, 0.22, 0.54);
        const scorch = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        scorch.addColorStop(0, "rgba(15,7,3,0.42)");
        scorch.addColorStop(0.34, "rgba(55,22,8,0.24)");
        scorch.addColorStop(0.68, "rgba(100,44,13,0.08)");
        scorch.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = scorch;
        ctx.beginPath();
        ctx.ellipse(sx, sy, sr, sr * 0.7, next() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
    for (let mark = 0; mark < 22; mark += 1) {
        const angle = seededBetween(next, -Math.PI, Math.PI);
        const distance = radius * seededBetween(next, 0.08, 0.58);
        const length = radius * seededBetween(next, 0.06, 0.24);
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(
            x + Math.cos(angle + 0.8) * length * 0.7,
            y + Math.sin(angle + 0.8) * length * 0.4,
            x + Math.cos(angle) * length,
            y + Math.sin(angle) * length,
        );
        ctx.strokeStyle = mark % 4 === 0 ? "rgba(254,240,138,0.42)" : mark % 3 === 0 ? "rgba(249,115,22,0.34)" : "rgba(69,18,7,0.38)";
        ctx.lineWidth = seededBetween(next, 0.45, 1.5);
        ctx.lineCap = "round";
        ctx.stroke();
    }

    ctx.globalCompositeOperation = "screen";
    for (let ember = 0; ember < 24; ember += 1) {
        const emberAngle = seededBetween(next, -Math.PI, Math.PI);
        const emberDist = radius * seededBetween(next, 0.1, 0.68);
        const emberX = Math.cos(emberAngle) * emberDist;
        const emberY = Math.sin(emberAngle) * emberDist;
        const emberSize = seededBetween(next, 0.55, 1.9);
        ctx.fillStyle = ember % 3 === 0 ? "rgba(255,255,255,0.58)" : "rgba(251,191,36,0.64)";
        ctx.shadowColor = "rgba(249,115,22,0.72)";
        ctx.shadowBlur = emberSize * 3;
        ctx.beginPath();
        ctx.arc(emberX, emberY, emberSize, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    for (let streak = 0; streak < 10; streak += 1) {
        const side = seededBetween(next, -radius * 0.22, radius * 0.22);
        const start = seededBetween(next, -radius * 0.12, radius * 0.16);
        const length = seededBetween(next, radius * 0.16, radius * 0.46);
        ctx.strokeStyle = streak % 2 === 0 ? "rgba(254,240,138,0.3)" : "rgba(249,115,22,0.24)";
        ctx.lineWidth = seededBetween(next, 0.55, 1.45);
        ctx.beginPath();
        ctx.moveTo(forwardX * start - forwardY * side, forwardY * start + forwardX * side);
        ctx.lineTo(forwardX * (start + length) - forwardY * side * 0.45, forwardY * (start + length) + forwardX * side * 0.45);
        ctx.stroke();
    }

    const residual = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.48);
    residual.addColorStop(0, "rgba(255,255,255,0.26)");
    residual.addColorStop(0.22, "rgba(251,146,60,0.24)");
    residual.addColorStop(0.48, "rgba(250,204,21,0.08)");
    residual.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = residual;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.34, radius * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
};

const drawScatter = (ctx: CanvasRenderingContext2D, impact: Impact): void => {
    const next = seededRandom(impact.seed);
    const shaftLength = impact.radius * seededBetween(next, 1.9, 2.45);
    const angle = impact.rotation;
    const forwardX = Math.cos(angle);
    const forwardY = Math.sin(angle);
    const tailX = -forwardX * shaftLength;
    const tailY = -forwardY * shaftLength;
    const tipX = 0;
    const tipY = 0;
    const sideX = Math.cos(angle + Math.PI / 2);
    const sideY = Math.sin(angle + Math.PI / 2);

    ctx.save();
    ctx.translate(impact.x, impact.y);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, impact.radius * 0.32);
    glow.addColorStop(0, "rgba(248,250,252,0.28)");
    glow.addColorStop(0.46, "rgba(96,165,250,0.12)");
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(tipX, tipY, impact.radius * 0.32, 0, Math.PI * 2);
    ctx.fill();

    for (let trail = 0; trail < 5; trail += 1) {
        const offset = seededBetween(next, -8, 8);
        const trailStart = seededBetween(next, 0.32, 0.92);
        ctx.strokeStyle = trail % 2 === 0 ? "rgba(226,232,240,0.28)" : "rgba(148,163,184,0.2)";
        ctx.lineWidth = seededBetween(next, 0.8, 1.8);
        ctx.beginPath();
        ctx.moveTo(tailX * trailStart + sideX * offset, tailY * trailStart + sideY * offset);
        ctx.lineTo(tailX * 0.12 + sideX * offset * 0.25, tailY * 0.12 + sideY * offset * 0.25);
        ctx.stroke();
    }

    ctx.globalCompositeOperation = "source-over";
    const puncture = ctx.createRadialGradient(0, 0, 0, 0, 0, impact.radius * 0.18);
    puncture.addColorStop(0, "rgba(15,23,42,0.74)");
    puncture.addColorStop(0.48, "rgba(88,28,135,0.22)");
    puncture.addColorStop(1, "rgba(15,23,42,0)");
    ctx.fillStyle = puncture;
    ctx.beginPath();
    ctx.ellipse(0, 0, impact.radius * 0.2, impact.radius * 0.1, angle, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(248,250,252,0.38)";
    ctx.lineWidth = 1.15;
    for (const ring of [0.18, 0.29]) {
        ctx.beginPath();
        ctx.ellipse(0, 0, impact.radius * ring, impact.radius * ring * 0.62, angle, 0, Math.PI * 2);
        ctx.stroke();
    }

    ctx.strokeStyle = "rgba(15,23,42,0.48)";
    ctx.lineWidth = Math.max(3.4, impact.radius * 0.075);
    ctx.beginPath();
    ctx.moveTo(tailX + sideX * 1.2, tailY + sideY * 1.2);
    ctx.lineTo(tipX - forwardX * impact.radius * 0.1, tipY - forwardY * impact.radius * 0.1);
    ctx.stroke();

    const shaftGradient = ctx.createLinearGradient(tailX, tailY, tipX, tipY);
    shaftGradient.addColorStop(0, "#111827");
    shaftGradient.addColorStop(0.32, "#94a3b8");
    shaftGradient.addColorStop(0.72, "#e5e7eb");
    shaftGradient.addColorStop(1, "#f8fafc");
    ctx.strokeStyle = shaftGradient;
    ctx.lineWidth = Math.max(1.6, impact.radius * 0.032);
    ctx.beginPath();
    ctx.moveTo(tailX, tailY);
    ctx.lineTo(tipX - forwardX * impact.radius * 0.14, tipY - forwardY * impact.radius * 0.14);
    ctx.stroke();

    ctx.fillStyle = "rgba(209,213,219,0.96)";
    ctx.beginPath();
    ctx.moveTo(tipX + forwardX * impact.radius * 0.18, tipY + forwardY * impact.radius * 0.18);
    ctx.lineTo(tipX - forwardX * impact.radius * 0.28 + sideX * impact.radius * 0.17, tipY - forwardY * impact.radius * 0.28 + sideY * impact.radius * 0.17);
    ctx.lineTo(tipX - forwardX * impact.radius * 0.14, tipY - forwardY * impact.radius * 0.14);
    ctx.lineTo(tipX - forwardX * impact.radius * 0.28 - sideX * impact.radius * 0.17, tipY - forwardY * impact.radius * 0.28 - sideY * impact.radius * 0.17);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(15,23,42,0.55)";
    ctx.lineWidth = 0.9;
    ctx.stroke();

    const featherBaseX = tailX + forwardX * impact.radius * 0.2;
    const featherBaseY = tailY + forwardY * impact.radius * 0.2;
    for (const side of [-1, 1]) {
        ctx.fillStyle = side > 0 ? "rgba(15,23,42,0.82)" : "rgba(71,85,105,0.76)";
        ctx.beginPath();
        ctx.moveTo(featherBaseX, featherBaseY);
        ctx.lineTo(featherBaseX - forwardX * impact.radius * 0.2 + sideX * side * impact.radius * 0.1, featherBaseY - forwardY * impact.radius * 0.2 + sideY * side * impact.radius * 0.1);
        ctx.lineTo(featherBaseX + forwardX * impact.radius * 0.14 + sideX * side * impact.radius * 0.05, featherBaseY + forwardY * impact.radius * 0.14 + sideY * side * impact.radius * 0.05);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(15,23,42,0.35)";
        ctx.lineWidth = 0.65;
        ctx.stroke();
    }

    for (let ring = 0; ring < 3; ring += 1) {
        const ringX = tailX + forwardX * impact.radius * (0.34 + ring * 0.12);
        const ringY = tailY + forwardY * impact.radius * (0.34 + ring * 0.12);
        ctx.strokeStyle = ring === 1 ? "rgba(248,250,252,0.58)" : "rgba(15,23,42,0.58)";
        ctx.lineWidth = Math.max(0.6, impact.radius * 0.012);
        ctx.beginPath();
        ctx.moveTo(ringX - sideX * impact.radius * 0.08, ringY - sideY * impact.radius * 0.08);
        ctx.lineTo(ringX + sideX * impact.radius * 0.08, ringY + sideY * impact.radius * 0.08);
        ctx.stroke();
    }

    for (const side of [-1, 1]) {
        const finRootX = tailX + forwardX * impact.radius * 0.1;
        const finRootY = tailY + forwardY * impact.radius * 0.1;
        ctx.fillStyle = side > 0 ? "rgba(30,41,59,0.9)" : "rgba(100,116,139,0.84)";
        ctx.beginPath();
        ctx.moveTo(finRootX, finRootY);
        ctx.lineTo(finRootX + forwardX * impact.radius * 0.28 + sideX * side * impact.radius * 0.13, finRootY + forwardY * impact.radius * 0.28 + sideY * side * impact.radius * 0.13);
        ctx.lineTo(finRootX + forwardX * impact.radius * 0.5 + sideX * side * impact.radius * 0.05, finRootY + forwardY * impact.radius * 0.5 + sideY * side * impact.radius * 0.05);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(15,23,42,0.48)";
        ctx.lineWidth = 0.55;
        ctx.stroke();
    }

    ctx.globalCompositeOperation = "multiply";
    for (let crack = 0; crack < 7; crack += 1) {
        const crackAngle = angle + seededBetween(next, -1.85, 1.85);
        const crackLength = impact.radius * seededBetween(next, 0.32, 0.72);
        const jag = impact.radius * seededBetween(next, 0.04, 0.12);
        ctx.strokeStyle = crack % 2 === 0 ? "rgba(2,6,23,0.42)" : "rgba(15,23,42,0.3)";
        ctx.lineWidth = seededBetween(next, 0.75, 1.45);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(
            Math.cos(crackAngle) * crackLength * 0.55 + Math.cos(crackAngle + Math.PI / 2) * jag,
            Math.sin(crackAngle) * crackLength * 0.55 + Math.sin(crackAngle + Math.PI / 2) * jag,
        );
        ctx.lineTo(Math.cos(crackAngle) * crackLength, Math.sin(crackAngle) * crackLength);
        ctx.stroke();
    }

    ctx.globalCompositeOperation = "screen";
    for (let spark = 0; spark < 7; spark += 1) {
        const sparkAngle = angle + seededBetween(next, -1.2, 1.2);
        const sparkLength = seededBetween(next, 8, 22);
        ctx.strokeStyle = spark % 2 === 0 ? "rgba(254,243,199,0.54)" : "rgba(191,219,254,0.45)";
        ctx.lineWidth = seededBetween(next, 0.7, 1.5);
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX + Math.cos(sparkAngle) * sparkLength, tipY + Math.sin(sparkAngle) * sparkLength);
        ctx.stroke();
    }
    ctx.restore();
};

const drawGlyphImpact = (ctx: CanvasRenderingContext2D, impact: Impact): void => {
    const next = seededRandom(impact.seed);
    ctx.save();
    ctx.translate(impact.x, impact.y);
    ctx.rotate(impact.rotation);
    ctx.globalAlpha = 0.84;
    ctx.font = "900 26px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(248,250,252,0.9)";
    ctx.strokeStyle = "rgba(15,23,42,0.72)";
    ctx.lineWidth = 4;
    ctx.strokeText("AGE", 0, 0);
    ctx.fillText("AGE", 0, 0);

    for (let index = 0; index < 3; index += 1) {
        const angle = seededBetween(next, 0, Math.PI * 2);
        const x = Math.cos(angle) * impact.radius * seededBetween(next, 0.3, 0.55);
        const y = Math.sin(angle) * impact.radius * seededBetween(next, 0.3, 0.55);
        ctx.font = "800 13px Segoe UI, Arial, sans-serif";
        ctx.strokeText(GLYPHS[index % GLYPHS.length], x, y);
        ctx.fillText(GLYPHS[index % GLYPHS.length], x, y);
    }
    ctx.restore();
};

export const drawImpact = (ctx: CanvasRenderingContext2D, impact: Impact): void => {
    if (impact.tool === "burn") drawBurn(ctx, impact);
    else if (impact.tool === "scatter") drawScatter(ctx, impact);
    else if (impact.tool === "glyph") drawGlyphImpact(ctx, impact);
    else drawCrack(ctx, impact);
};

export const drawParticle = (ctx: CanvasRenderingContext2D, particle: Particle): void => {
    const alpha = Math.max(0, Math.min(1, particle.life / particle.maxLife));
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(particle.x, particle.y);
    ctx.rotate((particle.maxLife - particle.life) * particle.spin);
    if (particle.glyph) {
        ctx.font = `800 ${particle.size}px Segoe UI, Arial, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.strokeStyle = "rgba(2,6,23,0.76)";
        ctx.lineWidth = Math.max(2, particle.size * 0.1);
        ctx.fillStyle = particle.color;
        ctx.strokeText(particle.glyph, 0, 0);
        ctx.fillText(particle.glyph, 0, 0);
    } else if (particle.shape === "dust") {
        ctx.fillStyle = particle.color;
        ctx.beginPath();
        const size = particle.size * 1.35;
        ctx.moveTo(-size * 0.48, -size * 0.12);
        ctx.lineTo(size * 0.2, -size * 0.44);
        ctx.lineTo(size * 0.52, size * 0.08);
        ctx.lineTo(-size * 0.1, size * 0.38);
        ctx.closePath();
        ctx.fill();
    } else if (particle.shape === "spark") {
        ctx.strokeStyle = particle.color;
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = particle.size * 2;
        ctx.beginPath();
        const length = particle.size * 3;
        ctx.moveTo(-length / 2, 0);
        ctx.lineTo(length / 2, 0);
        ctx.lineWidth = particle.size * 0.5;
        ctx.lineCap = "round";
        ctx.stroke();
        ctx.shadowBlur = 0;
    } else {
        ctx.fillStyle = particle.color;
        const size = particle.size;
        ctx.beginPath();
        ctx.moveTo(-size * 0.46, -size * 0.2);
        ctx.lineTo(size * 0.18, -size * 0.54);
        ctx.lineTo(size * 0.5, size * 0.1);
        ctx.lineTo(-size * 0.08, size * 0.46);
        ctx.closePath();
        ctx.fill();
    }
    ctx.restore();
};
