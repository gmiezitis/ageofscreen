export type PlaygroundToolId = "hammer" | "burn" | "scatter" | "glyph";

export type Impact = {
    id: string;
    tool: PlaygroundToolId;
    x: number;
    y: number;
    radius: number;
    rotation: number;
    createdAt: number;
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
};

export type PlaygroundState = {
    impacts: Impact[];
    particles: Particle[];
};

const GLYPHS = ["A", "G", "E", "O", "F", "S", "C", "R", "N", "?", "!", "#", "@", "*", "+", "0", "1"];
const ICON_GLYPHS = ["□", "△", "◇", "○", "✦", "✧", "⌁", "⌖"];

const randomBetween = (min: number, max: number): number => min + Math.random() * (max - min);

const makeId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const particle = (
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    size: number,
    maxLife: number,
    glyph?: string,
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
});

export const createImpact = (tool: PlaygroundToolId, x: number, y: number): Impact => ({
    id: makeId("impact"),
    tool,
    x,
    y,
    radius: tool === "scatter" ? randomBetween(34, 58) : tool === "burn" ? randomBetween(42, 82) : randomBetween(38, 70),
    rotation: randomBetween(0, Math.PI * 2),
    createdAt: performance.now(),
});

export const createParticlesForTool = (tool: PlaygroundToolId, x: number, y: number): Particle[] => {
    const count = tool === "glyph" ? 22 : tool === "scatter" ? 34 : tool === "burn" ? 26 : 18;
    const particles: Particle[] = [];

    for (let index = 0; index < count; index += 1) {
        const angle = randomBetween(0, Math.PI * 2);
        const speed = tool === "scatter" ? randomBetween(2.2, 8.2) : tool === "glyph" ? randomBetween(1.4, 5.4) : randomBetween(0.8, 4.2);
        const glyph = tool === "glyph"
            ? [...GLYPHS, ...ICON_GLYPHS][Math.floor(Math.random() * (GLYPHS.length + ICON_GLYPHS.length))]
            : undefined;
        const color = tool === "burn"
            ? ["#f97316", "#fb923c", "#facc15", "#450a0a"][index % 4]
            : tool === "glyph"
                ? ["#f8fafc", "#93c5fd", "#a7f3d0", "#f0abfc"][index % 4]
                : ["#e5e7eb", "#94a3b8", "#cbd5e1", "#64748b"][index % 4];

        particles.push(particle(
            x + randomBetween(-12, 12),
            y + randomBetween(-12, 12),
            Math.cos(angle) * speed,
            Math.sin(angle) * speed - randomBetween(0, 2.4),
            color,
            glyph ? randomBetween(16, 34) : randomBetween(2, 7),
            randomBetween(44, 92),
            glyph,
        ));
    }

    return particles;
};

export const stepParticles = (particles: Particle[]): Particle[] => particles
    .map((item) => ({
        ...item,
        x: item.x + item.vx,
        y: item.y + item.vy,
        vx: item.vx * 0.986,
        vy: (item.vy + 0.13) * 0.988,
        life: item.life - 1,
        spin: item.spin * 0.994,
    }))
    .filter((item) => item.life > 0);

const drawCrack = (ctx: CanvasRenderingContext2D, impact: Impact): void => {
    ctx.save();
    ctx.translate(impact.x, impact.y);
    ctx.rotate(impact.rotation);
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";

    const arms = 7;
    for (let arm = 0; arm < arms; arm += 1) {
        const angle = (Math.PI * 2 * arm) / arms + randomBetween(-0.12, 0.12);
        const length = impact.radius * randomBetween(0.48, 1.15);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const midX = Math.cos(angle) * length * 0.48 + randomBetween(-7, 7);
        const midY = Math.sin(angle) * length * 0.48 + randomBetween(-7, 7);
        ctx.quadraticCurveTo(midX, midY, Math.cos(angle) * length, Math.sin(angle) * length);
        ctx.strokeStyle = "rgba(255,255,255,0.66)";
        ctx.lineWidth = randomBetween(1, 2.4);
        ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, impact.radius * 0.16, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.restore();
};

const drawBurn = (ctx: CanvasRenderingContext2D, impact: Impact): void => {
    const gradient = ctx.createRadialGradient(impact.x, impact.y, 0, impact.x, impact.y, impact.radius);
    gradient.addColorStop(0, "rgba(255,247,166,0.82)");
    gradient.addColorStop(0.22, "rgba(249,115,22,0.52)");
    gradient.addColorStop(0.56, "rgba(69,10,10,0.66)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.save();
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.ellipse(impact.x, impact.y, impact.radius * 1.08, impact.radius * 0.82, impact.rotation, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
};

const drawScatter = (ctx: CanvasRenderingContext2D, impact: Impact): void => {
    ctx.save();
    ctx.translate(impact.x, impact.y);
    ctx.rotate(impact.rotation);
    ctx.globalCompositeOperation = "lighter";
    for (let index = 0; index < 14; index += 1) {
        const angle = (Math.PI * 2 * index) / 14;
        const distance = impact.radius * randomBetween(0.22, 0.92);
        ctx.fillStyle = index % 2 === 0 ? "rgba(147,197,253,0.35)" : "rgba(248,250,252,0.32)";
        ctx.fillRect(Math.cos(angle) * distance, Math.sin(angle) * distance, randomBetween(3, 8), randomBetween(3, 8));
    }
    ctx.restore();
};

const drawGlyphImpact = (ctx: CanvasRenderingContext2D, impact: Impact): void => {
    ctx.save();
    ctx.translate(impact.x, impact.y);
    ctx.rotate(impact.rotation);
    ctx.globalAlpha = 0.82;
    ctx.font = "700 22px Segoe UI, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.strokeStyle = "rgba(15,23,42,0.72)";
    ctx.lineWidth = 3;
    const word = "AGEOFSCREEN";
    for (let index = 0; index < word.length; index += 1) {
        const angle = (Math.PI * 2 * index) / word.length;
        const x = Math.cos(angle) * impact.radius * 0.7;
        const y = Math.sin(angle) * impact.radius * 0.7;
        ctx.strokeText(word[index], x, y);
        ctx.fillText(word[index], x, y);
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
    } else {
        ctx.fillStyle = particle.color;
        ctx.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size);
    }
    ctx.restore();
};
