import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
    Bug,
    Crosshair,
    Flame,
    Hand,
    Hammer as HammerIcon,
    Image as ImageIcon,
    RotateCcw,
    Save,
    Skull,
    Type,
    Volume2,
    VolumeX,
    X,
    Zap,
} from "lucide-react";
import type { ScreenPlaygroundInitPayload, ScreenPlaygroundSource } from "./preload";
import "./types";
import dragonFireballSheetSrc from "../assets/playground/dragon-fireball-sheet.png";
import dragonEmberParticleSheetSrc from "../assets/playground/dragon-ember-particle-sheet.png";
import dragonHeadSheetSrc from "../assets/playground/dragon-head-sheet.png";
import dragonImpactFlameSheetSrc from "../assets/playground/dragon-impact-flame-sheet.png";
import monsterSnakeSheetSrc from "../assets/playground/monster-snake-sheet.png";
import realisticBurnScorchSrc from "../assets/playground/realistic-burn-scorch.png";
import realisticHammerSrc from "../assets/playground/realistic-hammer-reference.png";
import realisticSkeletonSrc from "../assets/playground/realistic-skeleton-walk-sheet.png";
import realisticSpiderSrc from "../assets/playground/realistic-spider-reference.png";
import slingerEggSheetSrc from "../assets/playground/slinger-egg-sheet.png";
import slingerFrameSrc from "../assets/playground/slinger-frame.png";
import slingerStrawberrySheetSrc from "../assets/playground/slinger-strawberry-sheet.png";
import slingerTomatoSheetSrc from "../assets/playground/slinger-tomato-sheet.png";
import slingerWatermelonSheetSrc from "../assets/playground/slinger-watermelon-sheet.png";
import customArrowSrc from "../assets/playground/custom-arrow-reference.png";
import {
    createCreature,
    createImpact,
    createParticlesForTool,
    drawImpact,
    drawParticle,
    Creature,
    Impact,
    Particle,
    PlaygroundToolId,
    stepCreaturesMutable,
    stepParticlesMutable,
} from "./engine";
import { playToolSound } from "./sound";
import { SkeletonController } from "./SkeletonController";

const TOOLS: Array<{ id: PlaygroundToolId; label: string; detail: string; hotkey: string; cursor: string; icon: React.ReactNode }> = [
    { id: "hammer", label: "Hammer", detail: "Simple strike", hotkey: "1", cursor: "", icon: <HammerIcon size={14} strokeWidth={2.4} /> },
    { id: "burn", label: "Heat", detail: "Scorch marks", hotkey: "2", cursor: "FX", icon: <Flame size={14} strokeWidth={2.4} /> },
    { id: "scatter", label: "Shot", detail: "Arrow shot", hotkey: "3", cursor: "", icon: <Crosshair size={14} strokeWidth={2.4} /> },
    { id: "glyph", label: "Text", detail: "Flying letters", hotkey: "4", cursor: "A", icon: <Type size={14} strokeWidth={2.4} /> },
    { id: "skeleton", label: "Bones", detail: "Walking skeleton", hotkey: "5", cursor: "SK", icon: <Skull size={14} strokeWidth={2.4} /> },
    { id: "spider", label: "Spider", detail: "Shadow crawler", hotkey: "s", cursor: "SP", icon: <Bug size={14} strokeWidth={2.4} /> },
    { id: "laser", label: "Laser", detail: "Neon beam", hotkey: "6", cursor: "LZ", icon: <Zap size={14} strokeWidth={2.4} /> },
    { id: "throw", label: "Slinger", detail: "Drag back farther for more power", hotkey: "7", cursor: "", icon: <Hand size={14} strokeWidth={2.4} /> },
    { id: "monster", label: "Monster", detail: "Screen breach", hotkey: "8", cursor: "", icon: <Bug size={14} strokeWidth={2.4} /> },
];

type ThrowFoodId = "tomato" | "egg" | "watermelon" | "strawberry";

type FruitProfile = {
    id: ThrowFoodId;
    label: string;
    stain: string;
    pulp: string;
    skin: string;
    seed?: string;
    mass: number;
    radius: number;
    splatScale: number;
    slideSpeed: [number, number];
    burst: number;
};

const THROW_FOODS: FruitProfile[] = [
    { id: "watermelon", label: "Watermelon", stain: "rgba(127,29,29,0.38)", pulp: "#fb7185", skin: "#166534", seed: "#111827", mass: 1.42, radius: 36, splatScale: 1.72, slideSpeed: [0.0018, 0.0032], burst: 32 },
    { id: "egg", label: "Egg", stain: "rgba(254,243,199,0.22)", pulp: "#facc15", skin: "#f8fafc", seed: "#f59e0b", mass: 0.72, radius: 19, splatScale: 1.08, slideSpeed: [0.0042, 0.0068], burst: 9 },
    { id: "strawberry", label: "Strawberry", stain: "rgba(159,18,57,0.28)", pulp: "#e11d48", skin: "#7f1d1d", seed: "#fef08a", mass: 0.96, radius: 20, splatScale: 0.88, slideSpeed: [0.0022, 0.0038], burst: 12 },
    { id: "tomato", label: "Tomato", stain: "rgba(153,27,27,0.34)", pulp: "#ef4444", skin: "#991b1b", seed: "#fde68a", mass: 0.88, radius: 24, splatScale: 1.62, slideSpeed: [0.0038, 0.0062], burst: 26 },
];

const MAX_IMPACTS = 96;
const MAX_PARTICLES = 48;
const MAX_ENTITIES = 20;
const RENDER_DPR_CAP = 1;
const IMPACT_COUNT_UPDATE_MS = 90;
const MIN_DRAG_IMPACT_DISTANCE = 30;
const MIN_DRAG_IMPACT_MS = 60;
const LASER_HOLD_CUT_MS = 22;
const LASER_TIP_RESISTANCE = 0.085;
const LASER_ANGLE_FOLLOW = 0.18;
const LASER_FRESH_GLOW_MS = 3000;
const SLINGER_MAX_PULL = 172;
const SLINGER_MIN_PULL_TO_LAUNCH = 14;
const SLINGER_POWER_DEADZONE = 8;
const SLINGER_SPRITE_SPLAT_LIFE_MULTIPLIER = 2;
type PlaygroundSpriteKey = "arrow" | "burnScorch" | "dragon" | "emberParticle" | "flame" | "impactFlame" | "hammer" | "monsterSheet" | "skeleton" | "spider" | "eggSheet" | "slingerFrame" | "strawberrySheet" | "tomatoSheet" | "watermelonSheet";
type PlaygroundSprites = Partial<Record<PlaygroundSpriteKey, HTMLImageElement>>;
type AddImpactOptions = {
    commitHammerImpact?: boolean;
    heavyHammer?: boolean;
    heavyArrow?: boolean;
    hugeFireball?: boolean;
    impactScale?: number;
    skipSuppress?: boolean;
    toolOverride?: PlaygroundToolId;
};
const SLINGER_PROJECTILE_DEPTH = 250;
const SLINGER_GRAVITY = 0.00072;
const TOMATO_CONTACT_MS = 110;
const TOMATO_BURST_MS = 240;
const TOMATO_SETTLE_MS = 520;
const WATERMELON_CONTACT_MS = 125;
const WATERMELON_BURST_MS = 280;
const WATERMELON_SETTLE_MS = 620;
const DRAGON_SHEET_FRAMES = 16;
const DRAGON_BREATH_FLAME_SHEET_FRAMES = 18;
const DRAGON_IMPACT_FLAME_SHEET_FRAMES = 12;
const EMBER_PARTICLE_SHEET_FRAMES = 12;
const MONSTER_SHEET_FRAMES = 20;
const MONSTER_ATTACK_LIFE_MS = 2850;
const MONSTER_HIT_MS = 1540;
const MONSTER_FRAME_ASPECT = 1;
const DRAGON_FRAME_ASPECT = 1;
const DRAGON_MOUTH_X = 0.22;
const DRAGON_MOUTH_Y = 0.52;
const DRAGON_DOCK_VISIBLE_RATIO = 0.68;
const HAMMER_CURSOR_WIDTH = 142;
const HAMMER_CURSOR_HEIGHT = 248;
const HAMMER_HEAD_CONTACT_X = 23;
const HAMMER_HEAD_CONTACT_Y = 44;
const HAMMER_HAND_PIVOT_X = 78;
const HAMMER_HAND_PIVOT_Y = 214;
const HAMMER_TARGET_OFFSET_X = -140;
const HAMMER_TARGET_OFFSET_Y = 190;
const HAMMER_IDLE_ROTATION = -32;
const HAMMER_WINDUP_ROTATION = -96;
const HAMMER_IMPACT_ROTATION = 16;
const HAMMER_SWING_MS = 620;
const HAMMER_WINDUP_T = 0.18;
const HAMMER_IMPACT_T = 0.44;
const HAMMER_IMPACT_DELAY_MS = HAMMER_SWING_MS * HAMMER_IMPACT_T;
const HEAVY_HAMMER_SWING_MS = 960;
const HEAVY_HAMMER_IMPACT_DELAY_MS = 840;
const HEAVY_HAMMER_IMPACT_SCALE = 2.24;
const ARROW_LIFE_MS = 12000;
const HEAVY_ARROW_LIFE_MS = 16000;
const HEAVY_ARROW_IMPACT_SCALE = 3.05;
const ARROW_FLIGHT_MS = 320;
const ARROW_IMPACT_MS = 540;
const ARROW_FADE_MS = 900;
const dragonSilhouetteCache = new WeakMap<HTMLImageElement, HTMLCanvasElement>();
const dragonHeadCleanFrameCache = new WeakMap<HTMLImageElement, Map<number, HTMLCanvasElement>>();

const closeAlphaMask = (
    source: Uint8ClampedArray,
    width: number,
    height: number,
    iterations: number
): Uint8ClampedArray => {
    let mask: Uint8ClampedArray = new Uint8ClampedArray(width * height);
    for (let index = 0; index < mask.length; index += 1) {
        mask[index] = source[index * 4 + 3] > 10 ? 255 : 0;
    }

    const dilate = (input: Uint8ClampedArray): Uint8ClampedArray => {
        const output = new Uint8ClampedArray(input.length);
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                const index = y * width + x;
                if (input[index] > 0) {
                    output[index] = 255;
                    continue;
                }
                let filled = false;
                for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1) && !filled; yy += 1) {
                    for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
                        if (input[yy * width + xx] > 0) {
                            output[index] = 255;
                            filled = true;
                            break;
                        }
                    }
                }
            }
        }
        return output;
    };

    const erode = (input: Uint8ClampedArray): Uint8ClampedArray => {
        const output = new Uint8ClampedArray(input.length);
        for (let y = 0; y < height; y += 1) {
            for (let x = 0; x < width; x += 1) {
                let solid = true;
                for (let yy = Math.max(0, y - 1); yy <= Math.min(height - 1, y + 1) && solid; yy += 1) {
                    for (let xx = Math.max(0, x - 1); xx <= Math.min(width - 1, x + 1); xx += 1) {
                        if (input[yy * width + xx] === 0) {
                            solid = false;
                            break;
                        }
                    }
                }
                output[y * width + x] = solid ? 255 : 0;
            }
        }
        return output;
    };

    for (let pass = 0; pass < iterations; pass += 1) mask = dilate(mask);
    for (let pass = 0; pass < iterations; pass += 1) mask = erode(mask);
    return mask;
};

const traceRoundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number): void => {
    const r = Math.max(0, Math.min(radius, width / 2, height / 2));
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + width - r, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + r);
    ctx.lineTo(x + width, y + height - r);
    ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    ctx.lineTo(x + r, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
};

const drawReferenceSpider = (ctx: CanvasRenderingContext2D, creature: Creature, now: number, sprite: HTMLImageElement): void => {
    const size = creature.size * (creature.mergeScale ?? 1);
    const speed = Math.hypot(creature.vx, creature.vy);
    const angle = creature.heading ?? (speed > 0.05 ? Math.atan2(creature.vy, creature.vx) : creature.phase);
    const stride = now * (0.006 + Math.min(0.011, speed * 0.008)) + creature.seed;
    const lift = Math.sin(stride * 1.35) * size * 0.03;
    const lateral = Math.sin(stride * 2.05 + creature.seed) * size * (0.012 + speed * 0.01);
    const twitch = (Math.sin(stride * 1.62) + Math.sin(stride * 0.58 + creature.seed)) * 0.022;
    const react = Math.max(0, creature.bumpReact ?? 0) / 34;
    const height = size * (3.25 + react * 0.18);
    const width = height * (sprite.naturalWidth / sprite.naturalHeight);
    const eyeFlicker = 0.34 + Math.max(0, Math.sin(stride * 3.9 + creature.seed)) * 0.28;

    ctx.save();
    ctx.translate(creature.x + lateral, creature.y + lift);
    ctx.rotate(angle + (Math.PI / 2) + twitch);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.save();
    ctx.translate(Math.sin(stride * 1.8) * size * 0.01, Math.cos(stride * 1.42) * size * 0.009);
    ctx.scale(1 + Math.sin(stride) * 0.026, 1 + Math.cos(stride * 1.18) * 0.02);
    ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
    ctx.restore();

    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(248,250,252,0.17)";
    ctx.lineWidth = Math.max(0.7, size * 0.01);
    for (let side = -1; side <= 1; side += 2) {
        for (let leg = 0; leg < 3; leg += 1) {
            const legT = stride * (1.66 + leg * 0.14) + leg * 1.7 + (side > 0 ? 0 : Math.PI);
            const baseY = -height * 0.18 + leg * height * 0.12;
            const baseX = side * width * (0.13 + leg * 0.02);
            const footX = side * width * (0.34 + leg * 0.035) + Math.sin(legT) * size * 0.1;
            const footY = baseY + Math.cos(legT * 0.78) * size * 0.09;
            ctx.beginPath();
            ctx.moveTo(baseX, baseY);
            ctx.quadraticCurveTo(side * width * 0.25, baseY + Math.sin(legT) * size * 0.16, footX, footY);
            ctx.stroke();
        }
    }

    ctx.fillStyle = `rgba(248,113,113,${eyeFlicker})`;
    ctx.shadowColor = "rgba(248,113,113,0.72)";
    ctx.shadowBlur = size * 0.08;
    for (const eyeX of [-0.045, 0.045]) {
        ctx.beginPath();
        ctx.ellipse(eyeX * width, -height * 0.28, Math.max(1.1, size * 0.025), Math.max(0.8, size * 0.015), 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.shadowBlur = 0;

    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = "rgba(226,232,240,0.1)";
    ctx.lineWidth = Math.max(0.55, size * 0.006);
    for (let strand = 0; strand < 4; strand += 1) {
        const y = -height * 0.3 + strand * height * 0.08 + Math.sin(stride + strand) * size * 0.012;
        ctx.beginPath();
        ctx.moveTo(-width * 0.44, y);
        ctx.quadraticCurveTo(Math.sin(stride * 0.4 + strand) * size * 0.16, y + size * 0.08, width * 0.43, y + Math.cos(stride + strand) * size * 0.035);
        ctx.stroke();
    }
    ctx.restore();
};

const drawSpider = (ctx: CanvasRenderingContext2D, creature: Creature, now: number, sprite?: HTMLImageElement): void => {
    if (sprite?.complete && sprite.naturalWidth > 0) {
        drawReferenceSpider(ctx, creature, now, sprite);
        return;
    }

    const size = creature.size * (creature.mergeScale ?? 1);
    const speed = Math.hypot(creature.vx, creature.vy);
    const angle = creature.heading ?? (speed > 0.05 ? Math.atan2(creature.vy, creature.vx) : creature.phase);
    const stride = now * (0.007 + Math.min(0.01, speed * 0.01)) + creature.seed;
    const pulse = Math.max(0, creature.bumpReact ?? 0) / 34;
    const breathe = Math.sin(now * 0.004 + creature.seed) * 0.018;

    ctx.save();
    ctx.translate(creature.x, creature.y);
    ctx.rotate(angle);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const legBases = [
        { x: -0.18, y: -0.26, reach: 0.94, forward: -0.54 },
        { x: -0.1, y: -0.1, reach: 0.78, forward: -0.38 },
        { x: 0.02, y: 0.08, reach: 0.8, forward: -0.3 },
        { x: 0.12, y: 0.22, reach: 0.94, forward: -0.44 },
    ];

    for (let pair = 0; pair < 4; pair += 1) {
        const base = legBases[pair];
        const baseX = size * base.x;
        const baseY = size * base.y;
        for (const side of [-1, 1]) {
            const gait = stride + pair * 1.08 + (side > 0 ? 0 : Math.PI);
            const step = Math.sin(gait) * size * 0.12;
            const lift = Math.max(0, Math.sin(gait)) * size * 0.06;
            const hip = { x: baseX, y: baseY };
            const knee = {
                x: baseX + size * (base.forward * 0.48) + step * 0.36,
                y: side * size * base.reach * 0.38 + lift * 0.28,
            };
            const ankle = {
                x: baseX + size * base.forward + step,
                y: side * size * base.reach * 0.72 - lift * 0.12,
            };
            const foot = {
                x: ankle.x - size * (0.12 + pair * 0.02) + step * 0.18,
                y: side * size * (base.reach * 0.92 + 0.04) + lift * 0.28,
            };

            const legGradient = ctx.createLinearGradient(hip.x, hip.y, foot.x, foot.y);
            legGradient.addColorStop(0, "#17110d");
            legGradient.addColorStop(0.34, "#070707");
            legGradient.addColorStop(0.62, "#2a1d15");
            legGradient.addColorStop(1, "#040404");

            ctx.strokeStyle = legGradient;
            ctx.lineWidth = Math.max(2.4, size * 0.072);
            ctx.beginPath();
            ctx.moveTo(hip.x, hip.y);
            ctx.lineTo(knee.x, knee.y);
            ctx.lineTo(ankle.x, ankle.y);
            ctx.lineTo(foot.x, foot.y);
            ctx.stroke();

            ctx.strokeStyle = "rgba(154,130,103,0.28)";
            ctx.lineWidth = Math.max(0.8, size * 0.018);
            ctx.beginPath();
            ctx.moveTo(hip.x - size * 0.012, hip.y - side * size * 0.015);
            ctx.lineTo(knee.x - size * 0.012, knee.y - side * size * 0.015);
            ctx.lineTo(ankle.x - size * 0.012, ankle.y - side * size * 0.015);
            ctx.lineTo(foot.x - size * 0.012, foot.y - side * size * 0.015);
            ctx.stroke();

            ctx.strokeStyle = "rgba(190,172,148,0.26)";
            ctx.lineWidth = Math.max(0.45, size * 0.007);
            for (let hair = 0; hair < 5; hair += 1) {
                const t = (hair + 1) / 6;
                const hx = knee.x + (foot.x - knee.x) * t;
                const hy = knee.y + (foot.y - knee.y) * t;
                ctx.beginPath();
                ctx.moveTo(hx, hy);
                ctx.lineTo(hx + size * 0.04 * Math.sin(gait + hair), hy + side * size * 0.06);
                ctx.stroke();
            }
        }
    }

    const bodyPulse = 1 + pulse * 0.08;
    const abdomenGradient = ctx.createRadialGradient(-size * 0.23, -size * 0.2, 0, -size * 0.12, size * 0.04, size * 0.58);
    abdomenGradient.addColorStop(0, "#3a2a1d");
    abdomenGradient.addColorStop(0.4, "#15110d");
    abdomenGradient.addColorStop(1, "#030303");
    const thoraxGradient = ctx.createRadialGradient(size * 0.16, -size * 0.12, 0, size * 0.2, 0, size * 0.36);
    thoraxGradient.addColorStop(0, "#31251c");
    thoraxGradient.addColorStop(0.52, "#0d0d0d");
    thoraxGradient.addColorStop(1, "#020202");
    ctx.strokeStyle = "rgba(154,130,103,0.34)";
    ctx.lineWidth = Math.max(1, size * 0.018);

    ctx.save();
    ctx.scale(bodyPulse * (1 + breathe), bodyPulse * (1 - breathe));
    ctx.fillStyle = abdomenGradient;
    ctx.beginPath();
    ctx.ellipse(-size * 0.12, size * 0.05, size * 0.34, size * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = thoraxGradient;
    ctx.beginPath();
    ctx.ellipse(size * 0.24, -size * 0.01, size * 0.25, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    ctx.strokeStyle = "rgba(203,168,121,0.24)";
    ctx.lineWidth = Math.max(0.8, size * 0.009);
    for (let band = -2; band <= 2; band += 1) {
        ctx.beginPath();
        ctx.ellipse(-size * 0.12 + band * size * 0.05, size * 0.05, size * 0.035, size * 0.35, 0, -1.0, 1.0);
        ctx.stroke();
    }

    ctx.strokeStyle = "rgba(216,199,168,0.2)";
    ctx.lineWidth = Math.max(0.65, size * 0.008);
    ctx.beginPath();
    ctx.moveTo(-size * 0.45, -size * 0.02);
    ctx.quadraticCurveTo(-size * 0.54, size * 0.04, -size * 0.6, size * 0.02);
    ctx.moveTo(-size * 0.45, size * 0.11);
    ctx.quadraticCurveTo(-size * 0.54, size * 0.06, -size * 0.6, size * 0.1);
    ctx.stroke();

    ctx.strokeStyle = "rgba(230,214,185,0.22)";
    ctx.lineWidth = Math.max(0.45, size * 0.006);
    for (let hair = 0; hair < 28; hair += 1) {
        const theta = (Math.PI * 2 * hair) / 28;
        const rx = -size * 0.12 + Math.cos(theta) * size * 0.29;
        const ry = size * 0.05 + Math.sin(theta) * size * 0.4;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx + Math.cos(theta) * size * 0.055, ry + Math.sin(theta) * size * 0.055);
        ctx.stroke();
    }

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(215,197,166,0.34)";
    ctx.fillStyle = "rgba(11,8,6,0.94)";
    ctx.lineWidth = Math.max(0.75, size * 0.01);
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.ellipse(size * 0.42, side * size * 0.16, size * 0.05, size * 0.09, side * 0.22, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(size * 0.48, side * size * 0.04);
        ctx.lineTo(size * 0.57, side * size * 0.11);
        ctx.stroke();
    }
    ctx.restore();

    const eyeGlow = 0.5 + Math.sin(now * 0.014 + creature.seed) * 0.18 + pulse * 0.22;
    ctx.fillStyle = `rgba(239,68,68,${eyeGlow})`;
    ctx.shadowColor = "rgba(239,68,68,0.74)";
    ctx.shadowBlur = size * 0.08;
    for (const y of [-0.1, -0.035, 0.035, 0.1]) {
        ctx.beginPath();
        ctx.arc(size * 0.42, y * size, Math.max(1.25, size * 0.022), 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
};

const drawSpiderWeb = (ctx: CanvasRenderingContext2D, web: ActiveWeb, now: number): void => {
    const age = now - web.createdAt;
    const lifeT = Math.max(0, Math.min(1, age / web.life));
    const fadeIn = Math.min(1, lifeT / 0.18);
    const fadeOut = Math.max(0, Math.min(1, (1 - lifeT) / 0.28));
    const alpha = fadeIn * fadeOut;
    if (alpha <= 0) return;

    const strands = 9;
    const rings = 4;
    const sway = Math.sin(now * 0.0018 + web.seed) * web.radius * 0.025;

    ctx.save();
    ctx.translate(web.x, web.y);
    ctx.rotate(web.rotation);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "rgba(226,232,240,0.58)";
    ctx.lineWidth = Math.max(0.7, web.radius * 0.012);
    ctx.shadowColor = "rgba(255,255,255,0.32)";
    ctx.shadowBlur = web.radius * 0.06;

    for (let strand = 0; strand < strands; strand += 1) {
        const angle = (Math.PI * 2 * strand) / strands + Math.sin(web.seed + strand) * 0.08;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(
            Math.cos(angle + 0.18) * web.radius * 0.48 + sway,
            Math.sin(angle + 0.18) * web.radius * 0.48,
            Math.cos(angle) * web.radius,
            Math.sin(angle) * web.radius,
        );
        ctx.stroke();
    }

    for (let ring = 1; ring <= rings; ring += 1) {
        const ringRadius = web.radius * (ring / (rings + 0.35));
        ctx.beginPath();
        for (let strand = 0; strand <= strands; strand += 1) {
            const angle = (Math.PI * 2 * strand) / strands;
            const wobble = Math.sin(web.seed + strand * 1.7 + ring) * web.radius * 0.025;
            const x = Math.cos(angle) * (ringRadius + wobble) + sway * ring * 0.18;
            const y = Math.sin(angle) * (ringRadius + wobble);
            if (strand === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }

    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(1.2, web.radius * 0.025), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
};

type ScreenEntity = {
    id: string;
    canvas: HTMLCanvasElement;
    x: number;
    y: number;
    width: number;
    height: number;
    vx: number;
    vy: number;
    rotation: number;
    spin: number;
    life: number;
    maxLife: number;
    gravity?: number;
    grabbedUntil?: number;
    grabAnchorX?: number;
    grabAnchorY?: number;
};

type ActiveFlame = {
    id: string;
    startX?: number;
    startY?: number;
    x: number;
    y: number;
    radius: number;
    rotation: number;
    seed: number;
    createdAt: number;
    life: number;
};

type ActiveMonsterAttack = {
    id: string;
    x: number;
    y: number;
    radius: number;
    rotation: number;
    seed: number;
    createdAt: number;
    life: number;
    holeStamped: boolean;
};

type ActiveDragonBreath = {
    id: string;
    targetX: number;
    targetY: number;
    x: number;
    y: number;
    width: number;
    height: number;
    mouthX: number;
    mouthY: number;
    mirror: boolean;
    seed: number;
    createdAt: number;
    life: number;
};

type DragonHeadLayout = Pick<ActiveDragonBreath, "x" | "y" | "width" | "height" | "mouthX" | "mouthY" | "mirror">;

type ActiveBurnResidue = {
    id: string;
    x: number;
    y: number;
    radius: number;
    rotation: number;
    seed: number;
    createdAt: number;
    life: number;
};

type ActiveArrow = {
    id: string;
    startX: number;
    startY: number;
    x: number;
    y: number;
    radius: number;
    rotation: number;
    seed: number;
    createdAt: number;
    life: number;
};

type SkeletonShard = {
    id: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    rotation: number;
    spin: number;
    length: number;
    width: number;
    seed: number;
    createdAt: number;
    life: number;
};

type DyingSkeleton = {
    id: string;
    controller: SkeletonController;
};

type ActiveWeb = {
    id: string;
    x: number;
    y: number;
    radius: number;
    rotation: number;
    seed: number;
    createdAt: number;
    life: number;
};

type SlingerState = {
    active: boolean;
    pointerId: number | null;
    anchorX: number;
    anchorY: number;
    pullX: number;
    pullY: number;
    targetPullX: number;
    targetPullY: number;
    chargeStartAt: number;
    seed: number;
};

type FruitProjectile = {
    id: string;
    food: ThrowFoodId;
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    radius: number;
    rotation: number;
    spin: number;
    seed: number;
    createdAt: number;
};

type FruitSplat = {
    id: string;
    food: ThrowFoodId;
    x: number;
    y: number;
    originY: number;
    radius: number;
    rotation: number;
    scaleX: number;
    scaleY: number;
    slideSpeed: number;
    seed: number;
    createdAt: number;
    life: number;
};

type LaserCutState = {
    active: boolean;
    pointerId: number | null;
    holdStartAt: number;
    targetX: number;
    targetY: number;
    tipX: number;
    tipY: number;
    lastTipX: number;
    lastTipY: number;
    lastEmitAt: number;
    lastShardAt: number;
    angle: number;
    initialized: boolean;
};

type LaserTrailSegment = {
    id: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    angle: number;
    width: number;
    createdAt: number;
    life: number;
};

type LaserSpark = {
    id: string;
    x: number;
    y: number;
    prevX: number;
    prevY: number;
    vx: number;
    vy: number;
    width: number;
    createdAt: number;
    life: number;
    bounces: number;
};

const createLaserCutState = (): LaserCutState => ({
    active: false,
    pointerId: null,
    holdStartAt: 0,
    targetX: -999,
    targetY: -999,
    tipX: -999,
    tipY: -999,
    lastTipX: -999,
    lastTipY: -999,
    lastEmitAt: 0,
    lastShardAt: 0,
    angle: -0.62,
    initialized: false,
});

const createSlingerState = (): SlingerState => ({
    active: false,
    pointerId: null,
    anchorX: -999,
    anchorY: -999,
    pullX: -999,
    pullY: -999,
    targetPullX: -999,
    targetPullY: -999,
    chargeStartAt: 0,
    seed: 0,
});

const easeOutCubic = (value: number) => 1 - ((1 - value) ** 3);

const rotatePoint = (x: number, y: number, degrees: number) => {
    const radians = degrees * (Math.PI / 180);
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
        x: x * cos - y * sin,
        y: x * sin + y * cos,
    };
};

const getHammerHandleForTarget = (targetX: number, targetY: number, rotation: number, scale: number) => {
    const contactFromPivot = rotatePoint(
        (HAMMER_HEAD_CONTACT_X - HAMMER_HAND_PIVOT_X) * scale,
        (HAMMER_HEAD_CONTACT_Y - HAMMER_HAND_PIVOT_Y) * scale,
        rotation,
    );
    return {
        x: targetX - contactFromPivot.x,
        y: targetY - contactFromPivot.y,
    };
};

const loadImage = (src: string): Promise<HTMLImageElement> => new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
});

const getCanvasPoint = (event: React.PointerEvent<HTMLCanvasElement>, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
    };
};

const getBackgroundDrawRect = (surfaceWidth: number, surfaceHeight: number, imageWidth: number, imageHeight: number) => {
    const scale = Math.max(surfaceWidth / imageWidth, surfaceHeight / imageHeight);
    const width = imageWidth * scale;
    const height = imageHeight * scale;
    return {
        x: (surfaceWidth - width) / 2,
        y: (surfaceHeight - height) / 2,
        width,
        height,
        scale,
    };
};

const colorDistance = (r: number, g: number, b: number, base: { r: number; g: number; b: number }) => {
    const dr = r - base.r;
    const dg = g - base.g;
    const db = b - base.b;
    return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
};

const saturation = (r: number, g: number, b: number) => Math.max(r, g, b) - Math.min(r, g, b);
const luminance = (r: number, g: number, b: number) => (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
const smoothStep = (edge0: number, edge1: number, value: number) => {
    const t = Math.max(0, Math.min(1, (value - edge0) / Math.max(0.0001, edge1 - edge0)));
    return t * t * (3 - (2 * t));
};

const clampValue = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const flameNoise = (seed: number, offset: number) => {
    const value = Math.sin((seed + offset) * 12.9898) * 43758.5453;
    return value - Math.floor(value);
};

const clampSlingerPull = (anchorX: number, anchorY: number, pullX: number, pullY: number) => {
    const dx = pullX - anchorX;
    const dy = pullY - anchorY;
    const distance = Math.hypot(dx, dy);
    if (distance <= SLINGER_MAX_PULL) {
        return { x: pullX, y: pullY, distance };
    }
    const scale = SLINGER_MAX_PULL / Math.max(1, distance);
    return {
        x: anchorX + dx * scale,
        y: anchorY + dy * scale,
        distance: SLINGER_MAX_PULL,
    };
};

const colorWithAlpha = (color: string, alpha: number): string => {
    const clamped = Math.max(0, Math.min(1, alpha));
    const hex = color.trim().match(/^#([0-9a-f]{6})$/i);
    if (hex) {
        const value = hex[1];
        const red = Number.parseInt(value.slice(0, 2), 16);
        const green = Number.parseInt(value.slice(2, 4), 16);
        const blue = Number.parseInt(value.slice(4, 6), 16);
        return `rgba(${red},${green},${blue},${clamped})`;
    }
    const rgba = color.trim().match(/^rgba?\(([^)]+)\)$/i);
    if (rgba) {
        const parts = rgba[1].split(",").map((part) => Number.parseFloat(part.trim()));
        if (parts.length >= 3 && parts.every((part, index) => index >= 3 || Number.isFinite(part))) {
            return `rgba(${parts[0]},${parts[1]},${parts[2]},${clamped})`;
        }
    }
    return color;
};

const foodStyle = (food: ThrowFoodId) => THROW_FOODS.find((item) => item.id === food) ?? THROW_FOODS[0];

const SLINGER_FOOD_SHEET_FRAMES = 9;

const getSlingerFoodSheet = (sprites: PlaygroundSprites | undefined, food: ThrowFoodId): HTMLImageElement | undefined => {
    if (food === "egg") return sprites?.eggSheet;
    if (food === "strawberry") return sprites?.strawberrySheet;
    if (food === "tomato") return sprites?.tomatoSheet;
    if (food === "watermelon") return sprites?.watermelonSheet;
    return undefined;
};

const getSlingerFoodTimeline = (food: ThrowFoodId) => {
    if (food === "egg") return { contact: 78, burst: 160, settle: 330 };
    if (food === "strawberry") return { contact: 86, burst: 180, settle: 360 };
    if (food === "watermelon") return { contact: 96, burst: 210, settle: 420 };
    return { contact: 84, burst: 190, settle: 380 };
};

const getSlingerSplatFrame = (food: ThrowFoodId, age: number): number => {
    const timeline = getSlingerFoodTimeline(food);
    if (age < timeline.contact) {
        return 2 + smoothStep(0, timeline.contact, age);
    }
    if (age < timeline.contact + timeline.burst) {
        return 3 + (smoothStep(0, timeline.burst, age - timeline.contact) * 2);
    }
    if (age < timeline.contact + timeline.burst + timeline.settle) {
        return 5 + (smoothStep(0, timeline.settle, age - timeline.contact - timeline.burst) * 3);
    }
    return 8;
};

const drawSlingerFoodFrame = (
    ctx: CanvasRenderingContext2D,
    sheet: HTMLImageElement,
    frame: number,
    x: number,
    y: number,
    radius: number,
    rotation = 0,
    alpha = 1,
    drawScale = 1,
) => {
    const frameWidth = sheet.width / SLINGER_FOOD_SHEET_FRAMES;
    const frameHeight = sheet.height;
    const drawWidth = radius * 4.9 * drawScale;
    const drawHeight = drawWidth * (frameHeight / frameWidth);
    const clampedFrame = Math.max(0, Math.min(SLINGER_FOOD_SHEET_FRAMES - 1, frame));
    const baseFrame = Math.floor(clampedFrame);
    const nextFrame = Math.min(SLINGER_FOOD_SHEET_FRAMES - 1, baseFrame + 1);
    const mix = clampedFrame - baseFrame;

    const drawFrame = (frameIndex: number, frameAlpha: number) => {
        if (frameAlpha <= 0) return;
        ctx.globalAlpha *= frameAlpha;
        ctx.drawImage(
            sheet,
            frameWidth * frameIndex,
            0,
            frameWidth,
            frameHeight,
            -drawWidth / 2,
            -drawHeight / 2,
            drawWidth,
            drawHeight,
        );
        ctx.globalAlpha /= frameAlpha;
    };

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.globalAlpha *= alpha;
    drawFrame(baseFrame, 1 - mix);
    drawFrame(nextFrame, mix);
    ctx.restore();
};

const drawSlingerFoodObject = (
    ctx: CanvasRenderingContext2D,
    food: ThrowFoodId,
    radius: number,
    seed: number,
    sprites?: PlaygroundSprites,
) => {
    const sheet = getSlingerFoodSheet(sprites, food);
    if (sheet) {
        drawSlingerFoodFrame(ctx, sheet, 0, 0, 0, radius);
        return;
    }
};

const drawFoodObject = (ctx: CanvasRenderingContext2D, food: ThrowFoodId, radius: number, seed: number) => {
    const style = foodStyle(food);
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    
    // Ambient shadow
    ctx.shadowColor = "rgba(15,23,42,0.42)";
    ctx.shadowBlur = radius * 0.22;
    ctx.shadowOffsetY = radius * 0.12;

    if (food === "egg") {
        // Egg body with better shading
        const eggGrad = ctx.createRadialGradient(-radius * 0.15, -radius * 0.2, 0, 0, 0, radius);
        eggGrad.addColorStop(0, "#ffffff");
        eggGrad.addColorStop(0.5, "#f1f5f9");
        eggGrad.addColorStop(1, "#cbd5e1");
        ctx.fillStyle = eggGrad;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.78, radius * 0.98, -0.18, 0, Math.PI * 2);
        ctx.fill();
        
        // Specular highlight
        ctx.fillStyle = "rgba(255,255,255,0.72)";
        ctx.beginPath();
        ctx.ellipse(-radius * 0.26, -radius * 0.34, radius * 0.18, radius * 0.28, -0.55, 0, Math.PI * 2);
        ctx.fill();
    } else {
        const squashY = food === "watermelon" ? 0.72 : food === "strawberry" ? 1.08 : 0.92;
        const mainGrad = ctx.createRadialGradient(-radius * 0.2, -radius * 0.2, 0, 0, 0, radius);
        
        if (food === "watermelon") {
            mainGrad.addColorStop(0, "#22c55e");
            mainGrad.addColorStop(0.34, "#84cc16");
            mainGrad.addColorStop(0.72, "#166534");
            mainGrad.addColorStop(1, "#052e16");
            ctx.fillStyle = mainGrad;
            ctx.beginPath();
            ctx.ellipse(0, 0, radius * 1.02, radius * 0.98, 0, 0, Math.PI * 2);
            ctx.fill();
            
            ctx.strokeStyle = "rgba(187,247,208,0.34)";
            ctx.lineWidth = radius * 0.11;
            for (let s = -3; s <= 3; s++) {
                ctx.beginPath();
                ctx.moveTo(s * radius * 0.24, -radius * 0.92);
                ctx.bezierCurveTo(
                    s * radius * 0.4,
                    -radius * 0.42,
                    s * radius * 0.34,
                    radius * 0.36,
                    s * radius * 0.2,
                    radius * 0.92,
                );
                ctx.stroke();
            }
        } else if (food === "strawberry") {
            mainGrad.addColorStop(0, "#fb7185");
            mainGrad.addColorStop(0.6, "#e11d48");
            mainGrad.addColorStop(1, "#9f1239");
            ctx.fillStyle = mainGrad;
            ctx.beginPath();
            ctx.ellipse(0, 0, radius * 0.88, radius * 1.12, 0, 0, Math.PI * 2);
            ctx.fill();
        } else { // Tomato
            mainGrad.addColorStop(0, "#fecaca");
            mainGrad.addColorStop(0.38, "#ef4444");
            mainGrad.addColorStop(0.78, "#dc2626");
            mainGrad.addColorStop(1, "#7f1d1d");
            ctx.fillStyle = mainGrad;
            ctx.beginPath();
            ctx.ellipse(0, radius * 0.02, radius * 1.02, radius * 0.94, 0, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = "rgba(127,29,29,0.26)";
            ctx.lineWidth = Math.max(1, radius * 0.045);
            for (let crease = -1; crease <= 1; crease += 1) {
                ctx.beginPath();
                ctx.moveTo(crease * radius * 0.18, -radius * 0.72);
                ctx.quadraticCurveTo(crease * radius * 0.34, -radius * 0.1, crease * radius * 0.16, radius * 0.72);
                ctx.stroke();
            }
        }
        
        // Shine/Highlights
        ctx.fillStyle = "rgba(255,255,255,0.32)";
        ctx.beginPath();
        ctx.ellipse(-radius * 0.35, -radius * 0.3, radius * 0.26, radius * 0.16, -0.44, 0, Math.PI * 2);
        ctx.fill();
        
        // Seeds/Details
        if (food === "strawberry") {
            ctx.fillStyle = style.seed ?? "#fde68a";
            const detailCount = food === "strawberry" ? 18 : 8;
            for (let i = 0; i < detailCount; i += 1) {
                const noise = flameNoise(seed, i * 19.17);
                const angle = noise * Math.PI * 2;
                const dist = radius * (0.24 + flameNoise(seed + 1, i * 7.3) * 0.55);
                ctx.save();
                ctx.translate(Math.cos(angle) * dist, Math.sin(angle) * dist * squashY);
                ctx.rotate(angle);
                ctx.beginPath();
                ctx.ellipse(0, 0, radius * 0.035, radius * 0.065, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        }
        
        // Green stem for tomato/strawberry
        if (food === "tomato" || food === "strawberry") {
            ctx.fillStyle = "#166534";
            ctx.beginPath();
            const stemY = food === "strawberry" ? -radius * 1.05 : -radius * 0.88;
            ctx.moveTo(0, stemY);
            for (let leaf = 0; leaf < 5; leaf++) {
                const la = (leaf * Math.PI * 2) / 5;
                const lr = radius * 0.34;
                ctx.lineTo(Math.cos(la) * lr, stemY + Math.sin(la) * lr * 0.5);
                ctx.lineTo(Math.cos(la + 0.3) * lr * 0.4, stemY + Math.sin(la + 0.3) * lr * 0.2);
            }
            ctx.closePath();
            ctx.fill();
            
            // Stem nub
            ctx.fillStyle = "#14532d";
            ctx.beginPath();
            ctx.arc(0, stemY, radius * 0.08, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    ctx.restore();
};

const createFruitBurstParticles = (food: ThrowFoodId, x: number, y: number, angle: number, seed: number): Particle[] => {
    const style = foodStyle(food);
    const profile = style;
    const colors = food === "egg"
        ? ["rgba(255,255,255,0.92)", "#facc15", "#f59e0b", "rgba(254,243,199,0.72)"]
        : food === "watermelon"
            ? ["#fb7185", "#f43f5e", "#111827", "#16a34a"]
            : food === "strawberry"
                ? ["#e11d48", "#be123c", "#fef08a", "#7f1d1d"]
                : ["#ef4444", "#dc2626", "#fde68a", "#991b1b"];
    const particles: Particle[] = [];
    for (let index = 0; index < profile.burst; index += 1) {
        const sideSpray = angle + Math.PI + (flameNoise(seed, index * 13.7) - 0.5) * Math.PI * 1.45;
        const randomSpray = flameNoise(seed + 11, index * 8.1) * Math.PI * 2;
        const useSide = index < profile.burst * 0.72;
        const theta = useSide ? sideSpray : randomSpray;
        const speed = 1.2 + flameNoise(seed + 19, index * 5.3) * (food === "watermelon" ? 5.2 : 7.4);
        const isSeed = (food === "watermelon" && index % 5 === 0) || (food === "strawberry" && index % 6 === 0);
        particles.push({
            id: `fruit-particle-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`,
            x,
            y,
            vx: Math.cos(theta) * speed,
            vy: Math.sin(theta) * speed - (0.2 + flameNoise(seed + 29, index * 4.9) * 1.8),
            life: 38 + flameNoise(seed + 31, index * 7.7) * 42,
            maxLife: 80,
            size: isSeed ? 2.4 : 3.8 + flameNoise(seed + 37, index * 2.1) * 5.6,
            color: isSeed ? (style.seed ?? colors[index % colors.length]) : colors[index % colors.length],
            spin: (flameNoise(seed + 43, index * 3.3) - 0.5) * 0.18,
            shape: isSeed ? "spark" : "pixel",
        });
    }
    return particles;
};

const drawTomatoGlassCracks = (ctx: CanvasRenderingContext2D, radius: number, seed: number, intensity: number) => {
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let shard = 0; shard < 24; shard += 1) {
        const theta = (Math.PI * 2 * shard) / 24 + (flameNoise(seed + 101, shard * 4.7) - 0.5) * 0.42;
        const inner = radius * (0.38 + flameNoise(seed + 107, shard * 6.2) * 0.22);
        const outer = radius * (0.9 + flameNoise(seed + 113, shard * 9.3) * 1.08) * intensity;
        const kink = theta + (flameNoise(seed + 127, shard * 5.1) - 0.5) * 0.34;
        ctx.strokeStyle = `rgba(220,245,255,${(0.14 + flameNoise(seed + 131, shard * 7.8) * 0.18) * intensity})`;
        ctx.lineWidth = Math.max(0.7, radius * (0.009 + flameNoise(seed + 139, shard * 2.4) * 0.014));
        ctx.beginPath();
        ctx.moveTo(Math.cos(theta) * inner, Math.sin(theta) * inner * 0.72);
        ctx.lineTo(Math.cos(kink) * outer, Math.sin(kink) * outer * 0.78);
        ctx.stroke();
    }

    for (let shard = 0; shard < 10; shard += 1) {
        const theta = flameNoise(seed + 151, shard * 8.9) * Math.PI * 2;
        const dist = radius * (0.74 + flameNoise(seed + 157, shard * 3.6) * 0.94) * intensity;
        const size = radius * (0.06 + flameNoise(seed + 163, shard * 6.4) * 0.09);
        ctx.save();
        ctx.translate(Math.cos(theta) * dist, Math.sin(theta) * dist * 0.72);
        ctx.rotate(theta + flameNoise(seed + 167, shard * 5.5));
        ctx.fillStyle = `rgba(220,245,255,${0.08 + flameNoise(seed + 173, shard * 2.8) * 0.12})`;
        ctx.strokeStyle = `rgba(255,255,255,${0.12 * intensity})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(-size, size * 0.2);
        ctx.lineTo(size * 0.72, -size * 0.42);
        ctx.lineTo(size * 0.28, size * 0.86);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();
};

const drawTomatoSlice = (ctx: CanvasRenderingContext2D, radius: number, seed: number, burstT: number) => {
    const skin = ctx.createRadialGradient(-radius * 0.14, -radius * 0.12, 0, 0, 0, radius * 1.08);
    skin.addColorStop(0, "#fecaca");
    skin.addColorStop(0.34, "#ef4444");
    skin.addColorStop(0.76, "#b91c1c");
    skin.addColorStop(1, "#7f1d1d");
    ctx.fillStyle = skin;
    ctx.beginPath();
    const lobes = 28;
    for (let lobe = 0; lobe <= lobes; lobe += 1) {
        const theta = (Math.PI * 2 * lobe) / lobes;
        const wobble = 0.9 + Math.sin(theta * 5 + seed) * 0.035 + (flameNoise(seed + 181, lobe * 3.1) - 0.5) * 0.08;
        const x = Math.cos(theta) * radius * wobble;
        const y = Math.sin(theta) * radius * (0.82 + (flameNoise(seed + 187, lobe * 5.2) - 0.5) * 0.08);
        if (lobe === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "rgba(127,29,29,0.8)";
    ctx.lineWidth = Math.max(2.2, radius * 0.075);
    ctx.stroke();

    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.82);
    core.addColorStop(0, "rgba(254,202,202,0.9)");
    core.addColorStop(0.34, "rgba(248,113,113,0.84)");
    core.addColorStop(1, "rgba(127,29,29,0.1)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(0, 0, radius * 0.76, radius * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let chamber = 0; chamber < 6; chamber += 1) {
        const theta = (Math.PI * 2 * chamber) / 6 + 0.12;
        ctx.save();
        ctx.rotate(theta);
        const chamberGradient = ctx.createRadialGradient(radius * 0.34, 0, 0, radius * 0.34, 0, radius * 0.28);
        chamberGradient.addColorStop(0, "rgba(254,240,138,0.72)");
        chamberGradient.addColorStop(0.46, "rgba(248,113,113,0.78)");
        chamberGradient.addColorStop(1, "rgba(127,29,29,0.12)");
        ctx.fillStyle = chamberGradient;
        ctx.beginPath();
        ctx.ellipse(radius * 0.34, 0, radius * 0.26, radius * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(254,202,202,0.24)";
        ctx.lineWidth = Math.max(1, radius * 0.026);
        ctx.stroke();
        ctx.restore();
    }

    ctx.strokeStyle = "rgba(254,202,202,0.42)";
    ctx.lineWidth = Math.max(1, radius * 0.028);
    for (let rib = 0; rib < 10; rib += 1) {
        const theta = (Math.PI * 2 * rib) / 10 + (flameNoise(seed + 193, rib * 3.8) - 0.5) * 0.22;
        ctx.beginPath();
        ctx.moveTo(Math.cos(theta) * radius * 0.12, Math.sin(theta) * radius * 0.08);
        ctx.quadraticCurveTo(
            Math.cos(theta) * radius * 0.42,
            Math.sin(theta) * radius * 0.32,
            Math.cos(theta) * radius * 0.72,
            Math.sin(theta) * radius * 0.54,
        );
        ctx.stroke();
    }

    ctx.fillStyle = "#fde68a";
    for (let seedIndex = 0; seedIndex < 34; seedIndex += 1) {
        const theta = flameNoise(seed + 199, seedIndex * 4.1) * Math.PI * 2;
        const dist = radius * (0.18 + flameNoise(seed + 211, seedIndex * 7.3) * 0.5);
        ctx.save();
        ctx.translate(Math.cos(theta) * dist, Math.sin(theta) * dist * 0.56);
        ctx.rotate(theta);
        ctx.globalAlpha = 0.62 + flameNoise(seed + 223, seedIndex * 2.2) * 0.32;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 0.025, radius * 0.052, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(255,255,255,${0.16 + burstT * 0.08})`;
    ctx.beginPath();
    ctx.ellipse(-radius * 0.26, -radius * 0.24, radius * 0.28, radius * 0.1, -0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
};

const drawTomatoSplat = (ctx: CanvasRenderingContext2D, splat: FruitSplat, now: number) => {
    const age = now - splat.createdAt;
    const contactT = Math.max(0, Math.min(1, age / TOMATO_CONTACT_MS));
    const burstT = Math.max(0, Math.min(1, (age - TOMATO_CONTACT_MS) / TOMATO_BURST_MS));
    const settleT = Math.max(0, Math.min(1, (age - TOMATO_CONTACT_MS - TOMATO_BURST_MS) / TOMATO_SETTLE_MS));
    const pop = 0.62 + easeOutCubic(contactT) * 0.5 + Math.sin(Math.min(1, burstT) * Math.PI) * 0.14;
    const dripAlpha = smoothStep(0.08, 1, settleT);

    ctx.save();
    ctx.translate(splat.x, splat.y);
    ctx.rotate(splat.rotation * 0.32);
    ctx.scale(splat.scaleX * pop, splat.scaleY * (0.82 + easeOutCubic(contactT) * 0.28));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawTomatoGlassCracks(ctx, splat.radius, splat.seed, Math.max(contactT, burstT * 0.86));

    ctx.save();
    ctx.globalAlpha = 0.38 + burstT * 0.42;
    ctx.fillStyle = "rgba(127,29,29,0.38)";
    for (let splash = 0; splash < 22; splash += 1) {
        const theta = flameNoise(splat.seed + 229, splash * 3.7) * Math.PI * 2;
        const dist = splat.radius * (0.68 + flameNoise(splat.seed + 233, splash * 8.5) * 0.96) * Math.max(0.58, burstT);
        const length = splat.radius * (0.12 + flameNoise(splat.seed + 239, splash * 2.4) * 0.28);
        ctx.save();
        ctx.translate(Math.cos(theta) * dist, Math.sin(theta) * dist * 0.74);
        ctx.rotate(theta);
        ctx.beginPath();
        ctx.ellipse(0, 0, length, splat.radius * (0.025 + flameNoise(splat.seed + 241, splash * 4.6) * 0.035), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "rgba(153,27,27,0.34)";
    ctx.shadowBlur = splat.radius * 0.22;
    drawTomatoSlice(ctx, splat.radius, splat.seed, burstT);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = dripAlpha;
    for (let drip = 0; drip < 8; drip += 1) {
        const offset = (flameNoise(splat.seed + 251, drip * 5.9) - 0.5) * splat.radius * 1.15;
        const startY = splat.radius * (0.32 + flameNoise(splat.seed + 257, drip * 7.1) * 0.34);
        const length = splat.radius * (0.58 + flameNoise(splat.seed + 263, drip * 4.3) * 1.38) * (0.32 + settleT * 0.86);
        const width = Math.max(2, splat.radius * (0.05 + flameNoise(splat.seed + 269, drip * 2.7) * 0.07));
        const gradient = ctx.createLinearGradient(offset, startY, offset, startY + length);
        gradient.addColorStop(0, "rgba(239,68,68,0.78)");
        gradient.addColorStop(0.58, "rgba(153,27,27,0.56)");
        gradient.addColorStop(1, "rgba(153,27,27,0)");
        ctx.strokeStyle = gradient;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(offset, startY);
        ctx.bezierCurveTo(
            offset + Math.sin(splat.seed + drip) * splat.radius * 0.14,
            startY + length * 0.28,
            offset - Math.cos(splat.seed + drip) * splat.radius * 0.12,
            startY + length * 0.72,
            offset + Math.sin(splat.seed * 0.3 + drip) * splat.radius * 0.1,
            startY + length,
        );
        ctx.stroke();

        ctx.fillStyle = "rgba(185,28,28,0.58)";
        ctx.beginPath();
        ctx.ellipse(offset, startY + length, width * 0.72, width, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.restore();
};

const drawWatermelonRindChunks = (ctx: CanvasRenderingContext2D, radius: number, seed: number, burstT: number) => {
    ctx.save();
    for (let chunk = 0; chunk < 18; chunk += 1) {
        const theta = flameNoise(seed + 281, chunk * 5.2) * Math.PI * 2;
        const dist = radius * (0.58 + flameNoise(seed + 287, chunk * 8.4) * 0.78) * (0.72 + burstT * 0.5);
        const width = radius * (0.12 + flameNoise(seed + 293, chunk * 2.6) * 0.18);
        const height = radius * (0.045 + flameNoise(seed + 307, chunk * 4.1) * 0.08);
        ctx.save();
        ctx.translate(Math.cos(theta) * dist, Math.sin(theta) * dist * 0.74);
        ctx.rotate(theta + (flameNoise(seed + 311, chunk * 6.7) - 0.5) * 1.4);
        ctx.fillStyle = chunk % 4 === 0 ? "#fef3c7" : chunk % 3 === 0 ? "#84cc16" : "#166534";
        ctx.strokeStyle = "rgba(6,78,59,0.48)";
        ctx.lineWidth = Math.max(1, radius * 0.014);
        ctx.beginPath();
        ctx.moveTo(-width * 0.72, -height);
        ctx.lineTo(width * 0.82, -height * 0.46);
        ctx.lineTo(width * 0.5, height);
        ctx.lineTo(-width, height * 0.56);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }
    ctx.restore();
};

const drawWatermelonFlesh = (ctx: CanvasRenderingContext2D, radius: number, seed: number, burstT: number, settleT: number) => {
    const rindAlpha = 1 - smoothStep(0.18, 0.82, settleT);
    if (rindAlpha > 0.02) {
        ctx.save();
        ctx.globalAlpha = rindAlpha;
        const rind = ctx.createRadialGradient(-radius * 0.12, -radius * 0.16, radius * 0.28, 0, 0, radius * 1.08);
        rind.addColorStop(0, "#86efac");
        rind.addColorStop(0.48, "#22c55e");
        rind.addColorStop(0.82, "#166534");
        rind.addColorStop(1, "#064e3b");
        ctx.fillStyle = rind;
        ctx.beginPath();
        ctx.ellipse(-radius * 0.18, 0, radius * 0.82, radius * 0.74, 0, 0.74, Math.PI * 2.08);
        ctx.lineTo(radius * 0.66, radius * 0.36);
        ctx.quadraticCurveTo(radius * 0.1, radius * 0.62, -radius * 0.64, radius * 0.18);
        ctx.closePath();
        ctx.fill();

        ctx.strokeStyle = "rgba(6,78,59,0.52)";
        ctx.lineWidth = Math.max(2, radius * 0.055);
        for (let stripe = -2; stripe <= 2; stripe += 1) {
            ctx.beginPath();
            ctx.moveTo(-radius * 0.18 + stripe * radius * 0.18, -radius * 0.64);
            ctx.bezierCurveTo(
                -radius * 0.04 + stripe * radius * 0.26,
                -radius * 0.3,
                -radius * 0.12 + stripe * radius * 0.22,
                radius * 0.24,
                -radius * 0.28 + stripe * radius * 0.16,
                radius * 0.6,
            );
            ctx.stroke();
        }
        ctx.restore();
    }

    const flesh = ctx.createRadialGradient(0, -radius * 0.02, 0, 0, 0, radius * 0.98);
    flesh.addColorStop(0, "#fecaca");
    flesh.addColorStop(0.24, "#fb7185");
    flesh.addColorStop(0.68, "#dc2626");
    flesh.addColorStop(1, "rgba(127,29,29,0.52)");
    ctx.fillStyle = flesh;
    ctx.beginPath();
    const biteLobes = 18;
    for (let lobe = 0; lobe <= biteLobes; lobe += 1) {
        const theta = (Math.PI * 2 * lobe) / biteLobes;
        const wobble = 0.68 + flameNoise(seed + 317, lobe * 7.5) * 0.38 + Math.sin(theta * 7 + seed) * 0.08;
        const x = Math.cos(theta) * radius * wobble;
        const y = Math.sin(theta) * radius * (0.48 + flameNoise(seed + 331, lobe * 3.9) * 0.26);
        if (lobe === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `rgba(254,243,199,${0.72 * rindAlpha})`;
    ctx.lineWidth = Math.max(2, radius * 0.05);
    ctx.beginPath();
    ctx.arc(-radius * 0.08, radius * 0.02, radius * 0.62, -0.98, 1.08);
    ctx.stroke();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(255,255,255,${0.1 + burstT * 0.12})`;
    ctx.beginPath();
    ctx.ellipse(-radius * 0.34, -radius * 0.28, radius * 0.24, radius * 0.09, -0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
};

const drawWatermelonSplat = (ctx: CanvasRenderingContext2D, splat: FruitSplat, now: number) => {
    const age = now - splat.createdAt;
    const contactT = Math.max(0, Math.min(1, age / WATERMELON_CONTACT_MS));
    const burstT = Math.max(0, Math.min(1, (age - WATERMELON_CONTACT_MS) / WATERMELON_BURST_MS));
    const settleT = Math.max(0, Math.min(1, (age - WATERMELON_CONTACT_MS - WATERMELON_BURST_MS) / WATERMELON_SETTLE_MS));
    const pop = 0.58 + easeOutCubic(contactT) * 0.56 + Math.sin(burstT * Math.PI) * 0.2;
    const dripAlpha = smoothStep(0.05, 1, settleT);

    ctx.save();
    ctx.translate(splat.x, splat.y);
    ctx.rotate(splat.rotation * 0.22);
    ctx.scale(splat.scaleX * pop, splat.scaleY * (0.8 + easeOutCubic(contactT) * 0.24));
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    drawTomatoGlassCracks(ctx, splat.radius * 1.06, splat.seed + 37, Math.max(contactT, burstT * 0.92));

    ctx.save();
    ctx.globalAlpha = 0.36 + burstT * 0.48;
    ctx.fillStyle = "rgba(185,28,28,0.44)";
    for (let splash = 0; splash < 30; splash += 1) {
        const theta = flameNoise(splat.seed + 337, splash * 3.4) * Math.PI * 2;
        const dist = splat.radius * (0.7 + flameNoise(splat.seed + 347, splash * 6.6) * 1.14) * Math.max(0.52, burstT);
        const length = splat.radius * (0.1 + flameNoise(splat.seed + 353, splash * 2.9) * 0.32);
        ctx.save();
        ctx.translate(Math.cos(theta) * dist, Math.sin(theta) * dist * 0.74);
        ctx.rotate(theta);
        ctx.beginPath();
        ctx.ellipse(0, 0, length, splat.radius * (0.022 + flameNoise(splat.seed + 359, splash * 4.8) * 0.034), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    ctx.restore();

    drawWatermelonRindChunks(ctx, splat.radius, splat.seed, burstT);

    ctx.save();
    ctx.shadowColor = "rgba(185,28,28,0.38)";
    ctx.shadowBlur = splat.radius * 0.24;
    drawWatermelonFlesh(ctx, splat.radius, splat.seed, burstT, settleT);
    ctx.restore();

    ctx.fillStyle = "#111827";
    ctx.strokeStyle = "rgba(255,255,255,0.26)";
    ctx.lineWidth = Math.max(0.7, splat.radius * 0.012);
    for (let seedIndex = 0; seedIndex < 42; seedIndex += 1) {
        const theta = flameNoise(splat.seed + 367, seedIndex * 5.1) * Math.PI * 2;
        const dist = splat.radius * (0.18 + flameNoise(splat.seed + 373, seedIndex * 7.7) * 0.62);
        ctx.save();
        ctx.translate(Math.cos(theta) * dist, Math.sin(theta) * dist * 0.58);
        ctx.rotate(theta + Math.PI / 2);
        ctx.beginPath();
        ctx.ellipse(0, 0, splat.radius * 0.032, splat.radius * 0.066, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = dripAlpha;
    for (let drip = 0; drip < 10; drip += 1) {
        const offset = (flameNoise(splat.seed + 379, drip * 5.4) - 0.5) * splat.radius * 1.28;
        const startY = splat.radius * (0.28 + flameNoise(splat.seed + 383, drip * 7.8) * 0.36);
        const length = splat.radius * (0.7 + flameNoise(splat.seed + 389, drip * 3.5) * 1.55) * (0.28 + settleT * 0.92);
        const width = Math.max(2.4, splat.radius * (0.052 + flameNoise(splat.seed + 397, drip * 2.2) * 0.08));
        const gradient = ctx.createLinearGradient(offset, startY, offset, startY + length);
        gradient.addColorStop(0, "rgba(251,113,133,0.82)");
        gradient.addColorStop(0.54, "rgba(185,28,28,0.62)");
        gradient.addColorStop(1, "rgba(127,29,29,0)");
        ctx.strokeStyle = gradient;
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(offset, startY);
        ctx.bezierCurveTo(
            offset + Math.sin(splat.seed + drip) * splat.radius * 0.16,
            startY + length * 0.24,
            offset - Math.cos(splat.seed + drip) * splat.radius * 0.18,
            startY + length * 0.7,
            offset + Math.sin(splat.seed * 0.25 + drip) * splat.radius * 0.12,
            startY + length,
        );
        ctx.stroke();

        if (drip % 2 === 0) {
            ctx.fillStyle = "#111827";
            ctx.beginPath();
            ctx.ellipse(offset + width * 0.4, startY + length * 0.72, width * 0.22, width * 0.42, 0.2, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.fillStyle = "rgba(185,28,28,0.62)";
        ctx.beginPath();
        ctx.ellipse(offset, startY + length, width * 0.72, width, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    ctx.restore();
};

const drawSplatShape = (ctx: CanvasRenderingContext2D, splat: FruitSplat) => {
    const style = foodStyle(splat.food);
    const radius = splat.radius;
    ctx.save();
    ctx.translate(splat.x, splat.y);
    ctx.rotate(splat.rotation);
    ctx.scale(splat.scaleX, splat.scaleY);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalCompositeOperation = "source-over";
    ctx.shadowColor = splat.food === "egg" ? "rgba(255,255,255,0.22)" : colorWithAlpha(style.stain, 0.34);
    ctx.shadowBlur = radius * 0.22;

    const wet = ctx.createRadialGradient(-radius * 0.14, -radius * 0.12, 0, 0, 0, radius * 1.14);
    if (splat.food === "egg") {
        wet.addColorStop(0, "rgba(255,255,255,0.88)");
        wet.addColorStop(0.54, "rgba(255,255,255,0.48)");
        wet.addColorStop(1, "rgba(255,255,255,0.03)");
    } else {
        wet.addColorStop(0, colorWithAlpha(style.pulp, 0.93));
        wet.addColorStop(0.52, colorWithAlpha(style.stain, 0.78));
        wet.addColorStop(1, colorWithAlpha(style.stain, 0.03));
    }

    ctx.fillStyle = wet;
    ctx.beginPath();
    const lobes = splat.food === "strawberry" ? 12 : splat.food === "egg" ? 10 : 15;
    for (let lobe = 0; lobe <= lobes; lobe += 1) {
        const theta = (Math.PI * 2 * lobe) / lobes;
        const wobble = 0.64 + flameNoise(splat.seed, lobe * 17.9) * 0.54;
        const x = Math.cos(theta) * radius * wobble;
        const y = Math.sin(theta) * radius * (0.58 + flameNoise(splat.seed + 3, lobe * 6.1) * 0.24);
        if (lobe === 0) ctx.moveTo(x, y);
        else ctx.quadraticCurveTo(
            Math.cos(theta - Math.PI / lobes) * radius * 1.1,
            Math.sin(theta - Math.PI / lobes) * radius * 0.76,
            x,
            y,
        );
    }
    ctx.closePath();
    ctx.fill();

    if (splat.food === "egg") {
        const yolk = ctx.createRadialGradient(-radius * 0.08, radius * 0.02, 0, 0, 0, radius * 0.34);
        yolk.addColorStop(0, "#fde047");
        yolk.addColorStop(0.72, "#f59e0b");
        yolk.addColorStop(1, "rgba(245,158,11,0)");
        ctx.fillStyle = yolk;
        ctx.beginPath();
        ctx.ellipse(0, radius * 0.02, radius * 0.34, radius * 0.28, -0.2, 0, Math.PI * 2);
        ctx.fill();
    }

    const dripCount = splat.food === "tomato" ? 9 : splat.food === "watermelon" ? 7 : splat.food === "egg" ? 6 : 5;
    for (let drip = 0; drip < dripCount; drip += 1) {
        const theta = Math.PI * 0.42 + flameNoise(splat.seed + 23, drip * 5.3) * Math.PI * 0.72;
        const start = radius * (0.22 + flameNoise(splat.seed + 31, drip * 2.9) * 0.35);
        const length = radius * (0.32 + flameNoise(splat.seed + 37, drip * 9.1) * (splat.food === "tomato" ? 1.1 : 0.68));
        const sx = Math.cos(theta) * start;
        const sy = Math.sin(theta) * start * 0.64;
        const ex = Math.cos(theta) * (start + length);
        const ey = Math.sin(theta) * (start + length) * 0.82;
        const dripGradient = ctx.createLinearGradient(sx, sy, ex, ey);
        dripGradient.addColorStop(0, splat.food === "egg" ? "rgba(255,255,255,0.6)" : colorWithAlpha(style.pulp, 0.82));
        dripGradient.addColorStop(1, splat.food === "egg" ? "rgba(255,255,255,0)" : colorWithAlpha(style.stain, 0));
        ctx.strokeStyle = dripGradient;
        ctx.lineWidth = Math.max(1.4, radius * (0.055 + flameNoise(splat.seed + 41, drip * 4.7) * 0.05));
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.quadraticCurveTo((sx + ex) * 0.5, (sy + ey) * 0.5 + radius * 0.12, ex, ey);
        ctx.stroke();
    }

    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
    if (splat.food === "watermelon" || splat.food === "strawberry") {
        const seedCount = splat.food === "watermelon" ? 17 : 22;
        ctx.fillStyle = splat.food === "watermelon" ? "#111827" : "#fef08a";
        for (let seedIndex = 0; seedIndex < seedCount; seedIndex += 1) {
            const theta = flameNoise(splat.seed + 53, seedIndex * 11.1) * Math.PI * 2;
            const dist = radius * (0.12 + flameNoise(splat.seed + 59, seedIndex * 7.2) * 0.7);
            ctx.save();
            ctx.translate(Math.cos(theta) * dist, Math.sin(theta) * dist * 0.62);
            ctx.rotate(theta);
            ctx.beginPath();
            ctx.ellipse(0, 0, radius * 0.025, radius * 0.052, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    if (splat.food === "tomato" || splat.food === "watermelon") {
        const fragmentCount = splat.food === "tomato" ? 7 : 9;
        ctx.fillStyle = style.skin;
        for (let fragment = 0; fragment < fragmentCount; fragment += 1) {
            const theta = flameNoise(splat.seed + 67, fragment * 6.4) * Math.PI * 2;
            const dist = radius * (0.42 + flameNoise(splat.seed + 71, fragment * 8.9) * 0.52);
            ctx.save();
            ctx.translate(Math.cos(theta) * dist, Math.sin(theta) * dist * 0.66);
            ctx.rotate(theta);
            ctx.beginPath();
            ctx.ellipse(0, 0, radius * 0.12, radius * 0.035, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = splat.food === "egg" ? "rgba(255,255,255,0.24)" : "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(-radius * 0.22, -radius * 0.2, radius * 0.22, radius * 0.08, -0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
};

const drawFruitSplat = (ctx: CanvasRenderingContext2D, splat: FruitSplat, now: number, sprites?: PlaygroundSprites) => {
    const style = foodStyle(splat.food);
    const age = now - splat.createdAt;
    const alpha = Math.min(1, age / 120) * Math.max(0.15, 1 - Math.max(0, age - splat.life * 0.72) / (splat.life * 0.28));
    const slide = Math.max(0, splat.y - splat.originY);
    ctx.save();
    ctx.globalAlpha = alpha;
    const sheet = getSlingerFoodSheet(sprites, splat.food);
    if (sheet) {
        drawSlingerFoodFrame(
            ctx,
            sheet,
            getSlingerSplatFrame(splat.food, age),
            splat.x,
            splat.y,
            splat.radius * (splat.food === "egg" ? 1.18 : splat.food === "strawberry" ? 1.12 : splat.food === "watermelon" ? 0.92 : 1.04),
            splat.rotation * 0.1,
            1,
            splat.food === "egg" ? 0.92 : splat.food === "strawberry" ? 0.94 : splat.food === "watermelon" ? 0.88 : 0.95,
        );
        ctx.restore();
        return;
    }
    if (splat.food === "watermelon") {
        if (slide > 1) {
            const trail = ctx.createLinearGradient(splat.x, splat.originY, splat.x, splat.y + splat.radius * 1.2);
            trail.addColorStop(0, "rgba(127,29,29,0.1)");
            trail.addColorStop(0.5, "rgba(251,113,133,0.24)");
            trail.addColorStop(1, "rgba(127,29,29,0)");
            ctx.strokeStyle = trail;
            ctx.lineWidth = Math.max(5, splat.radius * 0.28);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(splat.x, splat.originY + splat.radius * 0.22);
            ctx.bezierCurveTo(
                splat.x + Math.sin(splat.seed) * splat.radius * 0.34,
                splat.originY + slide * 0.22,
                splat.x - Math.cos(splat.seed) * splat.radius * 0.24,
                splat.originY + slide * 0.7,
                splat.x,
                splat.y + splat.radius * 0.82,
            );
            ctx.stroke();
        }
        drawWatermelonSplat(ctx, splat, now);
        ctx.restore();
        return;
    }
    if (splat.food === "tomato") {
        if (slide > 1) {
            const trail = ctx.createLinearGradient(splat.x, splat.originY, splat.x, splat.y + splat.radius * 1.1);
            trail.addColorStop(0, "rgba(153,27,27,0.1)");
            trail.addColorStop(0.58, "rgba(239,68,68,0.24)");
            trail.addColorStop(1, "rgba(153,27,27,0)");
            ctx.strokeStyle = trail;
            ctx.lineWidth = Math.max(4, splat.radius * 0.24);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(splat.x, splat.originY + splat.radius * 0.24);
            ctx.bezierCurveTo(
                splat.x + Math.sin(splat.seed) * splat.radius * 0.32,
                splat.originY + slide * 0.24,
                splat.x - Math.cos(splat.seed) * splat.radius * 0.2,
                splat.originY + slide * 0.72,
                splat.x,
                splat.y + splat.radius * 0.74,
            );
            ctx.stroke();
        }
        drawTomatoSplat(ctx, splat, now);
        ctx.restore();
        return;
    }
    if (slide > 1) {
        const streak = ctx.createLinearGradient(splat.x, splat.originY, splat.x, splat.y + splat.radius * 0.5);
        streak.addColorStop(0, colorWithAlpha(style.stain, 0.15));
        streak.addColorStop(0.72, colorWithAlpha(style.pulp, 0.22));
        streak.addColorStop(1, colorWithAlpha(style.stain, 0));
        ctx.strokeStyle = streak;
        ctx.lineWidth = Math.max(3, splat.radius * 0.18);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(splat.x, splat.originY + splat.radius * 0.16);
        ctx.bezierCurveTo(
            splat.x + Math.sin(splat.seed) * splat.radius * 0.22,
            splat.originY + slide * 0.28,
            splat.x - Math.cos(splat.seed) * splat.radius * 0.14,
            splat.originY + slide * 0.72,
            splat.x,
            splat.y + splat.radius * 0.3,
        );
        ctx.stroke();
    }
    drawSplatShape(ctx, splat);
    ctx.restore();
};

const drawFruitProjectile = (ctx: CanvasRenderingContext2D, projectile: FruitProjectile, sprites?: PlaygroundSprites) => {
    const approachT = 1 - Math.max(0, Math.min(1, projectile.z / SLINGER_PROJECTILE_DEPTH));
    const sheet = getSlingerFoodSheet(sprites, projectile.food);
    if (sheet) {
        const depthScale = projectile.food === "tomato"
            ? 1 + easeOutCubic(approachT) * 1.08
            : 1 + easeOutCubic(approachT) * 0.9;
        const frame = smoothStep(0.04, 0.96, approachT) * 2;
        ctx.save();
        ctx.globalAlpha = 0.18 + approachT * 0.16;
        ctx.fillStyle = "rgba(15,23,42,0.7)";
        ctx.beginPath();
        ctx.ellipse(projectile.x, projectile.y + projectile.radius * (1.3 + projectile.z * 0.001), projectile.radius * 1.2, projectile.radius * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawSlingerFoodFrame(
            ctx,
            sheet,
            frame,
            projectile.x,
            projectile.y,
            projectile.radius * depthScale,
            projectile.rotation * 0.1,
        );
        return;
    }
};

const getSlingerShot = (
    anchorX: number,
    anchorY: number,
    pullX: number,
    pullY: number,
    _chargeStartAt: number,
    food: ThrowFoodId,
    now: number,
) => {
    const profile = foodStyle(food);
    const rawDx = anchorX - pullX;
    const rawDy = anchorY - pullY;
    const rawDistance = Math.min(SLINGER_MAX_PULL, Math.hypot(rawDx, rawDy));
    const angle = rawDistance > 5 ? Math.atan2(rawDy, rawDx) : -Math.PI / 2;
    const pullPower = clampValue((rawDistance - SLINGER_POWER_DEADZONE) / (SLINGER_MAX_PULL - SLINGER_POWER_DEADZONE), 0, 1);
    const power = smoothStep(0, 1, pullPower);
    const punch = easeOutCubic(power);
    const massDrag = 1 / (0.82 + (profile.mass * 0.22));
    const speed = (0.38 + punch * 2.65) * massDrag;
    const depthSpeed = (0.58 + punch * 0.3) * (0.9 + massDrag * 0.1);
    const startX = anchorX + Math.cos(angle) * 18;
    const startY = anchorY + Math.sin(angle) * 18;
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed - (0.035 + punch * 0.09);
    const flightMs = SLINGER_PROJECTILE_DEPTH / depthSpeed;
    const impactX = startX + vx * flightMs;
    const impactY = startY + vy * flightMs + 0.5 * SLINGER_GRAVITY * profile.mass * flightMs * flightMs;

    return {
        angle,
        power,
        punch,
        speed,
        depthSpeed,
        startX,
        startY,
        vx,
        vy,
        flightMs,
        impactX,
        impactY,
    };
};

const drawSlingerFrameSprite = (
    ctx: CanvasRenderingContext2D,
    sprite: HTMLImageElement | undefined,
    anchorX: number,
    anchorY: number,
    shake: number,
) => {
    if (!sprite) return false;
    const drawHeight = 196;
    const drawWidth = drawHeight * (sprite.width / sprite.height);
    ctx.save();
    ctx.translate(anchorX + shake * 0.16, anchorY + 52);
    ctx.shadowColor = "rgba(0,0,0,0.42)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 9;
    ctx.drawImage(sprite, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
    return true;
};

const drawSlinger = (ctx: CanvasRenderingContext2D, state: SlingerState, food: ThrowFoodId, now: number, fallbackX: number, fallbackY: number, sprites?: PlaygroundSprites) => {
    const profile = foodStyle(food);
    const idle = !state.active;
    const anchorX = idle ? fallbackX : state.anchorX;
    const anchorY = idle ? fallbackY : state.anchorY;
    const pullBaseX = idle ? anchorX : state.pullX;
    const pullBaseY = idle ? anchorY + 8 : state.pullY;
    const dx = pullBaseX - anchorX;
    const dy = pullBaseY - anchorY;
    const pullDistance = Math.min(SLINGER_MAX_PULL, Math.hypot(dx, dy));
    const pullAngle = Math.atan2(dy, dx);
    const pullX = anchorX + Math.cos(pullAngle) * pullDistance;
    const pullY = anchorY + Math.sin(pullAngle) * pullDistance;
    const power = clampValue((pullDistance - SLINGER_POWER_DEADZONE) / (SLINGER_MAX_PULL - SLINGER_POWER_DEADZONE), 0, 1);
    const shot = getSlingerShot(anchorX, anchorY, pullX, pullY, idle ? now : state.chargeStartAt, food, now);
    const shake = idle ? Math.sin(now * 0.0048) * 0.45 : Math.sin(now * 0.034 + state.seed) * power * 1.35;
    const forkLeft = { x: anchorX - 44 + shake, y: anchorY - 18 };
    const forkRight = { x: anchorX + 44 - shake, y: anchorY - 18 };
    const base = { x: anchorX, y: anchorY + 64 };
    const handleBottom = { x: anchorX, y: anchorY + 124 };

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.save();
    ctx.setLineDash([3, 9]);
    ctx.strokeStyle = `rgba(255,255,255,${idle ? 0.22 : 0.34 + power * 0.48})`;
    ctx.lineWidth = idle ? 2.2 : 3.4;
    ctx.beginPath();
    for (let step = 0; step < 22; step += 1) {
        const t = step / 21;
        const x = shot.startX + shot.vx * shot.flightMs * t;
        const y = shot.startY + shot.vy * shot.flightMs * t + 0.5 * SLINGER_GRAVITY * profile.mass * shot.flightMs * shot.flightMs * t * t;
        if (step === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.strokeStyle = `rgba(254,240,138,${idle ? 0.34 : 0.62 + power * 0.24})`;
    ctx.lineWidth = idle ? 1.8 : 2.4;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(shot.impactX, shot.impactY, idle ? 10 : 13 + power * 5, 0, Math.PI * 2);
    ctx.moveTo(shot.impactX - (idle ? 16 : 22), shot.impactY);
    ctx.lineTo(shot.impactX + (idle ? 16 : 22), shot.impactY);
    ctx.moveTo(shot.impactX, shot.impactY - (idle ? 16 : 22));
    ctx.lineTo(shot.impactX, shot.impactY + (idle ? 16 : 22));
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${idle ? 0.28 : 0.46})`;
    ctx.beginPath();
    ctx.arc(shot.impactX, shot.impactY, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.38)";
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = "rgba(2,6,23,0.22)";
    ctx.beginPath();
    ctx.ellipse(anchorX, handleBottom.y + 6, 54, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (!drawSlingerFrameSprite(ctx, sprites?.slingerFrame, anchorX, anchorY, shake)) {
        ctx.strokeStyle = "rgba(146,64,14,0.92)";
        ctx.lineWidth = 16;
        ctx.beginPath();
        ctx.moveTo(handleBottom.x, handleBottom.y);
        ctx.quadraticCurveTo(anchorX + 6, anchorY + 86, base.x, base.y);
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(forkLeft.x, forkLeft.y);
        ctx.moveTo(base.x, base.y);
        ctx.lineTo(forkRight.x, forkRight.y);
        ctx.stroke();
    }

    ctx.strokeStyle = "#3f1d0b";
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(forkLeft.x, forkLeft.y);
    ctx.quadraticCurveTo((forkLeft.x + pullX) * 0.5, (forkLeft.y + pullY) * 0.5 + power * 20, pullX, pullY);
    ctx.quadraticCurveTo((forkRight.x + pullX) * 0.5, (forkRight.y + pullY) * 0.5 + power * 20, forkRight.x, forkRight.y);
    ctx.stroke();

    ctx.fillStyle = "#7c2d12";
    ctx.strokeStyle = "rgba(15,23,42,0.48)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(pullX, pullY + 3, 21 + power * 7, 12 + power * 2, pullAngle, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.save();
    ctx.translate(pullX, pullY);
    ctx.rotate(pullAngle + Math.PI / 2 + Math.sin(now * 0.06) * power * 0.08);
    ctx.scale(1 + (idle ? 0.04 : power * 0.22), 1 - (idle ? 0.03 : power * 0.16));
    drawSlingerFoodObject(ctx, food, profile.radius * (0.84 + power * 0.12), state.seed, sprites);
    ctx.restore();

    ctx.fillStyle = `rgba(254,240,138,${0.14 + power * 0.28})`;
    ctx.beginPath();
    ctx.arc(pullX, pullY, 18 + power * 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
};

const drawSlingerSafely = (ctx: CanvasRenderingContext2D, state: SlingerState, food: ThrowFoodId, now: number, fallbackX: number, fallbackY: number, sprites?: PlaygroundSprites): void => {
    try {
        drawSlinger(ctx, state, food, now, fallbackX, fallbackY, sprites);
    } catch (error) {
        console.error("[playground] Slinger draw failed", error);
        ctx.save();
        ctx.translate(fallbackX, fallbackY);
        ctx.strokeStyle = "rgba(217,119,6,0.92)";
        ctx.lineWidth = 12;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(0, 76);
        ctx.lineTo(-28, -10);
        ctx.moveTo(0, 76);
        ctx.lineTo(28, -10);
        ctx.stroke();
        ctx.strokeStyle = "#3f1d0b";
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-28, -10);
        ctx.quadraticCurveTo(0, state.active ? 18 : -2, 28, -10);
        ctx.stroke();
        drawSlingerFoodObject(ctx, food, foodStyle(food).radius * 0.82, state.seed || Math.floor(now), sprites);
        ctx.restore();
    }
};

const getDockedDragonLayout = (surfaceWidth: number, surfaceHeight: number, focusY: number): DragonHeadLayout => {
    const drawHeight = clampValue(Math.min(surfaceHeight * 0.76, surfaceWidth * 0.62), 340, 660);
    const drawWidth = drawHeight * DRAGON_FRAME_ASPECT;
    const yFocus = Number.isFinite(focusY) ? focusY : surfaceHeight * 0.54;
    const x = -drawWidth * (1 - DRAGON_DOCK_VISIBLE_RATIO);
    const y = clampValue(
        yFocus - (DRAGON_MOUTH_Y * drawHeight),
        -drawHeight * 0.2,
        surfaceHeight - (drawHeight * 0.72)
    );

    return {
        x,
        y,
        width: drawWidth,
        height: drawHeight,
        mouthX: x + ((1 - DRAGON_MOUTH_X) * drawWidth),
        mouthY: y + (DRAGON_MOUTH_Y * drawHeight),
        mirror: true,
    };
};

const createDragonBreath = (
    targetX: number,
    targetY: number,
    radius: number,
    surfaceWidth: number,
    surfaceHeight: number,
    seed: number,
    now: number
): ActiveDragonBreath => {
    const layout = getDockedDragonLayout(surfaceWidth, surfaceHeight, targetY - clampValue(radius * 0.2, 4, 20));

    return {
        id: `dragon-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        targetX,
        targetY,
        ...layout,
        seed,
        createdAt: now,
        life: 1320,
    };
};

const getDragonSilhouette = (sprite: HTMLImageElement): HTMLCanvasElement => {
    const cached = dragonSilhouetteCache.get(sprite);
    if (cached) return cached;

    const silhouette = document.createElement("canvas");
    silhouette.width = sprite.naturalWidth;
    silhouette.height = sprite.naturalHeight;
    const silhouetteCtx = silhouette.getContext("2d");
    if (silhouetteCtx) {
        silhouetteCtx.drawImage(sprite, 0, 0);
        silhouetteCtx.globalCompositeOperation = "source-in";
        silhouetteCtx.fillStyle = "rgba(7,10,14,0.82)";
        silhouetteCtx.fillRect(0, 0, silhouette.width, silhouette.height);
    }
    dragonSilhouetteCache.set(sprite, silhouette);
    return silhouette;
};

const isDragonNoseShadowArtifact = (
    frameIndex: number,
    x: number,
    y: number,
    red: number,
    green: number,
    blue: number,
    alpha: number,
    frameWidth: number,
    frameHeight: number
): boolean => {
    if (alpha <= 8 || frameIndex < 1 || frameIndex > 9) return false;

    const maxChannel = Math.max(red, green, blue);
    const minChannel = Math.min(red, green, blue);
    const saturation = maxChannel - minChannel;
    const inNoseSideBlock = (
        x < frameWidth * 0.255 &&
        y > frameHeight * 0.205 &&
        y < frameHeight * 0.535 &&
        (x < frameWidth * 0.19 || y < frameHeight * 0.475)
    );
    if (!inNoseSideBlock) return false;

    const flatBlackBlock = maxChannel < 86;
    const flatGrayBlock = maxChannel < 152 && saturation < 18;
    const greenSmokeBlock = green > red + 34 && blue > red + 28 && maxChannel < 142;
    return flatBlackBlock || flatGrayBlock || greenSmokeBlock;
};

const getCleanDragonHeadFrame = (
    sprite: HTMLImageElement,
    frameIndex: number,
    frameWidth: number,
    frameHeight: number
): HTMLCanvasElement => {
    let frameCache = dragonHeadCleanFrameCache.get(sprite);
    if (!frameCache) {
        frameCache = new Map<number, HTMLCanvasElement>();
        dragonHeadCleanFrameCache.set(sprite, frameCache);
    }
    const cached = frameCache.get(frameIndex);
    if (cached) return cached;

    const pixelWidth = Math.round(frameWidth);
    const pixelHeight = Math.round(frameHeight);
    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    const cleanCtx = canvas.getContext("2d");
    if (!cleanCtx) {
        frameCache.set(frameIndex, canvas);
        return canvas;
    }

    cleanCtx.drawImage(
        sprite,
        frameIndex * frameWidth,
        0,
        frameWidth,
        frameHeight,
        0,
        0,
        pixelWidth,
        pixelHeight
    );

    try {
        const imageData = cleanCtx.getImageData(0, 0, pixelWidth, pixelHeight);
        const data = imageData.data;
        for (let y = 0; y < pixelHeight; y += 1) {
            for (let x = 0; x < pixelWidth; x += 1) {
                const offset = ((y * pixelWidth) + x) * 4;
                if (isDragonNoseShadowArtifact(
                    frameIndex,
                    x,
                    y,
                    data[offset],
                    data[offset + 1],
                    data[offset + 2],
                    data[offset + 3],
                    pixelWidth,
                    pixelHeight
                )) {
                    data[offset + 3] = 0;
                }
            }
        }
        cleanCtx.putImageData(imageData, 0, 0);
    } catch {
        cleanCtx.clearRect(0, 0, pixelWidth, pixelHeight);
        cleanCtx.drawImage(
            sprite,
            frameIndex * frameWidth,
            0,
            frameWidth,
            frameHeight,
            0,
            0,
            pixelWidth,
            pixelHeight
        );
    }

    frameCache.set(frameIndex, canvas);
    return canvas;
};

const drawDragonHeadFrame = (
    ctx: CanvasRenderingContext2D,
    layout: DragonHeadLayout,
    frame: number,
    alpha: number,
    now: number,
    seed: number,
    sprite?: HTMLImageElement,
    intensity = 0
): void => {
    if (!sprite?.complete || sprite.naturalWidth <= 0 || alpha <= 0) return;

    const frameWidth = sprite.naturalWidth / DRAGON_SHEET_FRAMES;
    const frameHeight = sprite.naturalHeight;
    const frameIndex = clampValue(Math.round(frame), 0, DRAGON_SHEET_FRAMES - 1);
    const recoil = Math.sin(Math.min(1, intensity) * Math.PI) * 14;
    const breathe = Math.sin(now * 0.0028 + seed) * 3.4;
    const shakeX = Math.sin(now * 0.034 + seed) * 2.8 * intensity;
    const shakeY = Math.cos(now * 0.029 + seed) * 2.2 * intensity;

    ctx.save();
    ctx.translate(
        layout.x + layout.width / 2 - recoil + shakeX,
        layout.y + layout.height / 2 + breathe + shakeY
    );
    if (layout.mirror) ctx.scale(-1, 1);
    ctx.globalAlpha = alpha;

    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(0,0,0,0)";
    ctx.shadowBlur = 0;
    const cleanFrame = getCleanDragonHeadFrame(sprite, frameIndex, frameWidth, frameHeight);
    ctx.drawImage(
        cleanFrame,
        0,
        0,
        cleanFrame.width,
        cleanFrame.height,
        -layout.width / 2,
        -layout.height / 2,
        layout.width,
        layout.height
    );
    ctx.restore();
};

const drawDragonHeadSequence = (
    ctx: CanvasRenderingContext2D,
    layout: DragonHeadLayout,
    frame: number,
    alpha: number,
    now: number,
    seed: number,
    sprite?: HTMLImageElement,
    intensity = 0
): void => {
    const baseFrame = clampValue(Math.floor(frame), 0, DRAGON_SHEET_FRAMES - 1);
    const nextFrame = clampValue(baseFrame + 1, 0, DRAGON_SHEET_FRAMES - 1);
    const mix = clampValue(frame - baseFrame, 0, 1);
    drawDragonHeadFrame(ctx, layout, baseFrame, alpha * (1 - mix), now, seed, sprite, intensity);
    if (mix > 0.001 && nextFrame !== baseFrame) {
        drawDragonHeadFrame(ctx, layout, nextFrame, alpha * mix, now, seed, sprite, intensity);
    }
};

const drawIdleDragonHead = (
    ctx: CanvasRenderingContext2D,
    surfaceWidth: number,
    surfaceHeight: number,
    focusY: number,
    now: number,
    sprite?: HTMLImageElement
): void => {
    const layout = getDockedDragonLayout(surfaceWidth, surfaceHeight, focusY);
    const smokeFrame = 0.12 + (Math.sin(now * 0.0018) * 0.5 + 0.5) * 0.18;
    drawDragonHeadSequence(ctx, layout, smokeFrame, 0.96, now, 1137, sprite, 0);
};

const drawDragonBreath = (ctx: CanvasRenderingContext2D, breath: ActiveDragonBreath, now: number, sprite?: HTMLImageElement, flameSprite?: HTMLImageElement): void => {
    const age = now - breath.createdAt;
    const t = clampValue(age / breath.life, 0, 1);
    const alpha = Math.min(1, age / 130) * Math.max(0, 1 - smoothStep(0.74, 1, t));
    if (alpha <= 0) return;

    const flameT = smoothStep(0.16, 0.38, t) * (1 - smoothStep(0.82, 1, t));
    const angle = Math.atan2(breath.targetY - breath.mouthY, breath.targetX - breath.mouthX);
    const distance = Math.max(36, Math.hypot(breath.targetX - breath.mouthX, breath.targetY - breath.mouthY));
    const pulse = 0.72 + Math.sin(now * 0.026 + breath.seed) * 0.16;

    if (sprite?.complete && sprite.naturalWidth > 0) {
        const openFrame = smoothStep(0.04, 0.5, t) * (DRAGON_SHEET_FRAMES - 1);
        const settle = smoothStep(0.64, 1, t);
        drawDragonHeadSequence(ctx, breath, openFrame - settle * 1.1, alpha, now, breath.seed, sprite, flameT);
    } else {
        ctx.save();
        ctx.translate(breath.mouthX, breath.mouthY);
        ctx.rotate(angle + Math.PI);
        ctx.globalAlpha = alpha * 0.92;
        ctx.fillStyle = "rgba(16,24,39,0.86)";
        ctx.strokeStyle = "rgba(251,146,60,0.32)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, breath.width * 0.36, breath.height * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    if (flameT <= 0) return;

    const flameLength = distance * (0.78 + flameT * 0.18);
    const flameWidth = clampValue(breath.width * 0.22, 46, 92) * pulse;
    const hasFlameSprite = flameSprite?.complete && flameSprite.naturalWidth > 0;

    ctx.save();
    ctx.translate(breath.mouthX, breath.mouthY + clampValue(flameWidth * 0.16, 8, 14));
    ctx.rotate(angle);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = alpha * flameT;

    if (!hasFlameSprite) {
        const outer = ctx.createLinearGradient(0, 0, flameLength, 0);
        outer.addColorStop(0, "rgba(255,255,255,0.64)");
        outer.addColorStop(0.1, "rgba(254,240,138,0.76)");
        outer.addColorStop(0.36, "rgba(249,115,22,0.66)");
        outer.addColorStop(0.7, "rgba(220,38,38,0.3)");
        outer.addColorStop(1, "rgba(127,29,29,0)");
        ctx.fillStyle = outer;
        ctx.beginPath();
        ctx.moveTo(0, -flameWidth * 0.18);
        ctx.bezierCurveTo(flameLength * 0.12, -flameWidth * 0.76, flameLength * 0.28, -flameWidth * 0.5, flameLength * 0.38, -flameWidth * 0.9);
        ctx.bezierCurveTo(flameLength * 0.48, -flameWidth * 0.18, flameLength * 0.62, -flameWidth * 0.68, flameLength * 0.72, -flameWidth * 0.26);
        ctx.bezierCurveTo(flameLength * 0.86, -flameWidth * 0.48, flameLength * 0.97, -flameWidth * 0.16, flameLength, 0);
        ctx.bezierCurveTo(flameLength * 0.88, flameWidth * 0.22, flameLength * 0.72, flameWidth * 0.56, flameLength * 0.54, flameWidth * 0.34);
        ctx.bezierCurveTo(flameLength * 0.38, flameWidth * 0.84, flameLength * 0.18, flameWidth * 0.56, 0, flameWidth * 0.18);
        ctx.closePath();
        ctx.fill();
    }

    if (hasFlameSprite) {
        const frameCount = DRAGON_BREATH_FLAME_SHEET_FRAMES;
        const frameWidth = flameSprite.naturalWidth / frameCount;
        const frameHeight = flameSprite.naturalHeight;
        const frame = Math.floor((now * 0.018 + breath.seed * 0.11) % frameCount);
        ctx.globalAlpha = alpha * flameT * 0.98;
        ctx.drawImage(
            flameSprite,
            frame * frameWidth,
            0,
            frameWidth,
            frameHeight,
            -flameWidth * 0.22,
            -flameWidth * 0.72,
            flameLength * 1.04,
            flameWidth * 1.44
        );
        ctx.globalAlpha = alpha * flameT * 0.32;
        ctx.drawImage(
            flameSprite,
            ((frame + 3) % frameCount) * frameWidth,
            0,
            frameWidth,
            frameHeight,
            -flameWidth * 0.08,
            -flameWidth * 0.6,
            flameLength * 0.98,
            flameWidth * 1.2
        );
        ctx.globalAlpha = alpha * flameT;

        const mouthCore = ctx.createRadialGradient(0, 0, 0, 0, 0, flameWidth * 0.7);
        mouthCore.addColorStop(0, "rgba(255,255,255,0.82)");
        mouthCore.addColorStop(0.42, "rgba(251,191,36,0.46)");
        mouthCore.addColorStop(1, "rgba(249,115,22,0)");
        ctx.fillStyle = mouthCore;
        ctx.beginPath();
        ctx.ellipse(0, 0, flameWidth * 0.62, flameWidth * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();

        for (let ember = 0; ember < 7; ember += 1) {
            const noise = flameNoise(breath.seed, ember * 13.9);
            const emberX = flameLength * (0.12 + noise * 0.78);
            const emberY = (flameNoise(breath.seed + 5, ember * 7.1) - 0.5) * flameWidth * 1.3;
            const emberSize = 1.4 + flameNoise(breath.seed + 9, ember * 3.7) * 3.8;
            ctx.fillStyle = `rgba(254,240,138,${0.22 + noise * 0.46})`;
            ctx.beginPath();
            ctx.arc(emberX, emberY, emberSize, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.restore();
        return;
    }

    for (let lobe = 0; lobe < 5; lobe += 1) {
        const lobeT = (lobe + 1) / 6;
        const centerX = flameLength * lobeT;
        const centerY = (flameNoise(breath.seed + 17, lobe * 8.3) - 0.5) * flameWidth * (0.72 - lobeT * 0.32);
        const radiusX = flameWidth * (0.62 - lobeT * 0.3) * (0.82 + flameNoise(breath.seed + 23, lobe * 4.8) * 0.34);
        const radiusY = flameWidth * (0.36 - lobeT * 0.16);
        const lobeGradient = ctx.createRadialGradient(centerX - radiusX * 0.25, centerY, 0, centerX, centerY, radiusX);
        lobeGradient.addColorStop(0, "rgba(255,255,255,0.58)");
        lobeGradient.addColorStop(0.24, "rgba(254,240,138,0.64)");
        lobeGradient.addColorStop(0.58, "rgba(249,115,22,0.42)");
        lobeGradient.addColorStop(1, "rgba(220,38,38,0)");
        ctx.fillStyle = lobeGradient;
        ctx.beginPath();
        ctx.ellipse(centerX, centerY, radiusX, radiusY, (flameNoise(breath.seed + 31, lobe * 6.4) - 0.5) * 0.42, 0, Math.PI * 2);
        ctx.fill();
    }

    for (let tongue = 0; tongue < 4; tongue += 1) {
        const offset = (tongue - 1.5) * flameWidth * 0.16;
        const length = flameLength * (0.38 + tongue * 0.13 + flameNoise(breath.seed, tongue * 9.3) * 0.1);
        const width = flameWidth * (0.3 - tongue * 0.025);
        const inner = ctx.createLinearGradient(0, offset, length, offset * 0.25);
        inner.addColorStop(0, "rgba(255,255,255,0.78)");
        inner.addColorStop(0.2, "rgba(254,240,138,0.76)");
        inner.addColorStop(0.58, "rgba(249,115,22,0.46)");
        inner.addColorStop(1, "rgba(249,115,22,0)");
        ctx.fillStyle = inner;
        ctx.beginPath();
        ctx.moveTo(0, offset - width * 0.24);
        ctx.bezierCurveTo(length * 0.12, offset - width * 0.9, length * 0.34, offset - width * 0.18, length * 0.54, offset - width * 0.66);
        ctx.bezierCurveTo(length * 0.72, offset - width * 0.14, length * 0.9, offset - width * 0.28, length, offset * 0.12);
        ctx.bezierCurveTo(length * 0.76, offset + width * 0.18, length * 0.42, offset + width * 0.76, 0, offset + width * 0.24);
        ctx.closePath();
        ctx.fill();
    }

    const core = ctx.createRadialGradient(0, 0, 0, 0, 0, flameWidth * 0.72);
    core.addColorStop(0, "rgba(255,255,255,0.9)");
    core.addColorStop(0.38, "rgba(251,191,36,0.58)");
    core.addColorStop(1, "rgba(249,115,22,0)");
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(0, 0, flameWidth * 0.72, flameWidth * 0.46, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let ember = 0; ember < 7; ember += 1) {
        const noise = flameNoise(breath.seed, ember * 13.9);
        const emberX = flameLength * (0.12 + noise * 0.78);
        const emberY = (flameNoise(breath.seed + 5, ember * 7.1) - 0.5) * flameWidth * 1.3;
        const emberSize = 1.4 + flameNoise(breath.seed + 9, ember * 3.7) * 3.8;
        ctx.fillStyle = `rgba(254,240,138,${0.22 + noise * 0.46})`;
        ctx.beginPath();
        ctx.arc(emberX, emberY, emberSize, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
};

const drawLiveFlame = (ctx: CanvasRenderingContext2D, flame: ActiveFlame, now: number, sprite?: HTMLImageElement) => {
    const age = now - flame.createdAt;
    const lifeT = Math.max(0, Math.min(1, age / flame.life));
    const flightT = flame.startX === undefined || flame.startY === undefined ? 1 : Math.min(1, lifeT / 0.46);
    const easedFlight = 1 - ((1 - flightT) ** 3);
    const burnT = Math.max(0, Math.min(1, (lifeT - 0.34) / 0.66));
    const x = flame.startX === undefined ? flame.x : flame.startX + (flame.x - flame.startX) * easedFlight;
    const y = flame.startY === undefined ? flame.y : flame.startY + (flame.y - flame.startY) * easedFlight;
    const alpha = flightT < 1 ? 0.78 + Math.sin(flightT * Math.PI) * 0.22 : Math.sin((1 - burnT) * Math.PI * 0.5);
    if (alpha <= 0) return;

    const randomScale = 0.94 + flameNoise(flame.seed + 71, 3.2) * 0.22;
    const radius = flame.radius * randomScale * (flightT < 1 ? (0.46 + flightT * 0.18) : (0.76 + burnT * 0.28));
    const flicker = Math.sin((now * 0.014) + flame.seed) * 0.5 + 0.5;
    const lean = Math.sin((now * 0.0034) + flame.seed) * radius * 0.22;
    const baseY = radius * 0.18;
    const tipY = -radius * (0.82 + flicker * 0.2);
    const travelAngle = flame.startX === undefined || flame.startY === undefined
        ? flame.rotation
        : Math.atan2(flame.y - flame.startY, flame.x - flame.startX);

    if (sprite?.complete && sprite.naturalWidth > 0) {
        const frameCount = DRAGON_IMPACT_FLAME_SHEET_FRAMES;
        const frameWidth = sprite.naturalWidth / frameCount;
        const frameHeight = sprite.naturalHeight;
        const frameProgress = (now * 0.012 + flame.seed * 0.31) % frameCount;
        const frame = Math.floor(frameProgress);
        const nextFrame = (frame + 1) % frameCount;
        const frameMix = frameProgress - frame;
        const isFlyingFireball = flightT < 1;
        const heightFlicker = Math.sin(now * 0.011 + flame.seed) * 0.16 + Math.sin(now * 0.021 + flame.seed * 1.7) * 0.08;
        const widthFlicker = Math.sin(now * 0.009 + flame.seed * 0.8) * 0.1;
        const drawHeight = radius * (isFlyingFireball ? 1.56 : 1.66 + heightFlicker * 0.2);
        const drawWidth = drawHeight * (frameWidth / frameHeight) * (isFlyingFireball ? 1.28 : 1.08 + widthFlicker);
        const leanAngle = isFlyingFireball
            ? travelAngle
            : Math.sin(now * 0.0026 + flame.seed) * 0.12 + (flameNoise(flame.seed + 81, 5.4) - 0.5) * 0.14;
        const baseJitterX = (flameNoise(flame.seed + 91, Math.floor(now * 0.012)) - 0.5) * radius * 0.12;
        const drawX = isFlyingFireball ? -drawWidth * 0.62 : -drawWidth / 2 + baseJitterX;
        const drawY = isFlyingFireball ? -drawHeight * 0.5 : -drawHeight * 0.9;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(leanAngle);
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = alpha;

        const drawFlameFrame = (frameIndex: number, frameAlpha: number, xOffset = 0, yOffset = 0, widthScale = 1, heightScale = 1): void => {
            if (frameAlpha <= 0) return;
            ctx.globalAlpha = alpha * frameAlpha;
            ctx.drawImage(
                sprite,
                frameIndex * frameWidth,
                0,
                frameWidth,
                frameHeight,
                drawX + xOffset,
                drawY + yOffset,
                drawWidth * widthScale,
                drawHeight * heightScale
            );
        };

        if (!isFlyingFireball) {
            const settleGlow = 1 - smoothStep(0.68, 1, burnT);
            const organicWobble = Math.sin(now * 0.0042 + flame.seed) * 0.035 + Math.sin(now * 0.0028 + flame.seed * 1.9) * 0.018;
            const organicTilt = flame.rotation * 0.16 + organicWobble;
            const holeRadius = radius * (1.06 + burnT * 0.08);
            ctx.globalCompositeOperation = "multiply";
            ctx.globalAlpha = alpha * 0.58;
            const hole = ctx.createRadialGradient(0, 0, 0, 0, 0, holeRadius * 1.08);
            hole.addColorStop(0, "rgba(0,0,0,0.56)");
            hole.addColorStop(0.46, "rgba(24,7,2,0.4)");
            hole.addColorStop(0.78, "rgba(93,30,6,0.13)");
            hole.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = hole;
            ctx.beginPath();
            ctx.ellipse(0, 0, holeRadius * 1.1, holeRadius * 0.76, organicTilt, 0, Math.PI * 2);
            ctx.fill();

            ctx.globalCompositeOperation = "screen";
            ctx.globalAlpha = alpha * (0.42 + settleGlow * 0.18);
            const rim = ctx.createRadialGradient(0, 0, holeRadius * 0.28, 0, 0, holeRadius * 1.02);
            rim.addColorStop(0, "rgba(255,255,255,0)");
            rim.addColorStop(0.42, "rgba(254,240,138,0.11)");
            rim.addColorStop(0.62, "rgba(249,115,22,0.3)");
            rim.addColorStop(0.84, "rgba(127,29,29,0.11)");
            rim.addColorStop(1, "rgba(0,0,0,0)");
            ctx.fillStyle = rim;
            ctx.beginPath();
            ctx.ellipse(0, 0, holeRadius * 1.04, holeRadius * 0.68, organicTilt, 0, Math.PI * 2);
            ctx.fill();

            ctx.save();
            ctx.beginPath();
            const edgePoints = 24;
            for (let point = 0; point <= edgePoints; point += 1) {
                const theta = (Math.PI * 2 * point) / edgePoints;
                const wobble = 0.9 + flameNoise(flame.seed + 139, point * 5.7) * 0.14 + Math.sin(now * 0.0022 + point + flame.seed) * 0.018;
                const px = Math.cos(theta + organicWobble * 0.5) * holeRadius * 0.82 * wobble;
                const py = -holeRadius * 0.04 + Math.sin(theta) * holeRadius * 0.58 * wobble;
                if (point === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.clip();
            drawFlameFrame(frame, (1 - frameMix) * (0.42 + settleGlow * 0.08), -holeRadius * 0.82, -holeRadius * 0.58, 1.64, 0.86);
            drawFlameFrame(nextFrame, frameMix * (0.42 + settleGlow * 0.08), -holeRadius * 0.82, -holeRadius * 0.58, 1.64, 0.86);
            ctx.restore();

            for (let ember = 0; ember < 8; ember += 1) {
                const emberT = flameNoise(flame.seed + 117, ember * 7.9);
                const emberAngle = emberT * Math.PI * 2 + Math.sin(now * 0.0016 + ember + flame.seed) * 0.1;
                const dist = holeRadius * (0.3 + flameNoise(flame.seed + 123, ember * 4.1) * 0.56);
                const size = Math.max(1, holeRadius * (0.015 + flameNoise(flame.seed + 131, ember * 3.3) * 0.018));
                ctx.fillStyle = `rgba(254,240,138,${alpha * settleGlow * (0.12 + emberT * 0.26)})`;
                ctx.beginPath();
                ctx.arc(Math.cos(emberAngle) * dist, Math.sin(emberAngle) * dist * 0.66, size, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
            return;
        }

        const heat = ctx.createRadialGradient(0, -drawHeight * 0.18, 0, 0, -drawHeight * 0.18, drawWidth * 0.72);
        heat.addColorStop(0, "rgba(255,244,214,0.24)");
        heat.addColorStop(0.36, "rgba(249,115,22,0.16)");
        heat.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = heat;
        ctx.beginPath();
        ctx.ellipse(0, -drawHeight * 0.18, drawWidth * 0.72, drawHeight * 0.36, 0, 0, Math.PI * 2);
        ctx.fill();

        drawFlameFrame(frame, 1 - frameMix);
        drawFlameFrame(nextFrame, frameMix);
        ctx.globalAlpha = Math.min(1, alpha * (isFlyingFireball ? 0.58 : 0.74));
        ctx.scale(0.82 + Math.sin(now * 0.01 + flame.seed) * 0.08, 1.04 + Math.sin(now * 0.013 + flame.seed) * 0.04);
        const ghostFrame = (frame + 3 + Math.floor(flameNoise(flame.seed + 103, 1.9) * 3)) % frameCount;
        const nextGhostFrame = (ghostFrame + 1) % frameCount;
        drawFlameFrame(ghostFrame, (1 - frameMix) * (isFlyingFireball ? 0.58 : 0.74), -drawWidth * 0.04, drawHeight * 0.03, 1.06, 0.96);
        drawFlameFrame(nextGhostFrame, frameMix * (isFlyingFireball ? 0.58 : 0.74), -drawWidth * 0.04, drawHeight * 0.03, 1.06, 0.96);
        ctx.restore();
        return;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(flightT < 1 ? travelAngle + Math.PI / 2 : flame.rotation);
    ctx.globalCompositeOperation = "screen";

    if (flightT < 1) {
        const trailLength = radius * (2.1 + flightT * 1.1);
        const trail = ctx.createLinearGradient(0, radius * 0.55, 0, radius * 0.55 + trailLength);
        trail.addColorStop(0, `rgba(255,255,255,${0.46 * alpha})`);
        trail.addColorStop(0.14, `rgba(254,240,138,${0.64 * alpha})`);
        trail.addColorStop(0.42, `rgba(249,115,22,${0.38 * alpha})`);
        trail.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = trail;
        ctx.beginPath();
        ctx.moveTo(-radius * 0.34, radius * 0.14);
        ctx.bezierCurveTo(-radius * 0.58, radius * 0.9, -radius * 0.2, trailLength, 0, radius * 0.62 + trailLength);
        ctx.bezierCurveTo(radius * 0.24, trailLength, radius * 0.58, radius * 0.9, radius * 0.34, radius * 0.14);
        ctx.closePath();
        ctx.fill();
    }

    const heat = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 0.7);
    heat.addColorStop(0, `rgba(255,255,255,${0.2 * alpha})`);
    heat.addColorStop(0.32, `rgba(255,196,87,${0.18 * alpha})`);
    heat.addColorStop(0.68, `rgba(249,115,22,${0.08 * alpha})`);
    heat.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = heat;
    ctx.beginPath();
    ctx.ellipse(0, -radius * 0.04, radius * 0.58, radius * 0.36, 0, 0, Math.PI * 2);
    ctx.fill();

    const flameGradient = ctx.createLinearGradient(0, baseY, lean, tipY);
    flameGradient.addColorStop(0, `rgba(127,29,29,${0.16 * alpha})`);
    flameGradient.addColorStop(0.24, `rgba(220,38,38,${0.48 * alpha})`);
    flameGradient.addColorStop(0.58, `rgba(249,115,22,${0.86 * alpha})`);
    flameGradient.addColorStop(0.86, `rgba(254,240,138,${0.78 * alpha})`);
    flameGradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = flameGradient;
    ctx.beginPath();
    ctx.moveTo(-radius * 0.3, baseY);
    ctx.bezierCurveTo(-radius * 0.5, -radius * 0.2, lean - radius * 0.2, tipY + radius * 0.35, lean, tipY);
    ctx.bezierCurveTo(lean + radius * 0.24, tipY + radius * 0.35, radius * 0.46, -radius * 0.12, radius * 0.28, baseY);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = `rgba(254,240,138,${0.24 * alpha})`;
    ctx.lineWidth = Math.max(0.8, radius * 0.016);
    ctx.beginPath();
    ctx.moveTo(-radius * 0.08, baseY * 0.55);
    ctx.bezierCurveTo(radius * 0.04, -radius * 0.18, lean * 0.55, tipY + radius * 0.22, lean * 0.78, tipY + radius * 0.1);
    ctx.stroke();

    for (let ember = 0; ember < 4; ember += 1) {
        const noise = flameNoise(flame.seed, ember * 31.41);
        const drift = Math.sin(now * 0.004 + ember) * radius * 0.1;
        const rise = (lifeT * radius * (1.1 + noise * 0.5) + noise * radius * 0.28) % (radius * 1.18);
        const ex = (noise - 0.5) * radius * 0.75 + drift;
        const ey = radius * 0.18 - rise;
        const emberAlpha = alpha * Math.max(0, 1 - rise / (radius * 1.18)) * 0.62;
        const emberLen = radius * (0.02 + noise * 0.022);
        ctx.strokeStyle = `rgba(251,191,36,${emberAlpha})`;
        ctx.lineWidth = Math.max(0.8, radius * 0.012);
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.sin(now * 0.003 + ember) * emberLen, ey - emberLen * 1.7);
        ctx.stroke();
    }

    ctx.restore();
};

const drawPlaygroundParticle = (ctx: CanvasRenderingContext2D, particle: Particle, emberSprite?: HTMLImageElement): void => {
    if (particle.shape !== "ember" || !emberSprite?.complete || emberSprite.naturalWidth <= 0) {
        drawParticle(ctx, particle);
        return;
    }

    const lifeAlpha = clampValue(particle.life / particle.maxLife, 0, 1);
    if (lifeAlpha <= 0) return;

    const t = 1 - lifeAlpha;
    const alpha = Math.sin(lifeAlpha * Math.PI * 0.5) * (1 - smoothStep(0.72, 1, t) * 0.28);
    const frameCount = EMBER_PARTICLE_SHEET_FRAMES;
    const frameWidth = emberSprite.naturalWidth / frameCount;
    const frameHeight = emberSprite.naturalHeight;
    const frameProgress = clampValue(t * (frameCount - 1), 0, frameCount - 1);
    const frame = Math.floor(frameProgress);
    const nextFrame = Math.min(frameCount - 1, frame + 1);
    const mix = frameProgress - frame;
    const motionAngle = Math.atan2(particle.vy, particle.vx);
    const size = particle.size * (2.35 + Math.sin(t * Math.PI) * 0.85 + t * 0.32);
    const age = particle.maxLife - particle.life;
    const wobbleX = Math.sin(age * 0.16 + particle.spin * 41) * particle.size * 0.16;
    const wobbleY = Math.cos(age * 0.12 + particle.spin * 29) * particle.size * 0.1;

    const drawFrame = (frameIndex: number, frameAlpha: number): void => {
        if (frameAlpha <= 0) return;
        ctx.globalAlpha = alpha * frameAlpha;
        ctx.drawImage(
            emberSprite,
            frameIndex * frameWidth,
            0,
            frameWidth,
            frameHeight,
            -size / 2,
            -size / 2,
            size,
            size
        );
    };

    ctx.save();
    ctx.translate(particle.x + wobbleX, particle.y + wobbleY);
    ctx.rotate(motionAngle + age * particle.spin * 0.72);
    ctx.globalCompositeOperation = "screen";
    drawFrame(frame, 1 - mix);
    drawFrame(nextFrame, mix);
    ctx.restore();
};

const drawBurnResidue = (ctx: CanvasRenderingContext2D, residue: ActiveBurnResidue, now: number, sprite?: HTMLImageElement): void => {
    if (!sprite?.complete || sprite.naturalWidth <= 0) return;
    const age = now - residue.createdAt;
    const t = Math.max(0, Math.min(1, age / residue.life));
    const settle = 1 - ((1 - t) ** 3);
    const appear = Math.min(1, age / 260);
    const alpha = Math.max(0, appear * (1 - t) * 0.5);
    if (alpha <= 0) return;
    const size = residue.radius * (1.48 + settle * 0.28);
    const pulse = Math.sin(now * 0.008 + residue.seed) * residue.radius * 0.018;

    ctx.save();
    ctx.translate(residue.x, residue.y);
    ctx.rotate(residue.rotation + Math.sin(residue.seed) * 0.04);
    ctx.globalAlpha = alpha;
    ctx.globalCompositeOperation = "multiply";
    ctx.drawImage(sprite, -size / 2 - pulse, -size / 2, size + pulse * 2, size);
    ctx.globalCompositeOperation = "screen";
    ctx.globalAlpha = alpha * 0.22;
    ctx.strokeStyle = "rgba(251,146,60,0.52)";
    ctx.lineWidth = Math.max(1, residue.radius * 0.018);
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.31, size * 0.3, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
};

const drawMonsterHoleOverlay = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    seed: number,
    intensity = 1,
): void => {
    const alpha = Math.max(0, Math.min(1, intensity));
    if (alpha <= 0) return;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(seed) * 0.18);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const pit = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 1.15);
    pit.addColorStop(0, `rgba(0,0,0,${0.88 * alpha})`);
    pit.addColorStop(0.34, `rgba(2,6,23,${0.64 * alpha})`);
    pit.addColorStop(0.66, `rgba(15,23,42,${0.18 * alpha})`);
    pit.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = pit;
    ctx.beginPath();
    ctx.ellipse(0, radius * 0.06, radius * 0.82, radius * 0.58, -0.08, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(248,250,252,${0.28 * alpha})`;
    ctx.lineWidth = Math.max(1, radius * 0.018);
    ctx.beginPath();
    ctx.ellipse(-radius * 0.04, -radius * 0.02, radius * 0.72, radius * 0.42, -0.08, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalCompositeOperation = "multiply";
    for (let crack = 0; crack < 18; crack += 1) {
        const noise = flameNoise(seed + 421, crack * 9.73);
        const angle = (Math.PI * 2 * crack) / 18 + (noise - 0.5) * 0.52;
        const length = radius * (0.76 + flameNoise(seed + 433, crack * 4.1) * 1.72);
        const mid = length * (0.34 + flameNoise(seed + 439, crack * 6.2) * 0.24);
        const kink = (flameNoise(seed + 443, crack * 3.7) - 0.5) * radius * 0.28;
        ctx.strokeStyle = crack % 3 === 0 ? `rgba(0,0,0,${0.56 * alpha})` : `rgba(15,23,42,${0.42 * alpha})`;
        ctx.lineWidth = Math.max(0.8, radius * (0.012 + flameNoise(seed + 449, crack) * 0.014));
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * radius * 0.34, Math.sin(angle) * radius * 0.24);
        ctx.lineTo(
            Math.cos(angle) * mid + Math.cos(angle + Math.PI / 2) * kink,
            Math.sin(angle) * mid + Math.sin(angle + Math.PI / 2) * kink,
        );
        ctx.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
        ctx.stroke();

        if (crack % 2 === 0) {
            const branchAngle = angle + (flameNoise(seed + 457, crack) > 0.5 ? 0.72 : -0.72);
            const branchStart = length * (0.42 + flameNoise(seed + 461, crack) * 0.28);
            const bx = Math.cos(angle) * branchStart;
            const by = Math.sin(angle) * branchStart;
            ctx.lineWidth *= 0.58;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.lineTo(
                bx + Math.cos(branchAngle) * radius * (0.22 + flameNoise(seed + 467, crack) * 0.42),
                by + Math.sin(branchAngle) * radius * (0.22 + flameNoise(seed + 471, crack) * 0.42),
            );
            ctx.stroke();
        }
    }

    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = `rgba(255,255,255,${0.16 * alpha})`;
    for (let chip = 0; chip < 20; chip += 1) {
        const angle = flameNoise(seed + 479, chip * 2.4) * Math.PI * 2;
        const distance = radius * (0.38 + flameNoise(seed + 487, chip * 4.8) * 0.9);
        const size = radius * (0.018 + flameNoise(seed + 491, chip * 7.2) * 0.034);
        ctx.beginPath();
        ctx.ellipse(Math.cos(angle) * distance, Math.sin(angle) * distance, size, size * 0.42, angle, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
};

const drawMonsterAttack = (ctx: CanvasRenderingContext2D, attack: ActiveMonsterAttack, now: number, sprite?: HTMLImageElement): void => {
    const age = now - attack.createdAt;
    if (age > attack.life) return;
    const t = Math.max(0, Math.min(1, age / attack.life));
    const frameIndex = Math.max(0, Math.min(MONSTER_SHEET_FRAMES - 1, Math.floor(t * MONSTER_SHEET_FRAMES)));
    const emerge = smoothStep(0.02, 0.38, t);
    const stare = smoothStep(0.26, 0.48, t) * (1 - smoothStep(0.58, 0.72, t));
    const strike = smoothStep(0.54, 0.7, t);
    const fade = 1 - smoothStep(0.84, 1, t);
    const alpha = Math.max(0, Math.min(1, fade));
    const radius = attack.radius * (0.76 + emerge * 0.56 + stare * 0.18 + strike * 0.62);
    const wobble = Math.sin(now * 0.009 + attack.seed) * attack.radius * 0.018;
    const x = attack.x + Math.cos(attack.rotation) * strike * attack.radius * 0.34 + wobble;
    const y = attack.y + Math.sin(attack.rotation) * strike * attack.radius * 0.18 - emerge * attack.radius * 0.26 + strike * attack.radius * 0.2;

    ctx.save();
    ctx.globalAlpha = alpha;
    drawMonsterHoleOverlay(ctx, attack.x, attack.y, attack.radius * (0.48 + emerge * 0.38), attack.seed, Math.min(1, emerge * 1.2));

    if (sprite?.complete && sprite.naturalWidth > 0) {
        const frameWidth = sprite.naturalWidth / MONSTER_SHEET_FRAMES;
        const frameHeight = sprite.naturalHeight;
        const drawWidth = radius * 3.1;
        const drawHeight = drawWidth / MONSTER_FRAME_ASPECT;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(attack.rotation * 0.12 + Math.sin(now * 0.006 + attack.seed) * 0.035);
        ctx.shadowColor = "rgba(0,0,0,0.55)";
        ctx.shadowBlur = radius * 0.16;
        ctx.drawImage(
            sprite,
            frameIndex * frameWidth,
            0,
            frameWidth,
            frameHeight,
            -drawWidth / 2,
            -drawHeight / 2,
            drawWidth,
            drawHeight,
        );
        ctx.restore();
    } else {
        ctx.save();
        ctx.translate(x, y);
        ctx.fillStyle = "rgba(15,56,50,0.92)";
        ctx.beginPath();
        ctx.ellipse(0, 0, radius * 1.2, radius * 0.54, attack.rotation, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    if (stare > 0.02) {
        ctx.save();
        ctx.translate(attack.x, attack.y - attack.radius * (0.68 - strike * 0.3));
        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = `rgba(203,255,104,${0.7 * stare * alpha})`;
        ctx.shadowColor = "rgba(203,255,104,0.78)";
        ctx.shadowBlur = attack.radius * 0.22;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.ellipse(side * attack.radius * 0.16, 0, attack.radius * 0.045, attack.radius * 0.025, side * 0.18, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    if (strike > 0) {
        drawMonsterHoleOverlay(ctx, attack.x, attack.y, attack.radius * (0.74 + strike * 0.38), attack.seed + 37, strike * alpha);
    }
    ctx.restore();
};

const createSkeletonShards = (creature: Creature, hitX: number, hitY: number, now: number): SkeletonShard[] => {
    const count = 34;
    const shards: SkeletonShard[] = [];
    for (let index = 0; index < count; index += 1) {
        const seed = creature.seed + index * 101;
        const angle = (Math.PI * 2 * index) / count + (flameNoise(seed, 2.1) - 0.5) * 0.82;
        const distance = creature.size * (0.08 + flameNoise(seed, 4.7) * 0.48);
        const force = 1.35 + flameNoise(seed, 8.9) * 4.15;
        const originX = creature.x + Math.cos(angle) * distance;
        const originY = creature.y + Math.sin(angle) * distance * 0.82;
        const push = Math.atan2(originY - hitY, originX - hitX);
        shards.push({
            id: `bone-${creature.id}-${index}`,
            x: originX,
            y: originY,
            vx: Math.cos(push) * force + (flameNoise(seed, 12.4) - 0.5) * 1.4,
            vy: Math.sin(push) * force - (1.2 + flameNoise(seed, 16.8) * 2.8),
            rotation: angle + flameNoise(seed, 20.2) * Math.PI,
            spin: (flameNoise(seed, 23.7) - 0.5) * 0.22,
            length: creature.size * (0.08 + flameNoise(seed, 27.1) * 0.18),
            width: creature.size * (0.018 + flameNoise(seed, 31.4) * 0.034),
            seed,
            createdAt: now,
            life: 1180 + flameNoise(seed, 36.6) * 720,
        });
    }
    return shards;
};

const drawSkeletonShard = (ctx: CanvasRenderingContext2D, shard: SkeletonShard, now: number): void => {
    const age = now - shard.createdAt;
    const t = Math.max(0, Math.min(1, age / shard.life));
    const alpha = Math.max(0, Math.min(1, (1 - t) * 1.12));
    if (alpha <= 0) return;
    const chip = flameNoise(shard.seed, 41.2) > 0.68;

    ctx.save();
    ctx.translate(shard.x, shard.y);
    ctx.rotate(shard.rotation);
    ctx.globalAlpha = alpha;
    ctx.shadowColor = "rgba(0,0,0,0.34)";
    ctx.shadowBlur = Math.max(1, shard.width * 0.8);
    const gradient = ctx.createLinearGradient(-shard.length / 2, -shard.width, shard.length / 2, shard.width);
    gradient.addColorStop(0, "rgba(92,74,50,0.92)");
    gradient.addColorStop(0.38, "rgba(235,224,194,0.98)");
    gradient.addColorStop(0.74, "rgba(178,158,121,0.96)");
    gradient.addColorStop(1, "rgba(63,48,32,0.86)");
    ctx.fillStyle = gradient;
    ctx.strokeStyle = "rgba(47,38,28,0.42)";
    ctx.lineWidth = Math.max(0.8, shard.width * 0.22);
    ctx.beginPath();
    if (chip) {
        ctx.moveTo(-shard.length * 0.48, -shard.width * 0.55);
        ctx.lineTo(shard.length * 0.34, -shard.width * 0.78);
        ctx.lineTo(shard.length * 0.52, shard.width * 0.22);
        ctx.lineTo(-shard.length * 0.2, shard.width * 0.86);
    } else {
        ctx.roundRect(-shard.length / 2, -shard.width / 2, shard.length, shard.width, shard.width / 2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
};

const drawDetailedArrow = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    length: number,
    alpha = 1,
    wobble = 0,
    sprite?: HTMLImageElement,
) => {
    const sideX = Math.cos(angle + Math.PI / 2);
    const sideY = Math.sin(angle + Math.PI / 2);
    const forwardX = Math.cos(angle);
    const forwardY = Math.sin(angle);
    const tipX = x;
    const tipY = y;
    const tailX = x - forwardX * length;
    const tailY = y - forwardY * length;
    const wobbleOffset = Math.sin(wobble) * length * 0.018;
    const bodyWidth = Math.max(12, length * 0.1);

    if (sprite?.complete && sprite.naturalWidth > 0) {
        const spriteRatio = sprite.naturalHeight / sprite.naturalWidth;
        const height = Math.max(38, length * spriteRatio);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + wobble * 0.008);
        ctx.scale(-1, 1);
        ctx.globalAlpha *= alpha;
        ctx.shadowColor = "rgba(0,0,0,0.52)";
        ctx.shadowBlur = Math.max(8, height * 0.28);
        ctx.drawImage(sprite, 0, -height / 2, length, height);
        ctx.restore();
        return;
    }

    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.shadowColor = "rgba(2,6,23,0.5)";
    ctx.shadowBlur = Math.max(7, length * 0.055);

    ctx.strokeStyle = "rgba(2,6,23,0.66)";
    ctx.lineWidth = Math.max(6.4, length * 0.052);
    ctx.beginPath();
    ctx.moveTo(tailX + sideX * wobbleOffset, tailY + sideY * wobbleOffset);
    ctx.lineTo(tipX - forwardX * length * 0.1, tipY - forwardY * length * 0.1);
    ctx.stroke();

    const shaftGradient = ctx.createLinearGradient(tailX, tailY, tipX, tipY);
    shaftGradient.addColorStop(0, "#111827");
    shaftGradient.addColorStop(0.24, "#38bdf8");
    shaftGradient.addColorStop(0.58, "#e0f2fe");
    shaftGradient.addColorStop(1, "#f8fafc");
    ctx.strokeStyle = shaftGradient;
    ctx.lineWidth = Math.max(3.2, length * 0.024);
    ctx.beginPath();
    ctx.moveTo(tailX + sideX * wobbleOffset, tailY + sideY * wobbleOffset);
    ctx.lineTo(tipX - forwardX * length * 0.14, tipY - forwardY * length * 0.14);
    ctx.stroke();

    ctx.fillStyle = "#f8fafc";
    ctx.beginPath();
    ctx.moveTo(tipX + forwardX * length * 0.13, tipY + forwardY * length * 0.13);
    ctx.lineTo(tipX - forwardX * length * 0.17 + sideX * bodyWidth * 0.92, tipY - forwardY * length * 0.17 + sideY * bodyWidth * 0.92);
    ctx.lineTo(tipX - forwardX * length * 0.09 + sideX * bodyWidth * 0.22, tipY - forwardY * length * 0.09 + sideY * bodyWidth * 0.22);
    ctx.lineTo(tipX - forwardX * length * 0.17 - sideX * bodyWidth * 0.92, tipY - forwardY * length * 0.17 - sideY * bodyWidth * 0.92);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(7,89,133,0.72)";
    ctx.lineWidth = Math.max(1.1, length * 0.009);
    ctx.stroke();

    for (const side of [-1, 1]) {
        const featherBaseX = tailX + forwardX * length * 0.12;
        const featherBaseY = tailY + forwardY * length * 0.12;
        ctx.fillStyle = side > 0 ? "rgba(14,116,144,0.9)" : "rgba(8,47,73,0.86)";
        ctx.beginPath();
        ctx.moveTo(featherBaseX, featherBaseY);
        ctx.lineTo(featherBaseX - forwardX * length * 0.16 + sideX * side * length * 0.09, featherBaseY - forwardY * length * 0.16 + sideY * side * length * 0.09);
        ctx.lineTo(featherBaseX + forwardX * length * 0.13 + sideX * side * length * 0.04, featherBaseY + forwardY * length * 0.13 + sideY * side * length * 0.04);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(2,6,23,0.42)";
        ctx.lineWidth = Math.max(0.6, length * 0.006);
        ctx.stroke();
    }

    const tailRingX = tailX + forwardX * length * 0.2;
    const tailRingY = tailY + forwardY * length * 0.2;
    for (let ring = 0; ring < 3; ring += 1) {
        const offset = length * (0.035 + ring * 0.034);
        const cx = tailRingX + forwardX * offset;
        const cy = tailRingY + forwardY * offset;
        ctx.strokeStyle = ring === 1 ? "rgba(224,242,254,0.82)" : "rgba(8,47,73,0.72)";
        ctx.lineWidth = Math.max(0.6, length * 0.004);
        ctx.beginPath();
        ctx.moveTo(cx - sideX * length * 0.035, cy - sideY * length * 0.035);
        ctx.lineTo(cx + sideX * length * 0.035, cy + sideY * length * 0.035);
        ctx.stroke();
    }

    for (const side of [-1, 1]) {
        const finRootX = tailX + forwardX * length * 0.04;
        const finRootY = tailY + forwardY * length * 0.04;
        ctx.fillStyle = side > 0 ? "rgba(125,211,252,0.78)" : "rgba(14,116,144,0.76)";
        ctx.beginPath();
        ctx.moveTo(finRootX, finRootY);
        ctx.lineTo(finRootX + forwardX * length * 0.11 + sideX * side * length * 0.052, finRootY + forwardY * length * 0.11 + sideY * side * length * 0.052);
        ctx.lineTo(finRootX + forwardX * length * 0.23 + sideX * side * length * 0.02, finRootY + forwardY * length * 0.23 + sideY * side * length * 0.02);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(15,23,42,0.48)";
        ctx.lineWidth = Math.max(0.5, length * 0.004);
        ctx.stroke();
    }

    ctx.restore();
};

const drawLiveArrow = (ctx: CanvasRenderingContext2D, arrow: ActiveArrow, now: number, sprite?: HTMLImageElement) => {
    const age = now - arrow.createdAt;
    const flightT = Math.min(1, age / ARROW_FLIGHT_MS);
    const easedFlight = 1 - ((1 - flightT) ** 3);
    const impactT = Math.max(0, Math.min(1, (age - ARROW_FLIGHT_MS * 0.82) / ARROW_IMPACT_MS));
    const vibration = impactT > 0 ? Math.sin(impactT * Math.PI * 18 + arrow.seed) * (1 - impactT) : 0;
    const travel = Math.max(0, 1 - flightT);
    const length = Math.max(168, arrow.radius * 3.08);
    const sideX = Math.cos(arrow.rotation + Math.PI / 2);
    const sideY = Math.sin(arrow.rotation + Math.PI / 2);
    const x = arrow.startX + (arrow.x - arrow.startX) * easedFlight + sideX * vibration * 2.2;
    const y = arrow.startY + (arrow.y - arrow.startY) * easedFlight + sideY * vibration * 2.2;
    const fadeStart = Math.max(ARROW_FLIGHT_MS + ARROW_IMPACT_MS, arrow.life - ARROW_FADE_MS);
    const alpha = age < fadeStart ? 1 : Math.max(0, 1 - ((age - fadeStart) / ARROW_FADE_MS));
    const wobble = vibration * 1.35;

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    if (travel > 0.04) {
        ctx.strokeStyle = `rgba(226,232,240,${0.28 * travel})`;
        ctx.lineWidth = 2.8;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x - Math.cos(arrow.rotation) * length * 1.2, y - Math.sin(arrow.rotation) * length * 1.2);
        ctx.lineTo(x - Math.cos(arrow.rotation) * length * 0.16, y - Math.sin(arrow.rotation) * length * 0.16);
        ctx.stroke();
    }

    if (impactT > 0 && impactT < 0.92) {
        const ringAlpha = (1 - impactT) * 0.52;
        const ringRadius = arrow.radius * (0.16 + impactT * 0.2);
        ctx.strokeStyle = `rgba(248,250,252,${ringAlpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(arrow.x + sideX * vibration, arrow.y + sideY * vibration, ringRadius, ringRadius * 0.54, arrow.rotation, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = `rgba(251,191,36,${ringAlpha * 0.78})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(arrow.x - Math.cos(arrow.rotation) * ringRadius * 0.4, arrow.y - Math.sin(arrow.rotation) * ringRadius * 0.4);
        ctx.lineTo(arrow.x + Math.cos(arrow.rotation) * ringRadius * 0.66, arrow.y + Math.sin(arrow.rotation) * ringRadius * 0.66);
        ctx.stroke();
    }

    drawDetailedArrow(ctx, x, y, arrow.rotation + wobble * 0.025, length, alpha, wobble, sprite);
    ctx.restore();
};

const ScreenPlayground: React.FC = () => {
    const [payload, setPayload] = useState<ScreenPlaygroundInitPayload | null>(null);
    const [tool, setTool] = useState<PlaygroundToolId>("hammer");
    const [muted, setMuted] = useState(false);
    const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
    const [sourcePickerOpen, setSourcePickerOpen] = useState(false);
    const [throwFood, setThrowFood] = useState<ThrowFoodId>("tomato");
    const [saveStatus, setSaveStatus] = useState<string | null>(null);
    const [impactCount, setImpactCount] = useState(0);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const cursorRef = useRef<HTMLDivElement | null>(null);
    const hammerAimRef = useRef<HTMLDivElement | null>(null);
    const backgroundImageRef = useRef<HTMLImageElement | null>(null);
    const workingCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const effectsCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const impactsRef = useRef<Impact[]>([]);
    const particlesRef = useRef<Particle[]>([]);
    const creaturesRef = useRef<Creature[]>([]);
    const entitiesRef = useRef<ScreenEntity[]>([]);
    const dragonBreathsRef = useRef<ActiveDragonBreath[]>([]);
    const activeFlamesRef = useRef<ActiveFlame[]>([]);
    const burnResiduesRef = useRef<ActiveBurnResidue[]>([]);
    const activeArrowsRef = useRef<ActiveArrow[]>([]);
    const activeWebsRef = useRef<ActiveWeb[]>([]);
    const skeletonShardsRef = useRef<SkeletonShard[]>([]);
    const dyingSkeletonsRef = useRef<DyingSkeleton[]>([]);
    const fruitProjectilesRef = useRef<FruitProjectile[]>([]);
    const fruitSplatsRef = useRef<FruitSplat[]>([]);
    const monsterAttacksRef = useRef<ActiveMonsterAttack[]>([]);
    const laserTrailRef = useRef<LaserTrailSegment[]>([]);
    const laserSparksRef = useRef<LaserSpark[]>([]);
    const rafRef = useRef<number | null>(null);
    const animationClockRef = useRef(performance.now());
    const toolRef = useRef(tool);
    const throwFoodRef = useRef(throwFood);
    const mutedRef = useRef(muted);
    const pointerRef = useRef({ x: -999, y: -999, smoothX: -999, smoothY: -999 });
    const lastDragImpactRef = useRef({ x: -999, y: -999, at: 0 });
    const lastImpactRef = useRef({ x: -999, y: -999, at: 0, tool: "hammer" as PlaygroundToolId });
    const lastLaserCutRef = useRef({ x: -999, y: -999, angle: -0.62 });
    const lastSoundAtRef = useRef(0);
    const lastImpactCountUpdateRef = useRef(0);
    const hammerSwingRef = useRef(0);
    const heavyHammerSwingRef = useRef({ active: false, startedAt: 0, x: -999, y: -999 });
    const hammerImpactTimeoutsRef = useRef<number[]>([]);
    const slingerRef = useRef<SlingerState>(createSlingerState());
    const laserCutRef = useRef<LaserCutState>(createLaserCutState());
    const laserFragmentActionRef = useRef<((x: number, y: number, angle: number, travel: number) => void) | null>(null);
    const stampBurnScorchRef = useRef<((flame: ActiveFlame) => void) | null>(null);
    const monsterHoleActionRef = useRef<((attack: ActiveMonsterAttack) => string | undefined) | null>(null);
    const skeletonControllersRef = useRef<Map<string, SkeletonController>>(new Map());
    const spritesRef = useRef<PlaygroundSprites>({});

    useEffect(() => { toolRef.current = tool; }, [tool]);
    useEffect(() => { throwFoodRef.current = throwFood; }, [throwFood]);
    useEffect(() => { mutedRef.current = muted; }, [muted]);

    useEffect(() => {
        let cancelled = false;
        Promise.all([
            loadImage(customArrowSrc).then((image) => ["arrow", image] as const),
            loadImage(realisticBurnScorchSrc).then((image) => ["burnScorch", image] as const),
            loadImage(dragonHeadSheetSrc).then((image) => ["dragon", image] as const),
            loadImage(dragonEmberParticleSheetSrc).then((image) => ["emberParticle", image] as const),
            loadImage(dragonFireballSheetSrc).then((image) => ["flame", image] as const),
            loadImage(dragonImpactFlameSheetSrc).then((image) => ["impactFlame", image] as const),
            loadImage(realisticHammerSrc).then((image) => ["hammer", image] as const),
            loadImage(monsterSnakeSheetSrc).then((image) => ["monsterSheet", image] as const),
            loadImage(realisticSkeletonSrc).then((image) => ["skeleton", image] as const),
            loadImage(realisticSpiderSrc).then((image) => ["spider", image] as const),
            loadImage(slingerEggSheetSrc).then((image) => ["eggSheet", image] as const),
            loadImage(slingerFrameSrc).then((image) => ["slingerFrame", image] as const),
            loadImage(slingerStrawberrySheetSrc).then((image) => ["strawberrySheet", image] as const),
            loadImage(slingerTomatoSheetSrc).then((image) => ["tomatoSheet", image] as const),
            loadImage(slingerWatermelonSheetSrc).then((image) => ["watermelonSheet", image] as const),
        ])
            .then((entries) => {
                if (cancelled) return;
                spritesRef.current = Object.fromEntries(entries) as PlaygroundSprites;
            })
            .catch((error) => console.error("[ScreenPlayground] Failed to load reference object sprites", error));
        return () => {
            cancelled = true;
        };
    }, []);

    const restoreDefaultCreatures = useCallback((_width: number, _height: number) => {
        creaturesRef.current = [];
        dyingSkeletonsRef.current = [];
        skeletonControllersRef.current.clear();
    }, []);

    const prepareWorkingCanvas = useCallback((image: HTMLImageElement) => {
        const workingCanvas = document.createElement("canvas");
        workingCanvas.width = image.naturalWidth || image.width;
        workingCanvas.height = image.naturalHeight || image.height;
        const workingCtx = workingCanvas.getContext("2d");
        workingCtx?.drawImage(image, 0, 0, workingCanvas.width, workingCanvas.height);
        workingCanvasRef.current = workingCanvas;
    }, []);

    const loadSourceImage = useCallback((source: Pick<ScreenPlaygroundSource, "dataUrl">) => {
        loadImage(source.dataUrl)
            .then((image) => {
                backgroundImageRef.current = image;
                prepareWorkingCanvas(image);
            })
            .catch((error) => console.error("[ScreenPlayground] Failed to load screenshot", error));
    }, [prepareWorkingCanvas]);

    const getEffectsContext = useCallback((width: number, height: number, dpr: number) => {
        let effectsCanvas = effectsCanvasRef.current;
        if (!effectsCanvas) {
            effectsCanvas = document.createElement("canvas");
            effectsCanvasRef.current = effectsCanvas;
        }

        const targetWidth = Math.max(1, Math.round(width * dpr));
        const targetHeight = Math.max(1, Math.round(height * dpr));
        const resized = effectsCanvas.width !== targetWidth || effectsCanvas.height !== targetHeight;
        if (resized) {
            effectsCanvas.width = targetWidth;
            effectsCanvas.height = targetHeight;
        }

        const effectsCtx = effectsCanvas.getContext("2d");
        if (!effectsCtx) return null;

        effectsCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (resized && impactsRef.current.length > 0) {
            effectsCtx.clearRect(0, 0, width, height);
            impactsRef.current.forEach((impact) => drawImpact(effectsCtx, impact));
        }

        return effectsCtx;
    }, []);

    const clearEffects = useCallback(() => {
        const effectsCanvas = effectsCanvasRef.current;
        const effectsCtx = effectsCanvas?.getContext("2d");
        if (!effectsCanvas || !effectsCtx) return;
        effectsCtx.setTransform(1, 0, 0, 1, 0, 0);
        effectsCtx.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);
    }, []);

    const cacheImpact = useCallback((impact: Impact) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const dpr = Math.min(RENDER_DPR_CAP, window.devicePixelRatio || 1);
        const effectsCtx = getEffectsContext(width, height, dpr);
        if (!effectsCtx) return;

        drawImpact(effectsCtx, impact);
    }, [getEffectsContext]);

    const stampLaserSeam = useCallback((segment: LaserTrailSegment) => {
        const surface = canvasRef.current;
        const workingCanvas = workingCanvasRef.current;
        const workingCtx = workingCanvas?.getContext("2d", { willReadFrequently: true });
        if (!surface || !workingCanvas || !workingCtx) return;

        const rect = getBackgroundDrawRect(surface.clientWidth, surface.clientHeight, workingCanvas.width, workingCanvas.height);
        const startX = (segment.startX - rect.x) / rect.scale;
        const startY = (segment.startY - rect.y) / rect.scale;
        const endX = (segment.endX - rect.x) / rect.scale;
        const endY = (segment.endY - rect.y) / rect.scale;
        if (
            endX < 0 || endY < 0 || endX >= workingCanvas.width || endY >= workingCanvas.height
            || startX < -64 || startY < -64 || startX > workingCanvas.width + 64 || startY > workingCanvas.height + 64
        ) {
            return;
        }

        const edgeX = Math.cos(segment.angle + Math.PI / 2);
        const edgeY = Math.sin(segment.angle + Math.PI / 2);
        const width = Math.max(1.4, segment.width / rect.scale);
        const controlX = (startX + endX) * 0.5 + edgeX * Math.min(10 / rect.scale, width * 0.28);
        const controlY = (startY + endY) * 0.5 + edgeY * Math.min(10 / rect.scale, width * 0.28);
        const tracePath = (ctx: CanvasRenderingContext2D, offset = 0) => {
            ctx.beginPath();
            ctx.moveTo(startX + edgeX * offset, startY + edgeY * offset);
            ctx.quadraticCurveTo(controlX + edgeX * offset, controlY + edgeY * offset, endX + edgeX * offset, endY + edgeY * offset);
        };

        workingCtx.save();
        workingCtx.lineCap = "round";
        workingCtx.lineJoin = "round";
        workingCtx.globalCompositeOperation = "multiply";
        workingCtx.strokeStyle = "rgba(0,0,0,0.92)";
        workingCtx.lineWidth = width * 1.22;
        tracePath(workingCtx);
        workingCtx.stroke();

        workingCtx.strokeStyle = "rgba(8,8,8,0.98)";
        workingCtx.lineWidth = Math.max(0.9, width * 0.48);
        tracePath(workingCtx);
        workingCtx.stroke();

        workingCtx.globalCompositeOperation = "source-over";
        workingCtx.strokeStyle = "rgba(20,20,20,0.62)";
        workingCtx.lineWidth = Math.max(0.6, width * 0.16);
        tracePath(workingCtx, width * 0.62);
        workingCtx.stroke();
        tracePath(workingCtx, -width * 0.62);
        workingCtx.stroke();
        workingCtx.restore();
    }, []);

    const emitLaserSparks = useCallback((x: number, y: number, angle: number, now: number) => {
        const count = 5 + Math.floor(Math.random() * 6);
        const sparks: LaserSpark[] = [];
        for (let index = 0; index < count; index += 1) {
            const side = index % 2 === 0 ? 1 : -1;
            const theta = angle + side * (Math.PI / 2) + (Math.random() - 0.5) * 1.18;
            const speed = 0.22 + Math.random() * 0.58;
            sparks.push({
                id: `laser-spark-${now.toString(36)}-${index}-${Math.random().toString(36).slice(2, 6)}`,
                x,
                y,
                prevX: x,
                prevY: y,
                vx: Math.cos(theta) * speed,
                vy: Math.sin(theta) * speed - (0.08 + Math.random() * 0.26),
                width: 0.9 + Math.random() * 1.6,
                createdAt: now,
                life: 500 + Math.random() * 1000,
                bounces: 0,
            });
        }
        laserSparksRef.current = [...laserSparksRef.current, ...sparks].slice(-60);
    }, []);

    const commitLaserTrail = useCallback((startX: number, startY: number, endX: number, endY: number, angle: number, now: number) => {
        const travel = Math.hypot(endX - startX, endY - startY);
        if (travel < 0.35) return;

        const segment: LaserTrailSegment = {
            id: `laser-trail-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            startX,
            startY,
            endX,
            endY,
            angle,
            width: Math.max(8, Math.min(18, 8 + travel * 0.18)),
            createdAt: now,
            life: 1850,
        };
        laserTrailRef.current = [...laserTrailRef.current, segment].slice(-72);
        stampLaserSeam(segment);
        emitLaserSparks(endX, endY, angle, now);
        laserFragmentActionRef.current?.(endX, endY, angle, travel);
    }, [emitLaserSparks, stampLaserSeam]);

    const spawnFruitSplat = useCallback((projectile: FruitProjectile, now: number) => {
        const profile = foodStyle(projectile.food);
        const hitAngle = Math.atan2(projectile.vy, projectile.vx || 0.001);
        const radius = profile.radius * profile.splatScale * (0.9 + flameNoise(projectile.seed, 10.2) * 0.28);
        fruitSplatsRef.current = [
            ...fruitSplatsRef.current.slice(-5),
            {
                id: `splat-${projectile.id}`,
                food: projectile.food,
                x: projectile.x,
                y: projectile.y,
                originY: projectile.y,
                radius,
                rotation: hitAngle + (flameNoise(projectile.seed, 21.7) - 0.5) * 0.95,
                scaleX: 0.86 + flameNoise(projectile.seed, 31.3) * 0.48,
                scaleY: 0.72 + flameNoise(projectile.seed, 41.9) * 0.36,
                slideSpeed: profile.slideSpeed[0] + flameNoise(projectile.seed, 52.5) * (profile.slideSpeed[1] - profile.slideSpeed[0]),
                seed: projectile.seed,
                createdAt: now,
                life: ((projectile.food === "watermelon" ? 5200 : 4200) + flameNoise(projectile.seed, 61.1) * 1200) * SLINGER_SPRITE_SPLAT_LIFE_MULTIPLIER,
            },
        ];

        setImpactCount((count) => count + 1);
        if (!mutedRef.current && now - lastSoundAtRef.current > 42) {
            lastSoundAtRef.current = now;
            playToolSound("throw");
        }
    }, []);

    useEffect(() => {
        const cleanup = window.screenPlaygroundAPI?.onInit((nextPayload) => {
            setPayload(nextPayload);
            const initialSource = nextPayload.sources[0] ?? {
                id: "primary-screen",
                name: "Primary Screen",
                kind: "screen" as const,
                dataUrl: nextPayload.screenshotDataUrl,
            };
            setSelectedSourceId(initialSource.id);
            restoreDefaultCreatures(nextPayload.display.width, nextPayload.display.height);
            loadSourceImage(initialSource);
        });

        return () => cleanup?.();
    }, [loadSourceImage, restoreDefaultCreatures]);

    const drawFrame = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d", { alpha: false });
        if (!canvas || !ctx) return;

        const width = canvas.clientWidth;
        const height = canvas.clientHeight;
        const dpr = Math.min(RENDER_DPR_CAP, window.devicePixelRatio || 1);
        const targetWidth = Math.max(1, Math.round(width * dpr));
        const targetHeight = Math.max(1, Math.round(height * dpr));
        if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
            canvas.width = targetWidth;
            canvas.height = targetHeight;
        }

        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.clearRect(0, 0, width, height);
        const background = workingCanvasRef.current ?? backgroundImageRef.current;
        if (background) {
            const rect = getBackgroundDrawRect(width, height, background.width, background.height);
            ctx.drawImage(background, rect.x, rect.y, rect.width, rect.height);
        } else {
            ctx.fillStyle = "#05070d";
            ctx.fillRect(0, 0, width, height);
        }

        ctx.fillStyle = "rgba(2,6,23,0.06)";
        ctx.fillRect(0, 0, width, height);
        const effectsCtx = getEffectsContext(width, height, dpr);
        if (effectsCtx && effectsCanvasRef.current) {
            ctx.drawImage(effectsCanvasRef.current, 0, 0, width, height);
        }
        const now = performance.now();
        const deltaMs = Math.max(8, Math.min(40, now - animationClockRef.current || 16));
        const deltaScale = deltaMs / 16;
        animationClockRef.current = now;
        const slinger = slingerRef.current;
        if (slinger.active) {
            const pullEase = 1 - Math.exp(-deltaMs / 34);
            slinger.pullX += ((Number.isFinite(slinger.targetPullX) ? slinger.targetPullX : slinger.pullX) - slinger.pullX) * pullEase;
            slinger.pullY += ((Number.isFinite(slinger.targetPullY) ? slinger.targetPullY : slinger.pullY) - slinger.pullY) * pullEase;
        }

        laserTrailRef.current = laserTrailRef.current.filter((segment) => now - segment.createdAt < segment.life);
        if (laserTrailRef.current.length > 0) {
            ctx.save();
            ctx.lineCap = "round";
            ctx.lineJoin = "round";
            ctx.globalCompositeOperation = "lighter";
            laserTrailRef.current.forEach((segment) => {
                const age = now - segment.createdAt;
                const t = Math.max(0, Math.min(1, age / segment.life));
                const freshness = 1 - t;
                const cooling = Math.max(0, 1 - age / LASER_FRESH_GLOW_MS);
                
                const edgeX = Math.cos(segment.angle + Math.PI / 2);
                const edgeY = Math.sin(segment.angle + Math.PI / 2);
                const controlX = (segment.startX + segment.endX) * 0.5 + edgeX * segment.width * 0.22;
                const controlY = (segment.startY + segment.endY) * 0.5 + edgeY * segment.width * 0.22;
                
                const drawTrail = (widthValue: number, stroke: string, blur: number) => {
                    ctx.strokeStyle = stroke;
                    ctx.lineWidth = widthValue;
                    if (blur > 0) {
                        ctx.shadowColor = stroke;
                        ctx.shadowBlur = blur;
                    } else {
                        ctx.shadowBlur = 0;
                    }
                    ctx.beginPath();
                    ctx.moveTo(segment.startX, segment.startY);
                    ctx.quadraticCurveTo(controlX, controlY, segment.endX, segment.endY);
                    ctx.stroke();
                };

                // Molten outer glow (Orange/Red)
                drawTrail(
                    segment.width * (1.25 + cooling * 0.42),
                    `rgba(185,28,28,${0.38 * cooling})`,
                    18 * cooling
                );
                
                // Heat core (Orange/Yellow)
                drawTrail(
                    segment.width * (0.86 + cooling * 0.18),
                    `rgba(249,115,22,${0.54 * freshness})`,
                    8 * cooling
                );

                // Incandescent center (White/Yellow)
                if (cooling > 0.15) {
                    drawTrail(
                        Math.max(2, segment.width * (0.24 + cooling * 0.12)),
                        `rgba(254,240,138,${0.92 * cooling})`,
                        4 * cooling
                    );
                }
            });
            ctx.restore();
        }

        if (toolRef.current === "laser" && laserCutRef.current.active && laserCutRef.current.initialized) {
            const cut = laserCutRef.current;
            const bloom = ctx.createRadialGradient(cut.tipX, cut.tipY, 0, cut.tipX, cut.tipY, 42);
            bloom.addColorStop(0, "rgba(255,255,255,0.94)");
            bloom.addColorStop(0.16, "rgba(254,240,138,0.74)");
            bloom.addColorStop(0.42, "rgba(249,115,22,0.42)");
            bloom.addColorStop(1, "rgba(0,0,0,0)");
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.fillStyle = bloom;
            ctx.beginPath();
            ctx.arc(cut.tipX, cut.tipY, 42, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }

        laserSparksRef.current = laserSparksRef.current
            .map((spark) => {
                const nextAge = now - spark.createdAt;
                if (nextAge >= spark.life) return null;
                let nextVy = spark.vy + 0.00135 * deltaMs;
                let nextVx = spark.vx * 0.996;
                let nextX = spark.x + nextVx * deltaMs;
                let nextY = spark.y + nextVy * deltaMs;
                let nextBounces = spark.bounces;
                if (nextY > height - 2 && nextBounces < 2) {
                    nextY = height - 2;
                    nextVy *= -0.34;
                    nextVx *= 0.76;
                    nextBounces += 1;
                }
                return {
                    ...spark,
                    prevX: spark.x,
                    prevY: spark.y,
                    x: nextX,
                    y: nextY,
                    vx: nextVx,
                    vy: nextVy,
                    bounces: nextBounces,
                };
            })
            .filter((spark): spark is LaserSpark => spark !== null);

        if (laserSparksRef.current.length > 0) {
            ctx.save();
            ctx.globalCompositeOperation = "lighter";
            ctx.lineCap = "round";
            laserSparksRef.current.forEach((spark) => {
                const age = now - spark.createdAt;
                const alpha = Math.max(0, 1 - age / spark.life);
                const speed = Math.hypot(spark.vx, spark.vy);
                const length = 2 + speed * 4.2;
                const angle = Math.atan2(spark.vy, spark.vx);
                
                ctx.strokeStyle = `rgba(255,248,196,${0.96 * alpha})`;
                ctx.lineWidth = spark.width;
                ctx.shadowColor = `rgba(251,191,36,${0.82 * alpha})`;
                ctx.shadowBlur = 10 * alpha;
                
                ctx.beginPath();
                ctx.moveTo(spark.x - Math.cos(angle) * length, spark.y - Math.sin(angle) * length);
                ctx.lineTo(spark.x, spark.y);
                ctx.stroke();
            });
            ctx.restore();
        }

        fruitSplatsRef.current = fruitSplatsRef.current
            .map((splat) => ({
                ...splat,
                y: splat.y + splat.slideSpeed * deltaMs,
            }))
            .filter((splat) => now - splat.createdAt < splat.life && splat.y - splat.radius < height + 80);
        fruitSplatsRef.current.forEach((splat) => drawFruitSplat(ctx, splat, now, spritesRef.current));

        const nextProjectiles: FruitProjectile[] = [];
        fruitProjectilesRef.current.forEach((projectile) => {
            const profile = foodStyle(projectile.food);
            const nextProjectile = {
                ...projectile,
                x: projectile.x + projectile.vx * deltaMs,
                y: projectile.y + projectile.vy * deltaMs,
                z: projectile.z + projectile.vz * deltaMs,
                vy: projectile.vy + SLINGER_GRAVITY * deltaMs * profile.mass,
                rotation: projectile.rotation + projectile.spin * deltaMs,
            };
            if (nextProjectile.z <= 0) {
                spawnFruitSplat(nextProjectile, now);
            } else if (
                nextProjectile.x > -100
                && nextProjectile.x < width + 100
                && nextProjectile.y > -140
                && nextProjectile.y < height + 140
            ) {
                nextProjectiles.push(nextProjectile);
                drawFruitProjectile(ctx, nextProjectile, spritesRef.current);
            }
        });
        fruitProjectilesRef.current = nextProjectiles.slice(-18);

        if (toolRef.current === "throw") {
            const fallbackX = pointerRef.current.smoothX > -100 ? Math.max(74, Math.min(width - 74, pointerRef.current.smoothX)) : width * 0.5;
            const fallbackY = pointerRef.current.smoothY > -100 ? Math.max(74, Math.min(height - 142, pointerRef.current.smoothY)) : height * 0.62;
            drawSlingerSafely(ctx, slingerRef.current, throwFoodRef.current, now, fallbackX, fallbackY, spritesRef.current);
        }

        monsterAttacksRef.current = monsterAttacksRef.current
            .map((attack) => {
                if (!attack.holeStamped && now - attack.createdAt >= MONSTER_HIT_MS) {
                    monsterHoleActionRef.current?.(attack);
                    return { ...attack, holeStamped: true };
                }
                return attack;
            })
            .filter((attack) => now - attack.createdAt < attack.life);
        monsterAttacksRef.current.forEach((attack) => drawMonsterAttack(ctx, attack, now, spritesRef.current.monsterSheet));

        dragonBreathsRef.current = dragonBreathsRef.current.filter((breath) => now - breath.createdAt < breath.life);
        if (toolRef.current === "burn" && dragonBreathsRef.current.length === 0) {
            const focusY = pointerRef.current.smoothY > -100 ? pointerRef.current.smoothY : height * 0.54;
            drawIdleDragonHead(ctx, width, height, focusY, now, spritesRef.current.dragon);
        }
        dragonBreathsRef.current.forEach((breath) => drawDragonBreath(ctx, breath, now, spritesRef.current.dragon, spritesRef.current.flame));

        const liveFlames: ActiveFlame[] = [];
        activeFlamesRef.current.forEach((flame) => {
            if (now - flame.createdAt < flame.life) {
                liveFlames.push(flame);
                return;
            }
            stampBurnScorchRef.current?.(flame);
            burnResiduesRef.current = [
                ...burnResiduesRef.current.slice(-10),
                {
                    id: `residue-${flame.id}`,
                    x: flame.x,
                    y: flame.y,
                    radius: flame.radius,
                    rotation: flame.rotation,
                    seed: flame.seed,
                    createdAt: now,
                    life: 1700,
                },
            ];
        });
        activeFlamesRef.current = liveFlames;
        activeFlamesRef.current.forEach((flame) => drawLiveFlame(ctx, flame, now, spritesRef.current.impactFlame));
        burnResiduesRef.current = burnResiduesRef.current.filter((residue) => now - residue.createdAt < residue.life);
        burnResiduesRef.current.forEach((residue) => drawBurnResidue(ctx, residue, now, spritesRef.current.burnScorch));
        activeArrowsRef.current = activeArrowsRef.current.filter((arrow) => now - arrow.createdAt < arrow.life);
        activeArrowsRef.current.forEach((arrow) => drawLiveArrow(ctx, arrow, now, spritesRef.current.arrow));
        activeWebsRef.current = activeWebsRef.current.filter((web) => now - web.createdAt < web.life);
        activeWebsRef.current.forEach((web) => drawSpiderWeb(ctx, web, now));
        skeletonShardsRef.current = skeletonShardsRef.current
            .map((shard) => ({
                ...shard,
                x: shard.x + shard.vx * deltaScale,
                y: shard.y + shard.vy * deltaScale,
                vy: shard.vy + 0.075 * deltaScale,
                vx: shard.vx * 0.992,
                rotation: shard.rotation + shard.spin * deltaScale,
                spin: shard.spin * 0.994,
            }))
            .filter((shard) => now - shard.createdAt < shard.life && shard.y < height + 80);
        skeletonShardsRef.current.forEach((shard) => drawSkeletonShard(ctx, shard, now));
        dyingSkeletonsRef.current = dyingSkeletonsRef.current.filter((skeleton) => !skeleton.controller.isShotDeathComplete(now));
        dyingSkeletonsRef.current.forEach((skeleton) => skeleton.controller.draw(ctx, now, spritesRef.current.skeleton));
        particlesRef.current = stepParticlesMutable(particlesRef.current);
        const particleCount = particlesRef.current.length;
        particlesRef.current.forEach((particle, index) => {
            if (particleCount > 140 && particle.shape !== "spark" && index % 2 === 1) return;
            drawPlaygroundParticle(ctx, particle, spritesRef.current.emberParticle);
        });
        entitiesRef.current = entitiesRef.current
            .map((entity) => {
                const grabbed = (entity.grabbedUntil ?? 0) > now;
                const anchorX = entity.grabAnchorX ?? entity.x;
                const anchorY = entity.grabAnchorY ?? entity.y;
                return {
                    ...entity,
                    x: grabbed ? entity.x + (anchorX - entity.x) * 0.08 : entity.x + entity.vx,
                    y: grabbed ? entity.y + (anchorY - entity.y) * 0.08 : entity.y + entity.vy,
                    vx: grabbed ? entity.vx * 0.78 : entity.vx * 0.988,
                    vy: grabbed ? entity.vy * 0.78 : (entity.vy + (entity.gravity ?? 0.14)) * 0.992,
                    rotation: entity.rotation + (grabbed ? entity.spin * 0.16 : entity.spin),
                    spin: entity.spin * (grabbed ? 0.92 : 0.992),
                    life: entity.life - 1,
                };
            })
            .filter((entity) => entity.life > 0 && entity.y < height + entity.height * 2);
        entitiesRef.current.forEach((entity) => {
            const age = 1 - Math.max(0, Math.min(1, entity.life / entity.maxLife));
            const fadeIn = Math.min(1, age / 0.14);
            const fadeOut = Math.max(0, Math.min(1, entity.life / 26));
            const alpha = fadeIn * fadeOut;
            ctx.save();
            ctx.globalAlpha = alpha;
            ctx.translate(entity.x, entity.y);
            ctx.rotate(entity.rotation);
            ctx.drawImage(entity.canvas, -entity.width / 2, -entity.height / 2, entity.width, entity.height);
            ctx.restore();
        });
        creaturesRef.current = stepCreaturesMutable(creaturesRef.current, width, height);
        
        const controllers = skeletonControllersRef.current;
        creaturesRef.current.forEach((creature) => {
            if (creature.kind === "skeleton") {
                let controller = controllers.get(creature.id);
                if (!controller) {
                    controller = new SkeletonController(creature.x, creature.y, creature.size, creature.seed);
                    controllers.set(creature.id, controller);
                }
                controller.update(now, deltaMs, creature.vx, creature.vy, creature.size * (creature.mergeScale ?? 1));
                controller.draw(ctx, now, spritesRef.current.skeleton);
                creature.x = controller.x;
                creature.y = controller.y;
            } else if (creature.kind === "spider") {
                if ((creature.webCooldown ?? 1) <= 0 && Math.random() < 0.028) {
                    activeWebsRef.current = [
                        ...activeWebsRef.current.slice(-16),
                        {
                            id: `web-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                            x: creature.x - Math.cos(Math.atan2(creature.vy, creature.vx || 0.001)) * creature.size * 0.28,
                            y: creature.y - Math.sin(Math.atan2(creature.vy, creature.vx || 0.001)) * creature.size * 0.28,
                            radius: creature.size * (0.46 + Math.random() * 0.34),
                            rotation: Math.random() * Math.PI * 2,
                            seed: creature.seed + now,
                            createdAt: now,
                            life: 8500 + Math.random() * 6500,
                        },
                    ];
                    creature.webCooldown = 650 + Math.random() * 1250;
                }
                drawSpider(ctx, creature, now, spritesRef.current.spider);
            }
        });
        const creatureIds = new Set(creaturesRef.current.map(c => c.id));
        for (const id of controllers.keys()) {
            if (!creatureIds.has(id)) controllers.delete(id);
        }

        ctx.restore();

        const pointer = pointerRef.current;
        pointer.smoothX += (pointer.x - pointer.smoothX) * 0.42;
        pointer.smoothY += (pointer.y - pointer.smoothY) * 0.42;

        const cursor = cursorRef.current;
        if (cursor) {
            const frameNow = performance.now();
            const laserCut = laserCutRef.current;
            const isLaserTool = toolRef.current === "laser";
            const holdDepth = isLaserTool && laserCut.active
                ? easeOutCubic(Math.min(1, Math.max(0, (frameNow - laserCut.holdStartAt) / 560)))
                : 0;
            if (isLaserTool && laserCut.active && laserCut.initialized) {
                const previousTipX = laserCut.tipX;
                const previousTipY = laserCut.tipY;
                laserCut.tipX += (laserCut.targetX - laserCut.tipX) * LASER_TIP_RESISTANCE;
                laserCut.tipY += (laserCut.targetY - laserCut.tipY) * LASER_TIP_RESISTANCE;
                const travel = Math.hypot(laserCut.tipX - previousTipX, laserCut.tipY - previousTipY);
                if (travel > 0.22) {
                    const nextAngle = Math.atan2(laserCut.tipY - previousTipY, laserCut.tipX - previousTipX);
                    laserCut.angle += (nextAngle - laserCut.angle) * LASER_ANGLE_FOLLOW;
                    lastLaserCutRef.current = { x: laserCut.tipX, y: laserCut.tipY, angle: laserCut.angle };
                    if (frameNow - laserCut.lastEmitAt >= LASER_HOLD_CUT_MS) {
                        commitLaserTrail(previousTipX, previousTipY, laserCut.tipX, laserCut.tipY, laserCut.angle, frameNow);
                        laserCut.lastEmitAt = frameNow;
                    }
                }
                laserCut.lastTipX = laserCut.tipX;
                laserCut.lastTipY = laserCut.tipY;
            }

            const isHammerTool = toolRef.current === "hammer";
            const bladeAngle = isLaserTool ? laserCut.angle : lastLaserCutRef.current.angle;
            const bladeLength = 178 + holdDepth * 78;
            const plunge = holdDepth * 22;
            const heavyHammer = heavyHammerSwingRef.current;
            const heavyElapsed = frameNow - heavyHammer.startedAt;
            const heavyActive = isHammerTool && heavyHammer.active && heavyElapsed >= 0 && heavyElapsed < HEAVY_HAMMER_SWING_MS;
            if (heavyHammer.active && heavyElapsed >= HEAVY_HAMMER_SWING_MS) {
                heavyHammer.active = false;
            }
            const heavyFlightT = heavyActive ? Math.min(1, heavyElapsed / HEAVY_HAMMER_IMPACT_DELAY_MS) : 1;
            const heavySpin = easeOutCubic(heavyFlightT);
            const heavyLandingBounce = heavyActive && heavyFlightT > 0.9 ? Math.sin(((heavyFlightT - 0.9) / 0.1) * Math.PI) : 0;
            const holdPress = isLaserTool && laserCut.active ? 1 : 0;
            const hammerElapsed = frameNow - hammerSwingRef.current;
            const hammerT = hammerElapsed < HAMMER_SWING_MS ? Math.min(1, hammerElapsed / HAMMER_SWING_MS) : 1;
            const hammerWindup = hammerT < HAMMER_WINDUP_T ? easeOutCubic(hammerT / HAMMER_WINDUP_T) : 1;
            const hammerAttack = hammerT < HAMMER_WINDUP_T
                ? 0
                : hammerT < HAMMER_IMPACT_T
                    ? easeOutCubic((hammerT - HAMMER_WINDUP_T) / (HAMMER_IMPACT_T - HAMMER_WINDUP_T))
                    : 1;
            const hammerRecover = hammerT < HAMMER_IMPACT_T ? 0 : easeOutCubic((hammerT - HAMMER_IMPACT_T) / (1 - HAMMER_IMPACT_T));
            const hammerSnap = hammerT > HAMMER_IMPACT_T && hammerT < HAMMER_IMPACT_T + 0.18
                ? Math.sin(((hammerT - HAMMER_IMPACT_T) / 0.18) * Math.PI)
                : 0;
            const hammerSwingRotation = hammerT < HAMMER_WINDUP_T
                ? HAMMER_IDLE_ROTATION + (HAMMER_WINDUP_ROTATION - HAMMER_IDLE_ROTATION) * hammerWindup
                : hammerT < HAMMER_IMPACT_T
                    ? HAMMER_WINDUP_ROTATION + (HAMMER_IMPACT_ROTATION - HAMMER_WINDUP_ROTATION) * hammerAttack
                    : HAMMER_IMPACT_ROTATION + (HAMMER_IDLE_ROTATION - HAMMER_IMPACT_ROTATION) * hammerRecover + hammerSnap * 6;
            const hammerRotation = isHammerTool
                ? heavyActive
                    ? HAMMER_IDLE_ROTATION + ((HAMMER_IMPACT_ROTATION + 360) - HAMMER_IDLE_ROTATION) * heavySpin + heavyLandingBounce * 7
                    : hammerSwingRotation
                : 0;
            const finalRotation = isLaserTool ? bladeAngle * (180 / Math.PI) + 90 : hammerRotation;
            const finalScale = isLaserTool ? 1 + holdDepth * 0.04 : isHammerTool ? (heavyActive ? 1.02 + heavyLandingBounce * 0.05 : 1) : 1;
            const hammerTargetX = heavyActive ? heavyHammer.x : pointer.x + HAMMER_TARGET_OFFSET_X;
            const hammerTargetY = heavyActive ? heavyHammer.y : pointer.y + HAMMER_TARGET_OFFSET_Y;
            const hammerHandle = getHammerHandleForTarget(hammerTargetX, hammerTargetY, HAMMER_IMPACT_ROTATION, finalScale);
            const hammerTopLeft = isHammerTool
                ? {
                    x: hammerHandle.x - HAMMER_HAND_PIVOT_X,
                    y: hammerHandle.y - HAMMER_HAND_PIVOT_Y,
                }
                : { x: pointer.smoothX, y: pointer.smoothY };
            const cursorBaseX = isLaserTool && laserCut.initialized
                ? laserCut.tipX
                : isHammerTool
                    ? hammerTopLeft.x
                    : pointer.smoothX;
            const cursorBaseY = isLaserTool && laserCut.initialized
                ? laserCut.tipY
                : isHammerTool
                    ? hammerTopLeft.y
                    : pointer.smoothY;
            const finalOffset = "-10px";

            cursor.style.setProperty("--laser-blade-length", `${bladeLength}px`);
            cursor.style.setProperty("--laser-plunge", `${plunge}px`);
            cursor.style.setProperty("--laser-heat", `${0.72 + holdDepth * 0.46}`);
            cursor.style.setProperty("--hammer-shadow-opacity", "0");
            cursor.style.setProperty("--hammer-shadow-scale", "0");
            cursor.style.setProperty("--hammer-shock-opacity", "0");
            cursor.style.transform = isHammerTool
                ? `translate3d(${cursorBaseX}px, ${cursorBaseY}px, 0) rotate(${finalRotation}deg) scale(${finalScale})`
                : `translate3d(${cursorBaseX}px, ${cursorBaseY}px, 0) translate(-50%, ${finalOffset}) rotate(${finalRotation}deg) scale(${finalScale})`;
            cursor.classList.toggle("laser-pressing", holdPress > 0);
            cursor.classList.toggle("throwing", false);
        }
        const hammerAim = hammerAimRef.current;
        if (hammerAim) {
            const heavyHammer = heavyHammerSwingRef.current;
            const heavyAimElapsed = now - heavyHammer.startedAt;
            const heavyAimActive = heavyHammer.active && heavyAimElapsed >= 0 && heavyAimElapsed < HEAVY_HAMMER_SWING_MS;
            const visible = toolRef.current === "hammer" && (heavyAimActive || (pointer.x > -100 && pointer.y > -100));
            const aimT = heavyAimActive
                ? Math.min(1, heavyAimElapsed / HEAVY_HAMMER_IMPACT_DELAY_MS)
                : now - hammerSwingRef.current < HAMMER_SWING_MS ? Math.min(1, (now - hammerSwingRef.current) / HAMMER_SWING_MS) : 1;
            const preImpactT = Math.max(0, Math.min(1, aimT / HAMMER_IMPACT_T));
            const postImpactT = Math.max(0, Math.min(1, (aimT - HAMMER_IMPACT_T) / (1 - HAMMER_IMPACT_T)));
            const aimStrike = heavyAimActive
                ? easeOutCubic(aimT)
                : aimT < HAMMER_IMPACT_T ? easeOutCubic(preImpactT) : Math.max(0, 1 - easeOutCubic(postImpactT));
            const strikeAlpha = heavyAimActive ? 0.3 + aimStrike * 0.62 : 0.24 + aimStrike * 0.5;
            const targetX = heavyAimActive ? heavyHammer.x : pointer.x + HAMMER_TARGET_OFFSET_X;
            const targetY = heavyAimActive ? heavyHammer.y : pointer.y + HAMMER_TARGET_OFFSET_Y;
            hammerAim.style.opacity = visible ? `${strikeAlpha}` : "0";
            hammerAim.style.transform = `translate3d(${targetX}px, ${targetY}px, 0) translate(-50%, -50%)`;
        }

        rafRef.current = window.requestAnimationFrame(drawFrame);
    }, [commitLaserTrail, getEffectsContext, spawnFruitSplat]);

    useEffect(() => {
        rafRef.current = window.requestAnimationFrame(drawFrame);
        return () => {
            if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
            hammerImpactTimeoutsRef.current.forEach((timeoutId) => window.clearTimeout(timeoutId));
            hammerImpactTimeoutsRef.current = [];
            heavyHammerSwingRef.current.active = false;
        };
    }, [drawFrame]);

    const spawnScreenEntity = useCallback((entity: Omit<ScreenEntity, "id">) => {
        entitiesRef.current = [
            ...entitiesRef.current,
            {
                ...entity,
                id: `entity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
            },
        ].slice(-MAX_ENTITIES);
    }, []);

    const spawnFallbackShards = useCallback((
        x: number,
        y: number,
        imageX: number,
        imageY: number,
        rect: ReturnType<typeof getBackgroundDrawRect>,
        workingCanvas: HTMLCanvasElement,
        workingCtx: CanvasRenderingContext2D,
        base: { r: number; g: number; b: number },
        patchBackground: boolean,
    ): string | undefined => {
        const shardSize = Math.max(10, Math.min(20, 16 / rect.scale));
        const sampleX = Math.max(0, Math.min(workingCanvas.width - 1, Math.round(imageX)));
        const sampleY = Math.max(0, Math.min(workingCanvas.height - 1, Math.round(imageY)));
        const sample = workingCtx.getImageData(sampleX, sampleY, 1, 1).data;
        const fallbackChance = patchBackground ? 0.34 : 0.18;
        if (Math.random() > fallbackChance) {
            return `rgb(${sample[0]},${sample[1]},${sample[2]})`;
        }
        const placements = [
            { dx: -0.72, dy: -0.22, vx: -1.25, vy: -0.15, spin: -0.055 },
            { dx: 0.16, dy: -0.58, vx: 0.24, vy: -0.34, spin: 0.044 },
            { dx: 0.62, dy: 0.18, vx: 1.16, vy: 0.08, spin: 0.064 },
        ].slice(0, Math.random() < 0.62 ? 2 : 1);

        for (const [index, placement] of placements.entries()) {
            const sourceX = Math.max(0, Math.min(workingCanvas.width - shardSize, imageX + placement.dx * shardSize));
            const sourceY = Math.max(0, Math.min(workingCanvas.height - shardSize, imageY + placement.dy * shardSize));
            const sourceSize = Math.max(8, Math.min(shardSize, workingCanvas.width - sourceX, workingCanvas.height - sourceY));
            const shardCanvas = document.createElement("canvas");
            shardCanvas.width = Math.ceil(sourceSize);
            shardCanvas.height = Math.ceil(sourceSize);
            const shardCtx = shardCanvas.getContext("2d");
            if (!shardCtx) continue;

            const drawShardPath = (ctx: CanvasRenderingContext2D, offsetX = 0, offsetY = 0) => {
                ctx.beginPath();
                if (index === 0) {
                    ctx.moveTo(offsetX + sourceSize * 0.12, offsetY + sourceSize * 0.16);
                    ctx.lineTo(offsetX + sourceSize * 0.62, offsetY + sourceSize * 0.04);
                    ctx.lineTo(offsetX + sourceSize * 0.94, offsetY + sourceSize * 0.4);
                    ctx.lineTo(offsetX + sourceSize * 0.46, offsetY + sourceSize * 0.86);
                    ctx.lineTo(offsetX + sourceSize * 0.18, offsetY + sourceSize * 0.72);
                } else if (index === 1) {
                    ctx.moveTo(offsetX + sourceSize * 0.48, offsetY + sourceSize * 0.06);
                    ctx.lineTo(offsetX + sourceSize * 0.9, offsetY + sourceSize * 0.46);
                    ctx.lineTo(offsetX + sourceSize * 0.72, offsetY + sourceSize * 0.9);
                    ctx.lineTo(offsetX + sourceSize * 0.12, offsetY + sourceSize * 0.86);
                    ctx.lineTo(offsetX + sourceSize * 0.24, offsetY + sourceSize * 0.3);
                } else {
                    ctx.moveTo(offsetX + sourceSize * 0.08, offsetY + sourceSize * 0.32);
                    ctx.lineTo(offsetX + sourceSize * 0.66, offsetY + sourceSize * 0.1);
                    ctx.lineTo(offsetX + sourceSize * 0.92, offsetY + sourceSize * 0.62);
                    ctx.lineTo(offsetX + sourceSize * 0.58, offsetY + sourceSize * 0.92);
                    ctx.lineTo(offsetX + sourceSize * 0.2, offsetY + sourceSize * 0.78);
                }
                ctx.closePath();
            };

            shardCtx.save();
            drawShardPath(shardCtx);
            shardCtx.clip();
            shardCtx.drawImage(workingCanvas, sourceX, sourceY, sourceSize, sourceSize, 0, 0, sourceSize, sourceSize);
            shardCtx.globalCompositeOperation = "screen";
            shardCtx.strokeStyle = "rgba(255,255,255,0.24)";
            shardCtx.lineWidth = Math.max(0.7, sourceSize * 0.035);
            shardCtx.stroke();
            shardCtx.restore();

            if (patchBackground) {
                workingCtx.save();
                workingCtx.globalAlpha = 0.34;
                workingCtx.fillStyle = `rgb(${base.r},${base.g},${base.b})`;
                drawShardPath(workingCtx, sourceX, sourceY);
                workingCtx.fill();
                workingCtx.restore();
            }

            spawnScreenEntity({
                canvas: shardCanvas,
                x: x + placement.dx * shardSize * rect.scale,
                y: y + placement.dy * shardSize * rect.scale,
                width: sourceSize * rect.scale,
                height: sourceSize * rect.scale,
                vx: placement.vx,
                vy: placement.vy,
                rotation: (Math.random() - 0.5) * 0.34,
                spin: placement.spin,
                life: patchBackground ? 48 : 32,
                maxLife: patchBackground ? 48 : 32,
                gravity: patchBackground ? 0.18 : 0.14,
            });
        }

        return `rgb(${sample[0]},${sample[1]},${sample[2]})`;
    }, [spawnScreenEntity]);

    const extractEntityAtImpact = useCallback((x: number, y: number, radius: number, patchBackground = true, spawnEntity = true): string | undefined => {
        const surface = canvasRef.current;
        const workingCanvas = workingCanvasRef.current;
        const workingCtx = workingCanvas?.getContext("2d", { willReadFrequently: true });
        if (!surface || !workingCanvas || !workingCtx) return undefined;

        const rect = getBackgroundDrawRect(surface.clientWidth, surface.clientHeight, workingCanvas.width, workingCanvas.height);
        const imageX = (x - rect.x) / rect.scale;
        const imageY = (y - rect.y) / rect.scale;
        if (imageX < 0 || imageY < 0 || imageX >= workingCanvas.width || imageY >= workingCanvas.height) return undefined;

        const cropRadius = Math.max(18, Math.min(96, radius / rect.scale));
        const cropX = Math.max(0, Math.floor(imageX - cropRadius));
        const cropY = Math.max(0, Math.floor(imageY - cropRadius));
        const cropRight = Math.min(workingCanvas.width, Math.ceil(imageX + cropRadius));
        const cropBottom = Math.min(workingCanvas.height, Math.ceil(imageY + cropRadius));
        const cropWidth = cropRight - cropX;
        const cropHeight = cropBottom - cropY;
        if (cropWidth < 6 || cropHeight < 6) return undefined;

        const imageData = workingCtx.getImageData(cropX, cropY, cropWidth, cropHeight);
        const data = imageData.data;
        let br = 0;
        let bg = 0;
        let bb = 0;
        let borderCount = 0;
        for (let py = 0; py < cropHeight; py += 1) {
            for (let px = 0; px < cropWidth; px += 1) {
                if (px !== 0 && py !== 0 && px !== cropWidth - 1 && py !== cropHeight - 1) continue;
                const offset = (py * cropWidth + px) * 4;
                br += data[offset];
                bg += data[offset + 1];
                bb += data[offset + 2];
                borderCount += 1;
            }
        }

        const base = {
            r: br / Math.max(1, borderCount),
            g: bg / Math.max(1, borderCount),
            b: bb / Math.max(1, borderCount),
        };
        const baseLum = luminance(base.r, base.g, base.b);
        const mask = new Uint8Array(cropWidth * cropHeight);
        const confidence = new Uint8Array(cropWidth * cropHeight);
        let minX = cropWidth;
        let minY = cropHeight;
        let maxX = -1;
        let maxY = -1;
        let kept = 0;
        const centerX = imageX - cropX;
        const centerY = imageY - cropY;

        for (let py = 0; py < cropHeight; py += 1) {
            for (let px = 0; px < cropWidth; px += 1) {
                const offset = (py * cropWidth + px) * 4;
                const r = data[offset];
                const g = data[offset + 1];
                const b = data[offset + 2];
                const dist = colorDistance(r, g, b, base);
                const localSaturation = saturation(r, g, b);
                const lumDelta = Math.abs(luminance(r, g, b) - baseLum);
                const leftOffset = (py * cropWidth + Math.max(0, px - 1)) * 4;
                const rightOffset = (py * cropWidth + Math.min(cropWidth - 1, px + 1)) * 4;
                const upOffset = (Math.max(0, py - 1) * cropWidth + px) * 4;
                const downOffset = (Math.min(cropHeight - 1, py + 1) * cropWidth + px) * 4;
                const edge = Math.max(
                    Math.abs(luminance(data[leftOffset], data[leftOffset + 1], data[leftOffset + 2]) - luminance(data[rightOffset], data[rightOffset + 1], data[rightOffset + 2])),
                    Math.abs(luminance(data[upOffset], data[upOffset + 1], data[upOffset + 2]) - luminance(data[downOffset], data[downOffset + 1], data[downOffset + 2])),
                );
                const centerFalloff = Math.max(0, 1 - (Math.hypot(px - centerX, py - centerY) / cropRadius));
                const threshold = 34 + (1 - centerFalloff) * 22;
                const strongPixel = dist > threshold || lumDelta > threshold * 0.82 || (localSaturation > 46 && dist > 23);
                const detailPixel = strongPixel && (edge > 12 || centerFalloff > 0.56 || dist > threshold + 18);
                if (detailPixel) {
                    const id = py * cropWidth + px;
                    mask[id] = 1;
                    confidence[id] = Math.max(1, Math.min(255, Math.round(dist + edge + lumDelta)));
                    minX = Math.min(minX, px);
                    minY = Math.min(minY, py);
                    maxX = Math.max(maxX, px);
                    maxY = Math.max(maxY, py);
                    kept += 1;
                }
            }
        }

        if (kept < 18 || maxX - minX < 3 || maxY - minY < 3) {
            return spawnEntity
                ? spawnFallbackShards(x, y, imageX, imageY, rect, workingCanvas, workingCtx, base, patchBackground)
                : undefined;
        }

        let seedId = -1;
        let seedDistance = Number.POSITIVE_INFINITY;
        for (let py = 0; py < cropHeight; py += 1) {
            for (let px = 0; px < cropWidth; px += 1) {
                const id = py * cropWidth + px;
                if (mask[id] !== 1) continue;
                const distance = Math.hypot(px - centerX, py - centerY);
                const score = distance - (confidence[id] / 255) * cropRadius * 0.34;
                if (score < seedDistance) {
                    seedDistance = score;
                    seedId = id;
                }
            }
        }
        const seedX = seedId % cropWidth;
        const seedY = Math.floor(seedId / cropWidth);
        if (seedId === -1 || Math.hypot(seedX - centerX, seedY - centerY) > cropRadius * 0.76) {
            return spawnEntity
                ? spawnFallbackShards(x, y, imageX, imageY, rect, workingCanvas, workingCtx, base, patchBackground)
                : undefined;
        }

        const connectedMask = new Uint8Array(cropWidth * cropHeight);
        const queue = [seedId];
        connectedMask[seedId] = 1;
        for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
            const id = queue[queueIndex];
            const px = id % cropWidth;
            const py = Math.floor(id / cropWidth);
            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    if (dx === 0 && dy === 0) continue;
                    const nextX = px + dx;
                    const nextY = py + dy;
                    if (nextX < 0 || nextY < 0 || nextX >= cropWidth || nextY >= cropHeight) continue;
                    const nextId = nextY * cropWidth + nextX;
                    if (connectedMask[nextId] === 1 || mask[nextId] !== 1) continue;
                    connectedMask[nextId] = 1;
                    queue.push(nextId);
                }
            }
        }

        minX = cropWidth;
        minY = cropHeight;
        maxX = -1;
        maxY = -1;
        kept = 0;
        for (let py = 0; py < cropHeight; py += 1) {
            for (let px = 0; px < cropWidth; px += 1) {
                const id = py * cropWidth + px;
                mask[id] = connectedMask[id];
                if (mask[id] !== 1) continue;
                minX = Math.min(minX, px);
                minY = Math.min(minY, py);
                maxX = Math.max(maxX, px);
                maxY = Math.max(maxY, py);
                kept += 1;
            }
        }

        const componentWidth = maxX - minX + 1;
        const componentHeight = maxY - minY + 1;
        const componentArea = componentWidth * componentHeight;
        const componentFill = kept / Math.max(1, componentArea);
        const cropArea = cropWidth * cropHeight;
        const looksLikeBackgroundBlock = kept > cropArea * 0.2
            || componentWidth > cropRadius * 1.34
            || componentHeight > cropRadius * 1.34
            || (componentFill > 0.78 && componentArea > 420);

        if (kept < 18 || componentWidth < 3 || componentHeight < 3 || looksLikeBackgroundBlock) {
            return spawnEntity
                ? spawnFallbackShards(x, y, imageX, imageY, rect, workingCanvas, workingCtx, base, patchBackground)
                : undefined;
        }

        const padding = 1;
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(cropWidth - 1, maxX + padding);
        maxY = Math.min(cropHeight - 1, maxY + padding);
        const sampleOffset = (Math.max(0, Math.min(cropHeight - 1, Math.round(centerY))) * cropWidth + Math.max(0, Math.min(cropWidth - 1, Math.round(centerX)))) * 4;
        const sampledColor = `rgb(${data[sampleOffset]},${data[sampleOffset + 1]},${data[sampleOffset + 2]})`;

        if (!spawnEntity) return sampledColor;

        const entityImageWidth = maxX - minX + 1;
        const entityImageHeight = maxY - minY + 1;
        const entityCanvas = document.createElement("canvas");
        entityCanvas.width = entityImageWidth;
        entityCanvas.height = entityImageHeight;
        const entityCtx = entityCanvas.getContext("2d");
        if (!entityCtx) return sampledColor;

        const entityData = entityCtx.createImageData(entityImageWidth, entityImageHeight);
        const patchData = patchBackground
            ? workingCtx.getImageData(cropX + minX, cropY + minY, entityImageWidth, entityImageHeight)
            : null;
        const softMask = new Uint8Array(entityImageWidth * entityImageHeight);
        let visiblePixels = 0;
        for (let py = 0; py < entityImageHeight; py += 1) {
            for (let px = 0; px < entityImageWidth; px += 1) {
                const sourceX = minX + px;
                const sourceY = minY + py;
                const sourceId = sourceY * cropWidth + sourceX;
                if (mask[sourceId] !== 1) continue;
                let neighbors = 0;
                for (let dy = -1; dy <= 1; dy += 1) {
                    for (let dx = -1; dx <= 1; dx += 1) {
                        const nextX = sourceX + dx;
                        const nextY = sourceY + dy;
                        if (nextX < 0 || nextY < 0 || nextX >= cropWidth || nextY >= cropHeight) continue;
                        neighbors += mask[nextY * cropWidth + nextX];
                    }
                }
                const localConfidence = confidence[sourceId] / 255;
                const alpha = neighbors >= 8 ? 255 : neighbors >= 6 ? 198 : neighbors >= 4 ? 118 : 0;
                const sourceOffset = sourceId * 4;
                const r = data[sourceOffset];
                const g = data[sourceOffset + 1];
                const b = data[sourceOffset + 2];
                const foregroundDistance = colorDistance(r, g, b, base);
                const foregroundLuma = Math.abs(luminance(r, g, b) - baseLum);
                const foregroundStrength = Math.max(
                    smoothStep(24, 72, foregroundDistance),
                    smoothStep(18, 58, foregroundLuma),
                    saturation(r, g, b) > 48 ? smoothStep(18, 48, foregroundDistance) : 0,
                    localConfidence,
                );
                const edgeNoise = ((Math.sin(((cropX + sourceX) * 12.9898) + ((cropY + sourceY) * 78.233)) * 43758.5453) % 1 + 1) % 1;
                const edgeDissolve = neighbors >= 8 ? 1 : edgeNoise > 0.26 ? 1 : 0.38;
                const mattedAlpha = Math.round(alpha * Math.max(0, Math.min(1, foregroundStrength)) * edgeDissolve);
                softMask[py * entityImageWidth + px] = mattedAlpha;
                if (mattedAlpha > 28) visiblePixels += 1;
            }
        }

        if (visiblePixels < 10) {
            return sampledColor;
        }

        for (let py = 0; py < entityImageHeight; py += 1) {
            for (let px = 0; px < entityImageWidth; px += 1) {
                const sourceX = minX + px;
                const sourceY = minY + py;
                const sourceId = sourceY * cropWidth + sourceX;
                const sourceOffset = sourceId * 4;
                const targetOffset = (py * entityImageWidth + px) * 4;
                const alpha = softMask[py * entityImageWidth + px];
                entityData.data[targetOffset] = data[sourceOffset];
                entityData.data[targetOffset + 1] = data[sourceOffset + 1];
                entityData.data[targetOffset + 2] = data[sourceOffset + 2];
                entityData.data[targetOffset + 3] = alpha;
                if (alpha > 0 && patchData) {
                    const blend = Math.min(0.86, alpha / 255);
                    patchData.data[targetOffset] = patchData.data[targetOffset] * (1 - blend) + base.r * blend;
                    patchData.data[targetOffset + 1] = patchData.data[targetOffset + 1] * (1 - blend) + base.g * blend;
                    patchData.data[targetOffset + 2] = patchData.data[targetOffset + 2] * (1 - blend) + base.b * blend;
                    patchData.data[targetOffset + 3] = 255;
                }
            }
        }

        entityCtx.putImageData(entityData, 0, 0);
        if (patchData) {
            workingCtx.putImageData(patchData, cropX + minX, cropY + minY);
            workingCtx.save();
            workingCtx.globalAlpha = 0.16;
            workingCtx.filter = "blur(1.6px)";
            workingCtx.drawImage(workingCanvas, cropX + minX, cropY + minY, entityImageWidth, entityImageHeight, cropX + minX, cropY + minY, entityImageWidth, entityImageHeight);
            workingCtx.restore();
        }
        const entityWidth = entityImageWidth * rect.scale;
        const entityHeight = entityImageHeight * rect.scale;
        spawnScreenEntity({
            canvas: entityCanvas,
            x: rect.x + ((cropX + minX + entityImageWidth / 2) * rect.scale),
            y: rect.y + ((cropY + minY + entityImageHeight / 2) * rect.scale),
            width: entityWidth,
            height: entityHeight,
            vx: (Math.random() - 0.5) * (patchBackground ? 1.85 : 1.28),
            vy: (patchBackground ? 0.05 : 0.12) + Math.random() * 0.38,
            rotation: 0,
            spin: (Math.random() - 0.5) * (patchBackground ? 0.055 : 0.038),
            life: patchBackground ? 62 : 42,
            maxLife: patchBackground ? 62 : 42,
            gravity: patchBackground ? 0.16 : 0.13,
        });

        return sampledColor;
    }, [spawnFallbackShards, spawnScreenEntity]);

    const applyHammerImpactToScreen = useCallback((x: number, y: number, radius: number, heavy = false): string | undefined => {
        const surface = canvasRef.current;
        const workingCanvas = workingCanvasRef.current;
        const workingCtx = workingCanvas?.getContext("2d", { willReadFrequently: true });
        if (!surface || !workingCanvas || !workingCtx) return undefined;

        const rect = getBackgroundDrawRect(surface.clientWidth, surface.clientHeight, workingCanvas.width, workingCanvas.height);
        const imageX = (x - rect.x) / rect.scale;
        const imageY = (y - rect.y) / rect.scale;
        if (imageX < 0 || imageY < 0 || imageX >= workingCanvas.width || imageY >= workingCanvas.height) return undefined;

        const sampleX = Math.max(0, Math.min(workingCanvas.width - 1, Math.round(imageX)));
        const sampleY = Math.max(0, Math.min(workingCanvas.height - 1, Math.round(imageY)));
        const sample = workingCtx.getImageData(sampleX, sampleY, 1, 1).data;
        const impactRadius = Math.max(18, Math.min(heavy ? 128 : 54, radius * (heavy ? 0.78 : 0.44) / rect.scale));
        const branchCount = heavy ? 15 : 9;
        const drawIrregularPatch = (scaleX: number, scaleY: number, pointCount: number): void => {
            for (let point = 0; point <= pointCount; point += 1) {
                const angle = (Math.PI * 2 * point) / pointCount;
                const wobble = 0.72 + Math.random() * (heavy ? 0.62 : 0.38);
                const px = imageX + Math.cos(angle) * impactRadius * scaleX * wobble;
                const py = imageY + impactRadius * 0.12 + Math.sin(angle) * impactRadius * scaleY * wobble;
                if (point === 0) workingCtx.moveTo(px, py);
                else workingCtx.lineTo(px, py);
            }
            workingCtx.closePath();
        };

        workingCtx.save();
        workingCtx.lineCap = "round";
        workingCtx.lineJoin = "round";
        workingCtx.globalCompositeOperation = "multiply";
        workingCtx.fillStyle = heavy ? "rgba(2,6,23,0.56)" : "rgba(2,6,23,0.42)";
        workingCtx.beginPath();
        drawIrregularPatch(heavy ? 1.22 : 0.88, heavy ? 0.86 : 0.52, heavy ? 17 : 10);
        workingCtx.fill();

        const dentGradient = workingCtx.createRadialGradient(
            imageX - impactRadius * 0.1,
            imageY,
            0,
            imageX,
            imageY,
            impactRadius * (heavy ? 0.82 : 0.58),
        );
        dentGradient.addColorStop(0, heavy ? "rgba(0,0,0,0.62)" : "rgba(0,0,0,0.5)");
        dentGradient.addColorStop(0.42, heavy ? "rgba(15,23,42,0.42)" : "rgba(15,23,42,0.28)");
        dentGradient.addColorStop(1, "rgba(15,23,42,0)");
        workingCtx.globalCompositeOperation = "source-over";
        workingCtx.fillStyle = dentGradient;
        workingCtx.beginPath();
        workingCtx.ellipse(imageX, imageY, impactRadius * (heavy ? 0.72 : 0.48), impactRadius * (heavy ? 0.44 : 0.28), -0.08, 0, Math.PI * 2);
        workingCtx.fill();

        workingCtx.globalCompositeOperation = "multiply";

        for (let crack = 0; crack < branchCount; crack += 1) {
            const angle = (Math.PI * 2 * crack) / branchCount + (Math.random() - 0.5) * 0.42;
            const length = impactRadius * (heavy ? 1.18 + Math.random() * 2.04 : 0.9 + Math.random() * 1.34);
            const mid = length * (0.38 + Math.random() * 0.22);
            const kink = impactRadius * (0.08 + Math.random() * 0.18) * (Math.random() > 0.5 ? 1 : -1);
            workingCtx.strokeStyle = crack % 3 === 0 ? "rgba(2,6,23,0.74)" : "rgba(15,23,42,0.54)";
            workingCtx.lineWidth = Math.max(0.85, (heavy ? 2.35 : 1.55) / rect.scale);
            workingCtx.beginPath();
            workingCtx.moveTo(imageX, imageY);
            workingCtx.lineTo(
                imageX + Math.cos(angle) * mid + Math.cos(angle + Math.PI / 2) * kink,
                imageY + Math.sin(angle) * mid + Math.sin(angle + Math.PI / 2) * kink,
            );
            workingCtx.lineTo(imageX + Math.cos(angle) * length, imageY + Math.sin(angle) * length);
            workingCtx.stroke();

            if (heavy && crack % 2 === 0) {
                const splitAngle = angle + (Math.random() > 0.5 ? 0.62 : -0.62);
                const splitStart = length * (0.44 + Math.random() * 0.24);
                const splitLength = impactRadius * (0.42 + Math.random() * 0.74);
                const sx = imageX + Math.cos(angle) * splitStart;
                const sy = imageY + Math.sin(angle) * splitStart;
                workingCtx.lineWidth = Math.max(0.55, 1.05 / rect.scale);
                workingCtx.beginPath();
                workingCtx.moveTo(sx, sy);
                workingCtx.lineTo(sx + Math.cos(splitAngle) * splitLength, sy + Math.sin(splitAngle) * splitLength);
                workingCtx.stroke();
            }
        }

        if (!heavy) {
            workingCtx.globalCompositeOperation = "screen";
            workingCtx.strokeStyle = "rgba(248,250,252,0.18)";
            workingCtx.lineWidth = Math.max(0.7, 0.75 / rect.scale);
            workingCtx.beginPath();
            drawIrregularPatch(0.34, 0.24, 8);
            workingCtx.stroke();
        }
        workingCtx.restore();

        if (heavy || Math.random() < 0.38) {
            extractEntityAtImpact(x, y, Math.max(26, radius * (heavy ? 0.86 : 0.46)), true, true);
        }

        return `rgb(${sample[0]},${sample[1]},${sample[2]})`;
    }, [extractEntityAtImpact]);

    const applyBoltImpact = useCallback((x: number, y: number, angle: number, radius: number): string | undefined => {
        const surface = canvasRef.current;
        const workingCanvas = workingCanvasRef.current;
        const workingCtx = workingCanvas?.getContext("2d", { willReadFrequently: true });
        if (!surface || !workingCanvas || !workingCtx) return undefined;

        const rect = getBackgroundDrawRect(surface.clientWidth, surface.clientHeight, workingCanvas.width, workingCanvas.height);
        const imageX = (x - rect.x) / rect.scale;
        const imageY = (y - rect.y) / rect.scale;
        if (imageX < 0 || imageY < 0 || imageX >= workingCanvas.width || imageY >= workingCanvas.height) return undefined;

        const sampleX = Math.max(0, Math.min(workingCanvas.width - 1, Math.round(imageX)));
        const sampleY = Math.max(0, Math.min(workingCanvas.height - 1, Math.round(imageY)));
        const sample = workingCtx.getImageData(sampleX, sampleY, 1, 1).data;
        const impactRadius = Math.max(8, Math.min(22, radius * 0.26 / rect.scale));
        const forwardX = Math.cos(angle);
        const forwardY = Math.sin(angle);

        workingCtx.save();
        workingCtx.lineCap = "round";
        workingCtx.lineJoin = "round";
        workingCtx.globalCompositeOperation = "multiply";
        workingCtx.fillStyle = "rgba(2,6,23,0.42)";
        workingCtx.beginPath();
        workingCtx.ellipse(imageX, imageY, impactRadius * 0.95, impactRadius * 0.46, angle, 0, Math.PI * 2);
        workingCtx.fill();

        for (let crack = 0; crack < 7; crack += 1) {
            const crackAngle = angle + (Math.random() - 0.5) * 2.7 + (crack % 2 === 0 ? 0 : Math.PI);
            const length = impactRadius * (1.25 + Math.random() * 1.8);
            const mid = length * (0.42 + Math.random() * 0.18);
            workingCtx.strokeStyle = crack % 2 === 0 ? "rgba(2,6,23,0.46)" : "rgba(15,23,42,0.34)";
            workingCtx.lineWidth = Math.max(0.7, (0.9 + Math.random() * 0.6) / rect.scale);
            workingCtx.beginPath();
            workingCtx.moveTo(imageX, imageY);
            workingCtx.lineTo(
                imageX + Math.cos(crackAngle) * mid + Math.cos(crackAngle + Math.PI / 2) * impactRadius * 0.16,
                imageY + Math.sin(crackAngle) * mid + Math.sin(crackAngle + Math.PI / 2) * impactRadius * 0.16,
            );
            workingCtx.lineTo(imageX + Math.cos(crackAngle) * length, imageY + Math.sin(crackAngle) * length);
            workingCtx.stroke();
        }

        workingCtx.globalCompositeOperation = "source-over";
        const scrapeLength = impactRadius * 2.4;
        const scrapeGradient = workingCtx.createLinearGradient(
            imageX - forwardX * scrapeLength,
            imageY - forwardY * scrapeLength,
            imageX + forwardX * impactRadius,
            imageY + forwardY * impactRadius,
        );
        scrapeGradient.addColorStop(0, "rgba(255,255,255,0)");
        scrapeGradient.addColorStop(0.55, "rgba(226,232,240,0.42)");
        scrapeGradient.addColorStop(1, "rgba(255,255,255,0)");
        workingCtx.strokeStyle = scrapeGradient;
        workingCtx.lineWidth = Math.max(0.75, 1.25 / rect.scale);
        workingCtx.beginPath();
        workingCtx.moveTo(imageX - forwardX * scrapeLength, imageY - forwardY * scrapeLength);
        workingCtx.lineTo(imageX + forwardX * impactRadius * 0.75, imageY + forwardY * impactRadius * 0.75);
        workingCtx.stroke();
        workingCtx.restore();

        if (Math.random() < 0.7) {
            extractEntityAtImpact(x, y, Math.max(18, radius * 0.44), true, true);
        }

        return `rgb(${sample[0]},${sample[1]},${sample[2]})`;
    }, [extractEntityAtImpact]);

    const applyBurnTrace = useCallback((x: number, y: number, angle: number, radius: number): string | undefined => {
        const surface = canvasRef.current;
        const workingCanvas = workingCanvasRef.current;
        const workingCtx = workingCanvas?.getContext("2d", { willReadFrequently: true });
        if (!surface || !workingCanvas || !workingCtx) return undefined;

        const rect = getBackgroundDrawRect(surface.clientWidth, surface.clientHeight, workingCanvas.width, workingCanvas.height);
        const imageX = (x - rect.x) / rect.scale;
        const imageY = (y - rect.y) / rect.scale;
        if (imageX < 0 || imageY < 0 || imageX >= workingCanvas.width || imageY >= workingCanvas.height) return undefined;

        const sampleX = Math.max(0, Math.min(workingCanvas.width - 1, Math.round(imageX)));
        const sampleY = Math.max(0, Math.min(workingCanvas.height - 1, Math.round(imageY)));
        const sample = workingCtx.getImageData(sampleX, sampleY, 1, 1).data;
        const burnRadius = Math.max(9, Math.min(28, radius * 0.42 / rect.scale));
        const sweep = burnRadius * 0.55;

        workingCtx.save();
        workingCtx.translate(imageX, imageY);
        workingCtx.rotate(angle);
        workingCtx.globalCompositeOperation = "multiply";

        for (let layer = 0; layer < 7; layer += 1) {
            const offsetX = (Math.random() - 0.5) * burnRadius * 0.22;
            const offsetY = (Math.random() - 0.5) * burnRadius * 0.16;
            const layerRadius = burnRadius * (0.32 + Math.random() * 0.34);
            const scorch = workingCtx.createRadialGradient(offsetX, offsetY, 0, offsetX, offsetY, layerRadius);
            scorch.addColorStop(0, "rgba(5,2,1,0.74)");
            scorch.addColorStop(0.28, "rgba(50,13,4,0.48)");
            scorch.addColorStop(0.68, "rgba(124,45,18,0.18)");
            scorch.addColorStop(1, "rgba(0,0,0,0)");
            workingCtx.fillStyle = scorch;
            workingCtx.beginPath();
            workingCtx.ellipse(offsetX, offsetY, layerRadius, layerRadius * (0.42 + Math.random() * 0.18), Math.random() * Math.PI, 0, Math.PI * 2);
            workingCtx.fill();
        }

        workingCtx.globalCompositeOperation = "source-over";
        workingCtx.lineCap = "round";
        for (let trace = 0; trace < 14; trace += 1) {
            const traceY = (Math.random() - 0.5) * burnRadius * 0.56;
            const traceStart = -sweep * (0.2 + Math.random() * 0.8);
            const traceEnd = sweep * (0.28 + Math.random() * 0.72);
            const hot = trace % 4 === 0;
            const trail = workingCtx.createLinearGradient(traceStart, traceY, traceEnd, traceY);
            trail.addColorStop(0, "rgba(0,0,0,0)");
            trail.addColorStop(0.34, hot ? "rgba(254,240,138,0.62)" : "rgba(124,45,18,0.56)");
            trail.addColorStop(0.62, hot ? "rgba(249,115,22,0.42)" : "rgba(42,12,4,0.62)");
            trail.addColorStop(1, "rgba(0,0,0,0)");
            workingCtx.strokeStyle = trail;
            workingCtx.lineWidth = Math.max(0.7, (hot ? 0.9 : 1.5) / rect.scale);
            workingCtx.beginPath();
            workingCtx.moveTo(traceStart, traceY);
            workingCtx.quadraticCurveTo((traceStart + traceEnd) * 0.5, traceY + (Math.random() - 0.5) * burnRadius * 0.18, traceEnd, traceY + (Math.random() - 0.5) * burnRadius * 0.1);
            workingCtx.stroke();
        }

        workingCtx.globalCompositeOperation = "screen";
        const ember = workingCtx.createRadialGradient(0, 0, 0, 0, 0, burnRadius * 0.68);
        ember.addColorStop(0, "rgba(255,244,214,0.46)");
        ember.addColorStop(0.16, "rgba(251,191,36,0.3)");
        ember.addColorStop(0.48, "rgba(249,115,22,0.12)");
        ember.addColorStop(1, "rgba(0,0,0,0)");
        workingCtx.fillStyle = ember;
        workingCtx.beginPath();
        workingCtx.ellipse(0, 0, burnRadius * 0.42, burnRadius * 0.3, 0, 0, Math.PI * 2);
        workingCtx.fill();
        for (let spark = 0; spark < 12; spark += 1) {
            const a = Math.random() * Math.PI * 2;
            const d = burnRadius * (0.18 + Math.random() * 0.65);
            const s = Math.max(0.55, (0.7 + Math.random() * 1.2) / rect.scale);
            workingCtx.fillStyle = spark % 3 === 0 ? "rgba(254,240,138,0.56)" : "rgba(249,115,22,0.38)";
            workingCtx.beginPath();
            workingCtx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.58, s, 0, Math.PI * 2);
            workingCtx.fill();
        }
        workingCtx.restore();

        return `rgb(${sample[0]},${sample[1]},${sample[2]})`;
    }, []);

    const stampBurnScorch = useCallback((flame: ActiveFlame): void => {
        const surface = canvasRef.current;
        const workingCanvas = workingCanvasRef.current;
        const workingCtx = workingCanvas?.getContext("2d", { willReadFrequently: true });
        if (!surface || !workingCanvas || !workingCtx) return;

        const rect = getBackgroundDrawRect(surface.clientWidth, surface.clientHeight, workingCanvas.width, workingCanvas.height);
        const imageX = (flame.x - rect.x) / rect.scale;
        const imageY = (flame.y - rect.y) / rect.scale;
        if (imageX < 0 || imageY < 0 || imageX >= workingCanvas.width || imageY >= workingCanvas.height) return;

        const sprite = spritesRef.current.burnScorch;
        if (!sprite?.complete || sprite.naturalWidth <= 0) {
            applyBurnTrace(flame.x, flame.y, flame.rotation, flame.radius);
            return;
        }

        const burnRadius = Math.max(28, flame.radius * 0.95 / rect.scale);
        const size = burnRadius * (1.82 + flameNoise(flame.seed + 23, 1.8) * 0.36);
        workingCtx.save();
        workingCtx.translate(imageX, imageY);
        workingCtx.rotate(flame.rotation + (Math.sin(flame.seed) * 0.26));
        workingCtx.globalAlpha = 0.76;
        workingCtx.globalCompositeOperation = "multiply";
        workingCtx.drawImage(sprite, -size / 2, -size / 2, size * (0.9 + flameNoise(flame.seed + 41, 2.2) * 0.28), size);
        workingCtx.globalCompositeOperation = "screen";
        workingCtx.globalAlpha = 0.16;
        const ember = workingCtx.createRadialGradient(0, 0, 0, 0, 0, size * 0.25);
        ember.addColorStop(0, "rgba(251,191,36,0.28)");
        ember.addColorStop(0.38, "rgba(249,115,22,0.14)");
        ember.addColorStop(1, "rgba(0,0,0,0)");
        workingCtx.fillStyle = ember;
        workingCtx.beginPath();
        workingCtx.arc(0, 0, size * 0.25, 0, Math.PI * 2);
        workingCtx.fill();
        workingCtx.restore();
    }, [applyBurnTrace]);

    useEffect(() => {
        stampBurnScorchRef.current = stampBurnScorch;
        return () => {
            stampBurnScorchRef.current = null;
        };
    }, [stampBurnScorch]);

    useEffect(() => {
        laserFragmentActionRef.current = (x, y, _angle, travel) => {
            const cut = laserCutRef.current;
            if (travel < 2.4) return;
            const now = performance.now();
            if (now - cut.lastShardAt < 110) return;
            cut.lastShardAt = now;
            if (Math.random() < 0.42) {
                extractEntityAtImpact(x, y, Math.max(16, Math.min(42, travel * 3.4)), true, true);
            }
        };
        return () => {
            laserFragmentActionRef.current = null;
        };
    }, [extractEntityAtImpact]);

    const applyMonsterHoleToScreen = useCallback((attack: ActiveMonsterAttack): string | undefined => {
        const surface = canvasRef.current;
        const workingCanvas = workingCanvasRef.current;
        const workingCtx = workingCanvas?.getContext("2d", { willReadFrequently: true });
        if (!surface || !workingCanvas || !workingCtx) return undefined;

        const rect = getBackgroundDrawRect(surface.clientWidth, surface.clientHeight, workingCanvas.width, workingCanvas.height);
        const imageX = (attack.x - rect.x) / rect.scale;
        const imageY = (attack.y - rect.y) / rect.scale;
        if (imageX < 0 || imageY < 0 || imageX >= workingCanvas.width || imageY >= workingCanvas.height) return undefined;

        const sampleX = Math.max(0, Math.min(workingCanvas.width - 1, Math.round(imageX)));
        const sampleY = Math.max(0, Math.min(workingCanvas.height - 1, Math.round(imageY)));
        const sample = workingCtx.getImageData(sampleX, sampleY, 1, 1).data;
        const radius = Math.max(30, Math.min(148, attack.radius * 0.72 / rect.scale));

        drawMonsterHoleOverlay(
            workingCtx,
            imageX,
            imageY,
            radius,
            attack.seed + 97,
            1,
        );

        extractEntityAtImpact(attack.x, attack.y, Math.max(42, attack.radius * 0.72), true, true);

        return `rgb(${sample[0]},${sample[1]},${sample[2]})`;
    }, [extractEntityAtImpact]);

    useEffect(() => {
        monsterHoleActionRef.current = applyMonsterHoleToScreen;
        return () => {
            monsterHoleActionRef.current = null;
        };
    }, [applyMonsterHoleToScreen]);

    const hitCreatureAt = useCallback((x: number, y: number, currentTool: PlaygroundToolId, direction = 0) => {
        let hitIndex = -1;
        let hitCreature: Creature | null = null;
        creaturesRef.current.forEach((creature, index) => {
            const distance = Math.hypot(x - creature.x, y - creature.y);
            const hitRadius = creature.size * (creature.kind === "skeleton" ? 1.06 : 0.78);
            if (distance <= hitRadius && hitIndex === -1) {
                hitIndex = index;
                hitCreature = creature;
            }
        });

        if (hitIndex >= 0 && hitCreature) {
            if (hitCreature.kind === "skeleton") {
                let controller = skeletonControllersRef.current.get(hitCreature.id);
                if (!controller) {
                    controller = new SkeletonController(hitCreature.x, hitCreature.y, hitCreature.size, hitCreature.seed);
                    skeletonControllersRef.current.set(hitCreature.id, controller);
                }
                const damagingHit = currentTool === "hammer" || currentTool === "scatter";
                if (damagingHit) {
                    const nextDamage = (hitCreature.damage ?? 0) + 1;
                    if (currentTool === "scatter") {
                        const now = performance.now();
                        controller.update(now, 16, hitCreature.vx, hitCreature.vy, hitCreature.size * (hitCreature.mergeScale ?? 1));
                        controller.startShotDeath(now, x, y, direction, nextDamage);
                        dyingSkeletonsRef.current = [
                            ...dyingSkeletonsRef.current.filter((skeleton) => skeleton.id !== hitCreature.id),
                            { id: hitCreature.id, controller },
                        ].slice(-8);
                        skeletonControllersRef.current.delete(hitCreature.id);
                        creaturesRef.current = creaturesRef.current.filter((_, index) => index !== hitIndex);
                        particlesRef.current = [
                            ...particlesRef.current,
                            ...createParticlesForTool(currentTool, x, y, undefined, direction),
                        ].slice(-MAX_PARTICLES);
                    } else if (nextDamage >= 3) {
                        controller.hit(nextDamage);
                        skeletonControllersRef.current.delete(hitCreature.id);
                        creaturesRef.current = creaturesRef.current.filter((_, index) => index !== hitIndex);
                        skeletonShardsRef.current = [
                            ...skeletonShardsRef.current,
                            ...createSkeletonShards(hitCreature, x, y, performance.now()),
                        ].slice(-90);
                        particlesRef.current = [
                            ...particlesRef.current,
                            ...createParticlesForTool(currentTool, x, y, undefined, direction),
                        ].slice(-MAX_PARTICLES);
                    } else {
                        controller.hit(nextDamage);
                        creaturesRef.current = creaturesRef.current.map((creature, index) => index === hitIndex
                            ? {
                                ...creature,
                                damage: nextDamage,
                                bumpReact: Math.max(creature.bumpReact ?? 0, 34),
                                vx: creature.vx + (creature.x - x) * 0.006,
                                vy: creature.vy + (creature.y - y) * 0.006,
                            }
                            : creature);
                        particlesRef.current = [
                            ...particlesRef.current,
                            ...createParticlesForTool(currentTool, x, y, undefined, direction),
                        ].slice(-MAX_PARTICLES);
                    }
                    return true;
                }
                controller.hit(hitCreature.damage ?? 0);
                return true;
            }
            creaturesRef.current = creaturesRef.current.filter((_, index) => index !== hitIndex);
            particlesRef.current = [
                ...particlesRef.current,
                ...createParticlesForTool(currentTool, x, y),
                ...createParticlesForTool("scatter", hitCreature.x, hitCreature.y),
            ].slice(-MAX_PARTICLES);
            return true;
        }

        creaturesRef.current = creaturesRef.current.map((creature) => {
            const dx = creature.x - x;
            const dy = creature.y - y;
            const distance = Math.hypot(dx, dy);
            if (distance > creature.size * 1.9 || distance < 1) return creature;
            const force = (1 - distance / (creature.size * 1.9)) * 1.35;
            return {
                ...creature,
                vx: creature.vx + (dx / distance) * force,
                vy: creature.vy + (dy / distance) * force,
            };
        });

        return false;
    }, []);

    const addImpact = useCallback((x: number, y: number, options: AddImpactOptions = {}) => {
        const currentTool = options.toolOverride ?? toolRef.current;
        if (currentTool === "laser") return;
        if (currentTool === "throw") return;
        const now = performance.now();
        const lastImpact = lastImpactRef.current;
        const suppressMs = 90;
        const suppressDistance = 10;
        if (
            !options.skipSuppress
            &&
            currentTool === lastImpact.tool
            && now - lastImpact.at < suppressMs
            && Math.hypot(x - lastImpact.x, y - lastImpact.y) < suppressDistance
        ) {
            return;
        }
        lastImpactRef.current = { x, y, at: now, tool: currentTool };

        if (currentTool === "hammer" && !options.commitHammerImpact) {
            hammerSwingRef.current = now;
            const timeoutId = window.setTimeout(() => {
                hammerImpactTimeoutsRef.current = hammerImpactTimeoutsRef.current.filter((id) => id !== timeoutId);
                addImpact(x, y, {
                    commitHammerImpact: true,
                    skipSuppress: true,
                    toolOverride: "hammer",
                });
            }, HAMMER_IMPACT_DELAY_MS);
            hammerImpactTimeoutsRef.current = [
                ...hammerImpactTimeoutsRef.current.slice(-7),
                timeoutId,
            ];
            return;
        }

        if (currentTool === "skeleton" || currentTool === "spider") {
            creaturesRef.current = [
                ...creaturesRef.current.slice(-7),
                createCreature(currentTool, x, y),
            ];
            return;
        }

        const impact = createImpact(currentTool, x, y);
        if (options.impactScale) {
            impact.radius *= options.impactScale;
        }
        if (currentTool === "monster") {
            const canvas = canvasRef.current;
            const width = canvas?.clientWidth ?? window.innerWidth;
            const height = canvas?.clientHeight ?? window.innerHeight;
            const rotation = Math.atan2((height * 0.52) - y, (width * 0.5) - x) * 0.18;
            monsterAttacksRef.current = [
                ...monsterAttacksRef.current.slice(-2),
                {
                    id: `monster-${impact.id}`,
                    x,
                    y,
                    radius: impact.radius,
                    rotation,
                    seed: impact.seed,
                    createdAt: now,
                    life: MONSTER_ATTACK_LIFE_MS,
                    holeStamped: false,
                },
            ];
            if (now - lastImpactCountUpdateRef.current > IMPACT_COUNT_UPDATE_MS) {
                lastImpactCountUpdateRef.current = now;
                setImpactCount((count) => count + 1);
            }
            if (!mutedRef.current && now - lastSoundAtRef.current > 42) {
                lastSoundAtRef.current = now;
                playToolSound(currentTool);
            }
            return;
        }
        let shotStart: { x: number; y: number } | undefined;
        if (currentTool === "scatter") {
            const canvas = canvasRef.current;
            const width = canvas?.clientWidth ?? window.innerWidth;
            const height = canvas?.clientHeight ?? window.innerHeight;
            const margin = Math.max(120, Math.min(width, height) * 0.12);
            const edge = Math.floor(Math.random() * 4);
            if (edge === 0) shotStart = { x: -margin, y: Math.random() * height };
            else if (edge === 1) shotStart = { x: width + margin, y: Math.random() * height };
            else if (edge === 2) shotStart = { x: Math.random() * width, y: -margin };
            else shotStart = { x: Math.random() * width, y: height + margin };
            impact.rotation = Math.atan2(y - shotStart.y, x - shotStart.x);
        }
        if (currentTool === "burn") {
            impact.rotation = -Math.PI / 2 + (Math.random() - 0.5) * 0.38;
        }
        const hitCreature = hitCreatureAt(x, y, currentTool, impact.rotation);
        const shouldCacheImpactOverlay = currentTool !== "burn"
            && currentTool !== "scatter";
        if (shouldCacheImpactOverlay) {
            impactsRef.current = [
                ...impactsRef.current.slice(-(MAX_IMPACTS - 1)),
                impact,
            ];
            if (impactsRef.current.length === MAX_IMPACTS) {
                clearEffects();
                impactsRef.current.forEach(cacheImpact);
            } else {
                cacheImpact(impact);
            }
        }
        const sampledColor = currentTool === "scatter" && !hitCreature
            ? applyBoltImpact(x, y, impact.rotation, impact.radius)
            : currentTool === "hammer"
                ? applyHammerImpactToScreen(x, y, impact.radius, options.heavyHammer)
                : undefined;
        const shouldExtractScreenEntity = currentTool === "glyph";
        const extractedColor = shouldExtractScreenEntity && !hitCreature
            ? extractEntityAtImpact(x, y, impact.radius, true, true)
            : undefined;
        
        if (currentTool === "burn") {
            const canvas = canvasRef.current;
            const dragon = createDragonBreath(
                x,
                y,
                impact.radius,
                canvas?.clientWidth ?? window.innerWidth,
                canvas?.clientHeight ?? window.innerHeight,
                impact.seed,
                now
            );
            impact.rotation = Math.atan2(y - dragon.mouthY, x - dragon.mouthX);
            dragonBreathsRef.current = [dragon];
            const isHugeFireball = options.hugeFireball === true;
            activeFlamesRef.current = [
                ...activeFlamesRef.current.slice(-4),
                {
                    id: `flame-${impact.id}`,
                    startX: dragon.mouthX,
                    startY: dragon.mouthY,
                    x,
                    y: y + impact.radius * 0.05,
                    radius: impact.radius * (isHugeFireball ? 1.14 : 1),
                    rotation: impact.rotation,
                    seed: impact.seed,
                    createdAt: now,
                    life: isHugeFireball ? 2600 : 1900,
                },
            ];
        }
        if (currentTool === "scatter") {
            activeArrowsRef.current = [
                ...activeArrowsRef.current.slice(-5),
                {
                    id: `arrow-${impact.id}`,
                    startX: shotStart?.x ?? (x - Math.cos(impact.rotation) * 260),
                    startY: shotStart?.y ?? (y - Math.sin(impact.rotation) * 260),
                    x,
                    y,
                    radius: impact.radius * 1.12,
                    rotation: impact.rotation,
                    seed: impact.seed,
                    createdAt: now,
                    life: options.heavyArrow ? HEAVY_ARROW_LIFE_MS : ARROW_LIFE_MS,
                },
            ];
        }
        particlesRef.current = [
            ...particlesRef.current,
            ...createParticlesForTool(currentTool, x, y, sampledColor ?? extractedColor, currentTool === "scatter" || currentTool === "burn" ? impact.rotation : undefined),
            ...(options.heavyHammer ? createParticlesForTool(currentTool, x, y, sampledColor ?? extractedColor) : []),
        ].slice(-MAX_PARTICLES);
        if (now - lastImpactCountUpdateRef.current > IMPACT_COUNT_UPDATE_MS) {
            lastImpactCountUpdateRef.current = now;
            if (!shouldCacheImpactOverlay) setImpactCount((count) => count + 1);
            else setImpactCount(impactsRef.current.length);
        }
        if (!mutedRef.current && now - lastSoundAtRef.current > 42) {
            lastSoundAtRef.current = now;
            playToolSound(currentTool);
        }
    }, [applyBoltImpact, applyBurnTrace, applyHammerImpactToScreen, cacheImpact, clearEffects, extractEntityAtImpact, hitCreatureAt]);

    const launchSlingerFruit = useCallback(() => {
        const state = slingerRef.current;
        if (!state.active) return;
        const now = performance.now();
        const profile = foodStyle(throwFoodRef.current);
        const releaseX = Number.isFinite(state.targetPullX) ? state.targetPullX : state.pullX;
        const releaseY = Number.isFinite(state.targetPullY) ? state.targetPullY : state.pullY;
        if (Math.hypot(releaseX - state.anchorX, releaseY - state.anchorY) < SLINGER_MIN_PULL_TO_LAUNCH) return;
        const shot = getSlingerShot(state.anchorX, state.anchorY, releaseX, releaseY, state.chargeStartAt, throwFoodRef.current, now);
        const seed = Math.floor(now * 31 + state.anchorX * 17 + state.anchorY * 13);

        fruitProjectilesRef.current = [
            ...fruitProjectilesRef.current.slice(-4),
            {
                id: `fruit-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
                food: throwFoodRef.current,
                x: shot.startX,
                y: shot.startY,
                z: SLINGER_PROJECTILE_DEPTH,
                vx: shot.vx,
                vy: shot.vy,
                vz: -shot.depthSpeed,
                radius: profile.radius,
                rotation: shot.angle,
                spin: (0.008 + shot.punch * 0.028) * (flameNoise(seed, 1) > 0.5 ? 1 : -1),
                seed,
                createdAt: now,
            },
        ];

        if (!mutedRef.current && now - lastSoundAtRef.current > 42) {
            lastSoundAtRef.current = now;
            playToolSound("throw");
        }
    }, []);

    const getHammerContactPoint = useCallback((x: number, y: number) => ({
        x: x + HAMMER_TARGET_OFFSET_X,
        y: y + HAMMER_TARGET_OFFSET_Y,
    }), []);

    const startHeavyHammerStrike = useCallback((x: number, y: number) => {
        const now = performance.now();
        hammerSwingRef.current = now;
        heavyHammerSwingRef.current = { active: true, startedAt: now, x, y };
        lastImpactRef.current = { x, y, at: now, tool: "hammer" };
        const timeoutId = window.setTimeout(() => {
            hammerImpactTimeoutsRef.current = hammerImpactTimeoutsRef.current.filter((id) => id !== timeoutId);
            addImpact(x, y, {
                commitHammerImpact: true,
                heavyHammer: true,
                impactScale: HEAVY_HAMMER_IMPACT_SCALE,
                skipSuppress: true,
                toolOverride: "hammer",
            });
        }, HEAVY_HAMMER_IMPACT_DELAY_MS);
        hammerImpactTimeoutsRef.current = [
            ...hammerImpactTimeoutsRef.current.slice(-7),
            timeoutId,
        ];
    }, [addImpact]);

    const addDragImpact = useCallback((x: number, y: number) => {
        const last = lastDragImpactRef.current;
        const now = performance.now();
        const distance = Math.hypot(x - last.x, y - last.y);
        const minDistance = MIN_DRAG_IMPACT_DISTANCE;
        const minMs = MIN_DRAG_IMPACT_MS;
        if (distance < minDistance || now - last.at < minMs) {
            return;
        }
        lastDragImpactRef.current = { x, y, at: now };
        addImpact(x, y);
    }, [addImpact]);

    const reset = useCallback(() => {
        impactsRef.current = [];
        particlesRef.current = [];
        entitiesRef.current = [];
        dragonBreathsRef.current = [];
        activeFlamesRef.current = [];
        burnResiduesRef.current = [];
        activeArrowsRef.current = [];
        activeWebsRef.current = [];
        skeletonShardsRef.current = [];
        fruitProjectilesRef.current = [];
        fruitSplatsRef.current = [];
        monsterAttacksRef.current = [];
        laserTrailRef.current = [];
        laserSparksRef.current = [];
        laserCutRef.current = createLaserCutState();
        slingerRef.current = createSlingerState();
        clearEffects();
        const background = backgroundImageRef.current;
        if (background) prepareWorkingCanvas(background);
        const canvas = canvasRef.current;
        const width = canvas?.clientWidth || payload?.display.width || 1280;
        const height = canvas?.clientHeight || payload?.display.height || 720;
        restoreDefaultCreatures(width, height);
        setImpactCount(0);
    }, [clearEffects, payload, prepareWorkingCanvas, restoreDefaultCreatures]);

    const chooseSource = useCallback((source: ScreenPlaygroundSource) => {
        setSelectedSourceId(source.id);
        setSourcePickerOpen(false);
        impactsRef.current = [];
        particlesRef.current = [];
        entitiesRef.current = [];
        dragonBreathsRef.current = [];
        activeFlamesRef.current = [];
        burnResiduesRef.current = [];
        activeArrowsRef.current = [];
        activeWebsRef.current = [];
        skeletonShardsRef.current = [];
        fruitProjectilesRef.current = [];
        fruitSplatsRef.current = [];
        monsterAttacksRef.current = [];
        laserTrailRef.current = [];
        laserSparksRef.current = [];
        laserCutRef.current = createLaserCutState();
        slingerRef.current = createSlingerState();
        clearEffects();
        const canvas = canvasRef.current;
        restoreDefaultCreatures(canvas?.clientWidth || payload?.display.width || 1280, canvas?.clientHeight || payload?.display.height || 720);
        setImpactCount(0);
        loadSourceImage(source);
    }, [clearEffects, loadSourceImage, payload, restoreDefaultCreatures]);

    const saveSnapshot = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        try {
            setSaveStatus("Saving...");
            const result = await window.screenPlaygroundAPI?.saveSnapshot(canvas.toDataURL("image/png"));
            setSaveStatus(result?.success ? "Saved" : (result?.error || "Save failed"));
        } catch (error) {
            setSaveStatus((error as Error).message);
        }

        window.setTimeout(() => setSaveStatus(null), 2400);
    }, []);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                window.screenPlaygroundAPI?.close();
                return;
            }
            if (event.key.toLowerCase() === "r") {
                reset();
                return;
            }
            const selected = TOOLS.find((candidate) => candidate.hotkey === event.key);
            if (selected) setTool(selected.id);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [reset]);

    const selectedTool = useMemo(() => TOOLS.find((item) => item.id === tool) ?? TOOLS[0], [tool]);

    return (
        <div className="playground-shell">
            <style>{`
                * { box-sizing: border-box; }
                html, body, #root { width: 100%; height: 100%; margin: 0; overflow: hidden; background: #05070d; }
                body { user-select: none; cursor: default; font-family: "Segoe UI", Arial, sans-serif; }
                .playground-shell { width: 100%; height: 100%; position: relative; overflow: visible; }
                .playground-canvas { width: 100%; height: 100%; display: block; cursor: none; touch-action: none; }
                .playground-hud {
                    position: absolute; left: 50%; top: 12px; transform: translateX(-50%);
                    display: flex; align-items: center; gap: 3px; padding: 4px;
                    max-width: calc(100vw - 24px); overflow-x: auto; overflow-y: hidden; white-space: nowrap;
                    border: 1px solid rgba(255,255,255,0.14); border-radius: 12px;
                    background: linear-gradient(135deg, rgba(7,10,18,0.84), rgba(16,24,39,0.68));
                    backdrop-filter: blur(24px) saturate(160%);
                    box-shadow: 0 18px 60px rgba(0,0,0,0.38), inset 0 1px 0 rgba(255,255,255,0.08);
                    color: #f8fafc;
                    z-index: 20;
                }
                .playground-hud::-webkit-scrollbar { display: none; }
                .playground-btn {
                    border: 1px solid rgba(255,255,255,0.09); color: #e2e8f0; background: rgba(255,255,255,0.045);
                    height: 28px; min-width: auto; padding: 0 7px; border-radius: 8px; font-size: 10px; font-weight: 800;
                    cursor: pointer; transition: transform 0.12s ease, background 0.12s ease, border 0.12s ease, box-shadow 0.12s ease;
                    display: inline-flex; flex-direction: row; align-items: center; justify-content: center; gap: 5px; flex: 0 0 auto;
                }
                .playground-btn svg { width: 14px; height: 14px; flex: 0 0 auto; }
                .playground-btn:hover { transform: translateY(-1px); background: rgba(255,255,255,0.1); }
                .playground-btn.active {
                    background: linear-gradient(135deg, rgba(147,197,253,0.22), rgba(45,212,191,0.13));
                    border-color: rgba(147,197,253,0.48); color: #e0f2fe;
                    box-shadow: 0 10px 34px rgba(59,130,246,0.18), inset 0 1px 0 rgba(255,255,255,0.12);
                }
                .playground-btn.utility { padding: 0 8px; }
                .tool-title { display: flex; align-items: center; gap: 5px; }
                .tool-label { line-height: 1; }
                .playground-meta {
                    position: absolute; left: 18px; bottom: 16px; color: rgba(248,250,252,0.7);
                    font-size: 11px; line-height: 1.45; padding: 8px 10px; border-radius: 10px;
                    background: rgba(7,10,18,0.56); border: 1px solid rgba(255,255,255,0.08);
                    backdrop-filter: blur(18px);
                    z-index: 20;
                }
                .playground-cursor {
                    position: absolute; pointer-events: none; left: 0; top: 0; width: 28px; height: 28px;
                    border-radius: 50%; display: grid; place-items: center; color: transparent; font-size: 0;
                    border: 1px solid rgba(255,255,255,0.7);
                    background: ${tool === "laser" ? "rgba(239,68,68,0.2)" : "rgba(15,23,42,0.08)"};
                    box-shadow: ${tool === "laser"
                        ? "0 0 0 6px rgba(239,68,68,0.08), 0 0 22px rgba(239,68,68,0.46), inset 0 0 0 1px rgba(254,226,226,0.72)"
                        : "0 0 0 6px rgba(255,255,255,0.04), 0 8px 22px rgba(0,0,0,0.34), inset 0 0 0 1px rgba(15,23,42,0.38)"};
                    will-change: transform; z-index: 26; opacity: ${tool === "laser" ? "0" : "1"};
                }
                .playground-cursor.hammer-cursor {
                    width: ${HAMMER_CURSOR_WIDTH}px; height: ${HAMMER_CURSOR_HEIGHT}px; border: 0; border-radius: 0;
                    background: url(${realisticHammerSrc}) center / contain no-repeat;
                    box-shadow: none; opacity: 1;
                    transform-origin: ${HAMMER_HAND_PIVOT_X}px ${HAMMER_HAND_PIVOT_Y}px;
                    filter: drop-shadow(0 16px 18px rgba(0,0,0,0.58));
                    --hammer-shadow-opacity: 0;
                    --hammer-shadow-scale: 0;
                    --hammer-shock-opacity: 0;
                }
                .playground-cursor.hammer-cursor::before {
                    display: none;
                }
                .playground-cursor.hammer-cursor::after {
                    display: none;
                }
                .playground-cursor.heat-cursor {
                    width: 36px; height: 36px; border: 0; border-radius: 50%; background: transparent;
                    box-shadow: none; opacity: 1; transform-origin: 50% 50%;
                    filter: drop-shadow(0 0 8px rgba(249,115,22,0.62)) drop-shadow(0 6px 8px rgba(0,0,0,0.32));
                }
                .playground-cursor.heat-cursor::before {
                    content: ""; position: absolute; inset: 0;
                    border-radius: 50%;
                    background:
                        radial-gradient(circle, rgba(255,255,255,0.92) 0 8%, rgba(254,240,138,0.58) 9% 19%, rgba(249,115,22,0.18) 20% 42%, transparent 44%),
                        radial-gradient(circle, transparent 0 54%, rgba(254,240,138,0.82) 56% 61%, rgba(249,115,22,0.72) 62% 70%, transparent 72%);
                    box-shadow: inset 0 0 10px rgba(254,240,138,0.34), 0 0 16px rgba(249,115,22,0.32);
                }
                .playground-cursor.heat-cursor::after {
                    content: ""; position: absolute; left: 50%; top: 50%; width: 5px; height: 5px;
                    border-radius: 50%;
                    transform: translate(-50%, -50%);
                    background:
                        radial-gradient(circle, rgba(255,255,255,0.95) 0 28%, rgba(254,240,138,0.9) 32% 62%, rgba(249,115,22,0) 70%);
                    box-shadow: 0 0 10px rgba(254,240,138,0.9), 0 0 18px rgba(249,115,22,0.62);
                    mix-blend-mode: screen;
                }
                .hammer-aim-marker {
                    position: fixed;
                    left: 0;
                    top: 0;
                    width: 46px;
                    height: 28px;
                    border-radius: 50%;
                    pointer-events: none;
                    z-index: 25;
                    opacity: 0;
                    will-change: transform, opacity;
                    background:
                        radial-gradient(ellipse at 50% 58%, rgba(2,6,23,0.72) 0 24%, rgba(15,23,42,0.42) 45%, rgba(15,23,42,0) 78%),
                        radial-gradient(ellipse at 50% 48%, rgba(248,250,252,0.78) 0 7%, rgba(248,250,252,0.24) 8% 15%, transparent 18%);
                    filter: drop-shadow(0 5px 8px rgba(0,0,0,0.56));
                    box-shadow: 0 10px 18px rgba(0,0,0,0.3), 0 0 14px rgba(248,250,252,0.18);
                }
                .hammer-aim-marker::before,
                .hammer-aim-marker::after {
                    content: "";
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    width: 28px;
                    height: 2px;
                    border-radius: 999px;
                    background: linear-gradient(90deg, rgba(15,23,42,0), rgba(15,23,42,0.72), rgba(15,23,42,0));
                    transform-origin: 50% 50%;
                    opacity: 0.72;
                }
                .hammer-aim-marker::before {
                    transform: translate(-50%, -50%) rotate(-12deg);
                }
                .hammer-aim-marker::after {
                    width: 20px;
                    transform: translate(-50%, -50%) rotate(58deg);
                }
                .playground-cursor.laser-cursor {
                    --laser-blade-length: 174px;
                    --laser-plunge: 0px;
                    --laser-heat: 0.72;
                    width: 74px; height: 344px; border: 0; border-radius: 0; background: transparent;
                    box-shadow: none; opacity: 1; transform-origin: 50% 10px;
                    filter: drop-shadow(0 18px 28px rgba(0,0,0,0.64));
                }
                .playground-cursor.laser-cursor::before {
                    content: ""; position: absolute; left: 31px; top: 10px; width: 12px; height: var(--laser-blade-length);
                    border-radius: 999px;
                    background:
                        linear-gradient(90deg, rgba(255,255,255,0) 0 18%, rgba(255,255,255,0.98) 34% 66%, rgba(255,255,255,0) 82% 100%),
                        linear-gradient(180deg, rgba(255,255,255,0.98), rgba(254,226,226,0.98) 16%, rgba(248,113,113,0.92) 78%, rgba(127,29,29,0.34) 100%);
                    box-shadow:
                        0 0 4px rgba(255,255,255,0.96),
                        0 0 10px rgba(254,202,202,0.96),
                        0 0 22px rgba(248,113,113,0.9),
                        0 0 46px rgba(220,38,38,0.84),
                        0 0 78px rgba(127,29,29,0.52);
                    transform-origin: center bottom;
                    transition: height 0.16s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.08s ease, box-shadow 0.08s ease;
                }
                .playground-cursor.laser-cursor::after {
                    content: ""; position: absolute; left: 26px; top: calc(var(--laser-blade-length) + 14px); width: 22px; height: 64px;
                    border-radius: 4px 4px 8px 8px;
                    background:
                        linear-gradient(90deg, rgba(255,255,255,0.22), rgba(255,255,255,0) 16% 84%, rgba(255,255,255,0.18)),
                        linear-gradient(180deg, #d1d5db 0 9%, #111827 9% 18%, #5b6472 18% 28%, #050505 28% 54%, #374151 54% 70%, #0a0a0a 70% 100%);
                    box-shadow:
                        inset 0 1px 0 rgba(255,255,255,0.42),
                        inset 4px 0 5px rgba(255,255,255,0.12),
                        inset -5px 0 6px rgba(0,0,0,0.72),
                        0 10px 22px rgba(0,0,0,0.62),
                        0 0 14px rgba(220,38,38,0.42);
                    transform-origin: center top;
                    transition: top 0.16s cubic-bezier(0.2, 0.8, 0.2, 1);
                }
                .playground-cursor.laser-cursor.laser-pressing::before {
                    filter: brightness(var(--laser-heat)) saturate(1.18);
                    box-shadow:
                        0 0 5px rgba(255,255,255,1),
                        0 0 13px rgba(254,202,202,1),
                        0 0 28px rgba(248,113,113,0.98),
                        0 0 58px rgba(220,38,38,0.92),
                        0 0 96px rgba(127,29,29,0.64);
                }
                .playground-cursor.laser-cursor.laser-pressing::after {
                    transform: translateY(calc(var(--laser-plunge) * 0.16));
                }
                .playground-cursor.shot-cursor {
                    width: 46px; height: 46px; border: 0; border-radius: 0; background: transparent;
                    box-shadow: none; opacity: 1; transform-origin: 50% 50%;
                }
                .playground-cursor.shot-cursor::before {
                    content: ""; position: absolute; left: 5px; top: 5px; width: 36px; height: 36px;
                    border: 1px solid rgba(226,232,240,0.9); border-radius: 999px;
                    background:
                        radial-gradient(circle, rgba(248,250,252,0.98) 0 1.5px, rgba(15,23,42,0.58) 1.5px 3px, rgba(248,250,252,0) 3px),
                        radial-gradient(circle, rgba(248,250,252,0) 0 8px, rgba(226,232,240,0.58) 8px 9px, rgba(248,250,252,0) 9px),
                        linear-gradient(rgba(226,232,240,0.78), rgba(226,232,240,0.78)) center / 1px 100% no-repeat,
                        linear-gradient(90deg, rgba(226,232,240,0.78), rgba(226,232,240,0.78)) center / 100% 1px no-repeat;
                    box-shadow: 0 0 5px rgba(125,211,252,0.36), inset 0 0 0 10px rgba(15,23,42,0.14);
                }
                .playground-cursor.shot-cursor::after {
                    content: ""; position: absolute; left: 8px; top: 8px; width: 30px; height: 30px;
                    border-radius: 999px;
                    background:
                        linear-gradient(rgba(248,250,252,0.66), rgba(248,250,252,0.66)) center top / 1px 7px no-repeat,
                        linear-gradient(rgba(248,250,252,0.66), rgba(248,250,252,0.66)) center bottom / 1px 7px no-repeat,
                        linear-gradient(90deg, rgba(248,250,252,0.66), rgba(248,250,252,0.66)) left center / 7px 1px no-repeat,
                        linear-gradient(90deg, rgba(248,250,252,0.66), rgba(248,250,252,0.66)) right center / 7px 1px no-repeat;
                    box-shadow: 0 0 6px rgba(125,211,252,0.42);
                }
                .playground-cursor.throw-cursor {
                    width: 72px; height: 72px; border: 0; border-radius: 0; background: transparent;
                    box-shadow: none; opacity: 0; transform-origin: 50% 50%;
                }
                .playground-cursor.throw-cursor::before {
                    content: ""; position: absolute; left: 16px; top: 18px; width: 38px; height: 44px;
                    border-radius: 42% 42% 46% 46%;
                    background:
                        radial-gradient(circle at 30% 24%, rgba(255,255,255,0.42), rgba(255,255,255,0) 28%),
                        linear-gradient(135deg, #f6c690, #d9965d 58%, #925a34);
                    box-shadow: inset -7px -7px 10px rgba(91,44,18,0.28), 0 10px 20px rgba(0,0,0,0.34);
                    transform: rotate(-22deg);
                }
                .playground-cursor.throw-cursor::after {
                    content: ""; position: absolute; left: 8px; top: 12px; width: 52px; height: 52px;
                    background:
                        radial-gradient(ellipse at 20px 12px, #f7ca96 0 7px, rgba(0,0,0,0) 7.5px),
                        radial-gradient(ellipse at 30px 10px, #f0bd84 0 7px, rgba(0,0,0,0) 7.5px),
                        radial-gradient(ellipse at 39px 14px, #dda06b 0 6.5px, rgba(0,0,0,0) 7px),
                        radial-gradient(ellipse at 46px 20px, #c98755 0 6px, rgba(0,0,0,0) 6.5px);
                    filter: drop-shadow(0 5px 7px rgba(0,0,0,0.28));
                    transform: rotate(-22deg);
                }
                .hand-food-holder {
                    position: absolute; left: 24px; top: 16px; width: 32px; height: 32px;
                    display: grid; place-items: center; pointer-events: none;
                    z-index: 5; transition: opacity 0.12s, transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
                }
                .throwing .hand-food-holder {
                    opacity: 0; transform: scale(0.4) translate(20px, -20px);
                }
                .food-visual {
                    width: 28px; height: 28px; border-radius: 50%; position: relative;
                    filter: drop-shadow(0 4px 6px rgba(0,0,0,0.34));
                }
                .food-visual.tomato {
                    width: 38px; height: 38px; border-radius: 0;
                    background: url("${slingerTomatoSheetSrc}") 0 50% / 900% 100% no-repeat;
                }
                .food-visual.egg {
                    width: 38px; height: 38px; border-radius: 0;
                    background: url("${slingerEggSheetSrc}") 0 50% / 900% 100% no-repeat;
                }
                .food-visual.watermelon {
                    width: 42px; height: 42px; border-radius: 0;
                    background: url("${slingerWatermelonSheetSrc}") 0 50% / 900% 100% no-repeat;
                }
                .food-visual.strawberry {
                    width: 38px; height: 38px; border-radius: 0;
                    background: url("${slingerStrawberrySheetSrc}") 0 50% / 900% 100% no-repeat;
                }
                .throw-food-picker {
                    display: inline-flex; align-items: center; gap: 3px; padding-left: 4px; margin-left: 2px;
                    border-left: 1px solid rgba(255,255,255,0.1);
                }
                .throw-food-btn {
                    width: 26px; height: 26px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
                    display: inline-grid; place-items: center; padding: 0; cursor: pointer; color: #f8fafc;
                    background: rgba(255,255,255,0.045); font-size: 13px; line-height: 1;
                }
                .throw-food-btn.active {
                    border-color: rgba(251,191,36,0.7); background: rgba(251,191,36,0.16);
                    box-shadow: 0 0 18px rgba(251,191,36,0.16), inset 0 1px 0 rgba(255,255,255,0.14);
                }
                .food-icon { position: relative; width: 18px; height: 18px; display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.38)); }
                .food-icon.tomato {
                    width: 24px; height: 24px; border-radius: 0;
                    background: url("${slingerTomatoSheetSrc}") 0 50% / 900% 100% no-repeat;
                }
                .food-icon.egg {
                    width: 24px; height: 24px; border-radius: 0;
                    background: url("${slingerEggSheetSrc}") 0 50% / 900% 100% no-repeat;
                }
                .food-icon.watermelon {
                    width: 24px; height: 24px; border-radius: 0;
                    background: url("${slingerWatermelonSheetSrc}") 0 50% / 900% 100% no-repeat;
                }
                .food-icon.strawberry {
                    width: 24px; height: 24px; border-radius: 0;
                    background: url("${slingerStrawberrySheetSrc}") 0 50% / 900% 100% no-repeat;
                }
                .object-picker {
                    display: inline-flex; align-items: center; gap: 3px; padding-left: 4px; margin-left: 2px;
                    border-left: 1px solid rgba(255,255,255,0.1);
                }
                .object-btn {
                    width: 28px; height: 26px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
                    display: inline-grid; place-items: center; padding: 0; cursor: pointer; background: rgba(255,255,255,0.045);
                }
                .object-btn.active {
                    border-color: rgba(148,163,184,0.72); background: rgba(148,163,184,0.16);
                    box-shadow: 0 0 18px rgba(148,163,184,0.16), inset 0 1px 0 rgba(255,255,255,0.14);
                }
                .object-icon { position: relative; width: 20px; height: 18px; display: block; filter: drop-shadow(0 2px 4px rgba(0,0,0,0.38)); }
                .object-icon.fly::before {
                    content: ""; position: absolute; left: 8px; top: 4px; width: 5px; height: 12px; border-radius: 50%;
                    background: linear-gradient(90deg, #09090b, #71717a 45%, #18181b);
                }
                .object-icon.fly::after {
                    content: ""; position: absolute; left: 2px; top: 1px; width: 16px; height: 12px;
                    background:
                        radial-gradient(ellipse at 30% 50%, rgba(226,232,240,0.72) 0 32%, rgba(226,232,240,0) 34%),
                        radial-gradient(ellipse at 70% 50%, rgba(226,232,240,0.72) 0 32%, rgba(226,232,240,0) 34%);
                }
                .object-icon.hair::before {
                    content: ""; position: absolute; inset: 0;
                    background:
                        radial-gradient(ellipse at 20% 50%, transparent 0 42%, rgba(17,24,39,0.9) 43% 46%, transparent 47%),
                        radial-gradient(ellipse at 42% 52%, transparent 0 40%, rgba(71,55,39,0.9) 41% 44%, transparent 45%),
                        radial-gradient(ellipse at 64% 48%, transparent 0 38%, rgba(226,232,240,0.72) 39% 42%, transparent 43%);
                    transform: rotate(-20deg);
                }
                .playground-source-panel {
                    position: absolute; right: 20px; top: 78px; width: min(720px, calc(100vw - 40px)); max-height: calc(100vh - 118px);
                    overflow: auto; padding: 12px; border-radius: 18px; z-index: 30;
                    border: 1px solid rgba(255,255,255,0.12); background: rgba(7,10,18,0.84);
                    backdrop-filter: blur(24px) saturate(150%); box-shadow: 0 24px 70px rgba(0,0,0,0.42);
                    display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 10px;
                }
                .source-card {
                    border: 1px solid rgba(255,255,255,0.09); background: rgba(255,255,255,0.04);
                    border-radius: 12px; padding: 8px; color: #e2e8f0; cursor: pointer; text-align: left;
                }
                .source-card.active { border-color: rgba(125,211,252,0.55); background: rgba(14,165,233,0.13); }
                .source-card img { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 8px; display: block; background: #020617; }
                .source-name { margin-top: 7px; font-size: 11px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .source-kind { margin-top: 2px; font-size: 9px; color: rgba(203,213,225,0.66); text-transform: uppercase; letter-spacing: 0.08em; }
            `}</style>
            <canvas
                ref={canvasRef}
                className="playground-canvas"
                onPointerMove={(event) => {
                    if (pointerRef.current.smoothX < -100 || pointerRef.current.smoothY < -100) {
                        pointerRef.current.smoothX = event.clientX;
                        pointerRef.current.smoothY = event.clientY;
                    }
                    pointerRef.current.x = event.clientX;
                    pointerRef.current.y = event.clientY;
                    if (toolRef.current === "throw" && slingerRef.current.active && canvasRef.current) {
                        const point = getCanvasPoint(event, canvasRef.current);
                        const state = slingerRef.current;
                        const pull = clampSlingerPull(state.anchorX, state.anchorY, point.x, point.y);
                        state.targetPullX = pull.x;
                        state.targetPullY = pull.y;
                        return;
                    }
                    if (event.buttons === 1 && canvasRef.current && toolRef.current !== "throw") {
                        if (toolRef.current === "laser") {
                            const point = getCanvasPoint(event, canvasRef.current);
                            const cut = laserCutRef.current;
                            cut.active = true;
                            cut.targetX = point.x;
                            cut.targetY = point.y;
                            return;
                        }
                        const point = getCanvasPoint(event, canvasRef.current);
                        const impactPoint = toolRef.current === "hammer"
                            ? getHammerContactPoint(point.x, point.y)
                            : point;
                        addDragImpact(impactPoint.x, impactPoint.y);
                    }
                }}
                onPointerDown={(event) => {
                    if (event.button === 2 && (toolRef.current === "hammer" || toolRef.current === "scatter" || toolRef.current === "burn")) {
                        event.preventDefault();
                    }
                    event.currentTarget.setPointerCapture(event.pointerId);
                    if (pointerRef.current.smoothX < -100 || pointerRef.current.smoothY < -100) {
                        pointerRef.current.smoothX = event.clientX;
                        pointerRef.current.smoothY = event.clientY;
                    }
                    pointerRef.current.x = event.clientX;
                    pointerRef.current.y = event.clientY;
                    const point = getCanvasPoint(event, event.currentTarget);
                    const impactPoint = toolRef.current === "hammer"
                        ? getHammerContactPoint(point.x, point.y)
                        : point;
                    if (event.button === 2 && toolRef.current === "hammer") {
                        lastDragImpactRef.current = { x: impactPoint.x, y: impactPoint.y, at: performance.now() };
                        startHeavyHammerStrike(impactPoint.x, impactPoint.y);
                        return;
                    }
                    if (event.button === 2 && toolRef.current === "scatter") {
                        lastDragImpactRef.current = { x: impactPoint.x, y: impactPoint.y, at: performance.now() };
                        addImpact(impactPoint.x, impactPoint.y, {
                            heavyArrow: true,
                            impactScale: HEAVY_ARROW_IMPACT_SCALE,
                            skipSuppress: true,
                            toolOverride: "scatter",
                        });
                        return;
                    }
                    if (event.button === 2 && toolRef.current === "burn") {
                        lastDragImpactRef.current = { x: impactPoint.x, y: impactPoint.y, at: performance.now() };
                        addImpact(impactPoint.x, impactPoint.y, {
                            hugeFireball: true,
                            impactScale: 2.25,
                            skipSuppress: true,
                            toolOverride: "burn",
                        });
                        return;
                    }
                    if (event.button === 0) {
                        const now = performance.now();
                        if (toolRef.current === "laser") {
                            laserCutRef.current = {
                                active: true,
                                pointerId: event.pointerId,
                                holdStartAt: now,
                                targetX: point.x,
                                targetY: point.y,
                                tipX: point.x,
                                tipY: point.y,
                                lastTipX: point.x,
                                lastTipY: point.y,
                                lastEmitAt: 0,
                                lastShardAt: 0,
                                angle: lastLaserCutRef.current.angle,
                                initialized: true,
                            };
                            return;
                        }
                        if (toolRef.current === "throw") {
                            event.preventDefault();
                            slingerRef.current = {
                                active: true,
                                pointerId: event.pointerId,
                                anchorX: point.x,
                                anchorY: point.y,
                                pullX: point.x,
                                pullY: point.y,
                                targetPullX: point.x,
                                targetPullY: point.y,
                                chargeStartAt: now,
                                seed: Math.floor(now * 1000) % 100000,
                            };
                            return;
                        }
                    }
                    lastDragImpactRef.current = { x: impactPoint.x, y: impactPoint.y, at: performance.now() };
                    addImpact(impactPoint.x, impactPoint.y);
                }}
                onContextMenu={(event) => {
                    if (toolRef.current === "hammer" || toolRef.current === "scatter" || toolRef.current === "burn") {
                        event.preventDefault();
                    }
                }}
                onPointerUp={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                        event.currentTarget.releasePointerCapture(event.pointerId);
                    }
                    if (slingerRef.current.pointerId === event.pointerId) {
                        const point = getCanvasPoint(event, event.currentTarget);
                        const state = slingerRef.current;
                        const pull = clampSlingerPull(state.anchorX, state.anchorY, point.x, point.y);
                        state.targetPullX = pull.x;
                        state.targetPullY = pull.y;
                        try {
                            launchSlingerFruit();
                        } catch (error) {
                            console.error("[playground] Slinger launch failed", error);
                        }
                        slingerRef.current = createSlingerState();
                    }
                    if (laserCutRef.current.pointerId === event.pointerId) {
                        laserCutRef.current = createLaserCutState();
                    }
                }}
                onPointerCancel={() => {
                    laserCutRef.current = createLaserCutState();
                    slingerRef.current = createSlingerState();
                }}
                onPointerLeave={(event) => {
                    if (event.buttons !== 1 && !slingerRef.current.active) {
                        laserCutRef.current = createLaserCutState();
                    }
                }}
            />
            <div className="playground-hud">
                {TOOLS.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        className={`playground-btn ${tool === item.id ? "active" : ""}`}
                        title={`${item.detail} (${item.hotkey})`}
                        onClick={() => setTool(item.id)}
                    >
                        <span className="tool-title">{item.icon}<span className="tool-label">{item.label}</span></span>
                    </button>
                ))}
                {tool === "throw" && (
                    <div className="throw-food-picker" aria-label="Slinger fruit">
                        {THROW_FOODS.map((food) => (
                            <button
                                key={food.id}
                                type="button"
                                className={`throw-food-btn ${throwFood === food.id ? "active" : ""}`}
                                title={food.label}
                                onClick={() => setThrowFood(food.id)}
                            >
                                <span className={`food-icon ${food.id}`} aria-hidden="true" />
                            </button>
                        ))}
                    </div>
                )}
                <button type="button" className="playground-btn utility" onClick={() => setSourcePickerOpen((value) => !value)}><ImageIcon size={14} /> Source</button>
                <button type="button" className="playground-btn utility" onClick={() => setMuted((value) => !value)}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />} Sound</button>
                <button type="button" className="playground-btn utility" onClick={() => void saveSnapshot()}><Save size={14} /> {saveStatus || "Save"}</button>
                <button type="button" className="playground-btn utility" onClick={reset}><RotateCcw size={14} /> Reset</button>
                <button type="button" className="playground-btn utility" onClick={() => window.screenPlaygroundAPI?.close()}><X size={14} /> Close</button>
            </div>
            {sourcePickerOpen && payload && (
                <div className="playground-source-panel">
                    {payload.sources.map((source) => (
                        <button
                            key={source.id}
                            type="button"
                            className={`source-card ${selectedSourceId === source.id ? "active" : ""}`}
                            onClick={() => chooseSource(source)}
                        >
                            <img src={source.dataUrl} alt="" />
                            <div className="source-name">{source.name}</div>
                            <div className="source-kind">{source.kind}</div>
                        </button>
                    ))}
                </div>
            )}
            <div className="playground-meta">
                {selectedTool.label} mode. Impacts: {impactCount}. 1-9 tools, R reset, Esc close.
            </div>
            <div
                ref={cursorRef}
                className={`playground-cursor ${tool === "hammer" ? "hammer-cursor" : ""} ${tool === "burn" ? "heat-cursor" : ""} ${tool === "laser" ? "laser-cursor" : ""} ${tool === "scatter" ? "shot-cursor" : ""} ${tool === "throw" ? "throw-cursor" : ""}`}
            >
                {tool === "throw" && (
                    <div className="hand-food-holder">
                        <div className={`food-visual ${throwFood}`} />
                    </div>
                )}
                {tool !== "hammer" && tool !== "burn" ? selectedTool.cursor : null}
            </div>
            <div ref={hammerAimRef} className="hammer-aim-marker" />
            {!payload && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#f8fafc", background: "#05070d" }}>
                    Loading Screen Playground...
                </div>
            )}
        </div>
    );
};

createRoot(document.getElementById("root")!).render(<ScreenPlayground />);
