const SKELETON_WALK_SHEET_FRAMES = 20;

const getSkeletonSpriteFrameCount = (sprite: HTMLImageElement): number => (
    sprite.naturalWidth > sprite.naturalHeight * 2 ? SKELETON_WALK_SHEET_FRAMES : 1
);

export class SkeletonController {
    x: number;
    y: number;

    private size: number;
    private readonly seed: number;
    private explodedUntil = 0;
    private facing = 1;
    private lastVx = 0;
    private lastVy = 0;
    private damage = 0;
    private shotDeath: {
        startedAt: number;
        hitX: number;
        hitY: number;
        shotAngle: number;
        originX: number;
        originY: number;
        facing: number;
    } | null = null;

    constructor(x: number, y: number, size: number, seed: number) {
        this.x = x;
        this.y = y;
        this.size = size;
        this.seed = seed;
    }

    update(now: number, deltaMs: number, vx: number, vy: number, size: number): void {
        this.size += (size - this.size) * Math.min(1, deltaMs / 110);
        this.lastVx = vx;
        this.lastVy = vy;
        if (Math.abs(vx) > 0.03) {
            this.facing += ((vx > 0 ? 1 : -1) - this.facing) * Math.min(1, deltaMs / 130);
        }
        if (this.explodedUntil > now) return;
        const scale = Math.min(2, deltaMs / 16);
        this.x += vx * scale;
        this.y += vy * scale;
    }

    draw(ctx: CanvasRenderingContext2D, now: number, sprite?: HTMLImageElement, arrowSprite?: HTMLImageElement): void {
        if (this.shotDeath) {
            this.drawShotDeath(ctx, now, sprite, arrowSprite);
            return;
        }

        const exploded = Math.max(0, this.explodedUntil - now);
        const pulse = Math.min(1, exploded / 360);
        const speed = Math.min(1.4, Math.hypot(this.lastVx, this.lastVy));
        const walk = now * (0.0068 + speed * 0.006) + this.seed;
        const stepLift = (1 - Math.cos(walk * 2)) * 0.5;
        const bob = stepLift * this.size * (0.028 + speed * 0.02);
        const recoil = pulse * Math.sin(now * 0.08 + this.seed) * 0.09;
        const breath = Math.sin(now * 0.0022 + this.seed) * 0.014;
        const lean = Math.max(-0.12, Math.min(0.12, this.lastVx * 0.09)) + recoil + breath;
        const facing = this.facing >= 0 ? 1 : -1;
        const scale = this.size / 150;
        const bone = Math.max(2.8, this.size * 0.032);
        const joint = Math.max(2.8, this.size * 0.03);
        const boneFill = this.damage > 0 ? "rgba(225,214,190,0.96)" : "rgba(232,223,200,0.98)";
        const boneStroke = pulse > 0 ? "rgba(248,250,252,0.68)" : this.damage > 0 ? "rgba(226,216,194,0.92)" : "rgba(232,223,200,0.96)";

        if (sprite?.complete && sprite.naturalWidth > 0) {
            const frameCount = getSkeletonSpriteFrameCount(sprite);
            const sourceWidth = sprite.naturalWidth / frameCount;
            const sourceHeight = sprite.naturalHeight;
            const spriteHeight = this.size * (1.52 + speed * 0.1);
            const spriteWidth = spriteHeight * (sourceWidth / sourceHeight);
            const walkProgress = ((((walk % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2)) * frameCount;
            const frameIndex = Math.floor(walkProgress) % frameCount;
            const livingSway = Math.sin(now * 0.0032 + this.seed) * 0.012;
            const eyeGlow = 0.24 + Math.max(0, Math.sin(walk * 1.8 + this.seed)) * 0.2;
            const drawSpriteFrame = (index: number): void => {
                ctx.drawImage(
                    sprite,
                    index * sourceWidth,
                    0,
                    sourceWidth,
                    sourceHeight,
                    -spriteWidth / 2,
                    -spriteHeight * 0.56,
                    spriteWidth,
                    spriteHeight,
                );
            };

            ctx.save();
            ctx.translate(this.x, this.y + bob);
            ctx.scale(facing, 1);
            ctx.rotate(lean * 0.72 + livingSway);
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            const shadow = ctx.createRadialGradient(0, spriteHeight * 0.42, 0, 0, spriteHeight * 0.42, spriteWidth * 0.52);
            shadow.addColorStop(0, "rgba(0,0,0,0.34)");
            shadow.addColorStop(0.58, "rgba(0,0,0,0.16)");
            shadow.addColorStop(1, "rgba(0,0,0,0)");
            ctx.save();
            ctx.translate(0, spriteHeight * 0.42);
            ctx.scale(1.08, 0.18);
            ctx.fillStyle = shadow;
            ctx.beginPath();
            ctx.arc(0, 0, spriteWidth * 0.54, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();

            drawSpriteFrame(frameIndex);

            ctx.globalCompositeOperation = "screen";
            ctx.fillStyle = `rgba(248,113,113,${eyeGlow})`;
            ctx.shadowColor = "rgba(248,113,113,0.56)";
            ctx.shadowBlur = Math.max(3, this.size * 0.035);
            for (const eyeX of [-0.045, 0.045]) {
                ctx.beginPath();
                ctx.ellipse(eyeX * spriteWidth, -spriteHeight * 0.43, Math.max(1, this.size * 0.009), Math.max(1, this.size * 0.007), 0, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.shadowBlur = 0;

            ctx.globalCompositeOperation = "multiply";
            ctx.strokeStyle = `rgba(45,36,24,${0.16 + this.damage * 0.05})`;
            ctx.lineWidth = Math.max(1, this.size * 0.008);
            for (let mark = 0; mark < this.damage; mark += 1) {
                const offset = (mark - 1) * 9 * scale;
                ctx.beginPath();
                ctx.moveTo(-18 * scale + offset, (-38 + mark * 14) * scale);
                ctx.lineTo(12 * scale + offset, (-24 + mark * 11) * scale);
                ctx.moveTo(-4 * scale + offset, (-42 + mark * 12) * scale);
                ctx.lineTo(18 * scale + offset, (-32 + mark * 10) * scale);
                ctx.stroke();
            }

            if (pulse > 0) {
                ctx.globalCompositeOperation = "screen";
                ctx.strokeStyle = `rgba(255,255,255,${0.38 * pulse})`;
                ctx.lineWidth = Math.max(2, this.size * 0.018);
                ctx.beginPath();
                ctx.ellipse(0, 0, spriteWidth * (0.58 + pulse * 0.14), spriteHeight * (0.44 + pulse * 0.08), recoil, 0, Math.PI * 2);
                ctx.stroke();
            }

            ctx.restore();
            return;
        }

        ctx.save();
        ctx.translate(this.x, this.y + bob);
        ctx.scale(facing, 1);
        ctx.rotate(lean);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        const shadow = ctx.createRadialGradient(0, this.size * 0.84, 0, 0, this.size * 0.84, this.size * 0.72);
        shadow.addColorStop(0, "rgba(0,0,0,0.32)");
        shadow.addColorStop(0.56, "rgba(0,0,0,0.15)");
        shadow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.save();
        ctx.scale(1.2, 0.24);
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.arc(0, this.size * 3.42, this.size * 0.68, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        ctx.strokeStyle = boneStroke;
        ctx.fillStyle = boneFill;
        ctx.lineWidth = bone;
        ctx.shadowColor = "rgba(0,0,0,0.46)";
        ctx.shadowBlur = this.size * 0.035;
        ctx.shadowOffsetX = -facing * this.size * 0.015;
        ctx.shadowOffsetY = this.size * 0.028;

        const headBob = Math.sin(walk * 1.1 + this.seed) * speed * 1.8 * scale;
        const shoulderSway = Math.sin(walk + this.seed * 0.05) * speed * 5 * scale;
        const hipSway = -shoulderSway * 0.48;
        const head = { x: 0, y: -74 * scale + headBob };
        const neck = { x: 0, y: -43 * scale };
        const chest = { x: 0, y: -12 * scale };
        const pelvis = { x: 0, y: 34 * scale };
        const shoulderY = -32 * scale;
        const hipY = 34 * scale;
        const stride = Math.sin(walk);
        const counterStride = Math.sin(walk + Math.PI);
        const armSwing = stride * (13 + speed * 16) * scale;
        const legSwing = stride * (15 + speed * 22) * scale;
        const ribSwing = Math.sin(walk * 1.7) * 3 * scale;

        const traceBone = (a: { x: number; y: number }, b: { x: number; y: number }) => {
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
        };

        const strokeBone = (a: { x: number; y: number }, b: { x: number; y: number }, width = bone) => {
            ctx.save();
            traceBone(a, b);
            ctx.strokeStyle = "rgba(70,54,38,0.28)";
            ctx.lineWidth = width * 1.34;
            ctx.stroke();
            traceBone(a, b);
            ctx.strokeStyle = boneStroke;
            ctx.lineWidth = width;
            ctx.stroke();
            ctx.shadowBlur = 0;
            ctx.translate(-0.65 * scale, -0.55 * scale);
            traceBone(a, b);
            ctx.strokeStyle = "rgba(255,252,232,0.5)";
            ctx.lineWidth = Math.max(0.75, width * 0.28);
            ctx.stroke();
            ctx.restore();
        };

        const drawJoint = (x: number, y: number, radius = joint) => {
            const jointGradient = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.42, 0, x, y, radius * 1.22);
            jointGradient.addColorStop(0, "rgba(255,252,232,0.98)");
            jointGradient.addColorStop(0.58, boneFill);
            jointGradient.addColorStop(1, "rgba(117,98,73,0.68)");
            ctx.save();
            ctx.shadowBlur = this.size * 0.014;
            ctx.fillStyle = "rgba(70,54,38,0.24)";
            ctx.beginPath();
            ctx.arc(x, y, radius * 1.16, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.fillStyle = jointGradient;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };

        ctx.save();
        ctx.shadowBlur = this.size * 0.02;
        ctx.lineWidth = Math.max(1.5, bone * 0.72);
        ctx.beginPath();
        ctx.moveTo(-25 * scale, shoulderY);
        ctx.quadraticCurveTo(-12 * scale, shoulderY - 12 * scale, -2 * scale, shoulderY - 4 * scale);
        ctx.moveTo(25 * scale, shoulderY);
        ctx.quadraticCurveTo(12 * scale, shoulderY - 12 * scale, 2 * scale, shoulderY - 4 * scale);
        ctx.stroke();
        ctx.restore();

        strokeBone(neck, chest);
        strokeBone(chest, pelvis);

        ctx.save();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "rgba(232,223,200,0.92)";
        for (let vertebra = 0; vertebra < 7; vertebra += 1) {
            const y = (-33 + vertebra * 9) * scale;
            ctx.beginPath();
            ctx.ellipse(0, y, 3.2 * scale, 4.4 * scale, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();

        ctx.save();
        ctx.lineWidth = Math.max(1.6, bone * 0.58);
        for (let rib = 0; rib < 7; rib += 1) {
            const y = (-33 + rib * 7.2) * scale;
            const width = (25 - rib * 1.7) * scale;
            const drop = (10 + rib * 1.5) * scale;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.quadraticCurveTo(-width - ribSwing, y + 3 * scale, -width * 0.86, y + drop);
            ctx.moveTo(0, y);
            ctx.quadraticCurveTo(width - ribSwing, y + 3 * scale, width * 0.86, y + drop);
            ctx.stroke();
        }
        ctx.restore();

        ctx.beginPath();
        ctx.ellipse(-10 * scale, hipY + 2 * scale, 13 * scale, 9 * scale, -0.28, 0, Math.PI * 2);
        ctx.ellipse(10 * scale, hipY + 2 * scale, 13 * scale, 9 * scale, 0.28, 0, Math.PI * 2);
        ctx.moveTo(-6 * scale, hipY + 3 * scale);
        ctx.lineTo(6 * scale, hipY + 3 * scale);
        ctx.stroke();

        const limbs = [
            { side: -1, swing: armSwing, shoulder: { x: -24 * scale, y: shoulderY + shoulderSway }, handPhase: counterStride },
            { side: 1, swing: -armSwing, shoulder: { x: 24 * scale, y: shoulderY - shoulderSway }, handPhase: stride },
        ];

        for (const limb of limbs) {
            const elbow = {
                x: limb.shoulder.x + limb.side * 18 * scale + limb.swing * 0.34,
                y: limb.shoulder.y + 35 * scale + Math.cos(walk + limb.side) * 5 * scale,
            };
            const hand = {
                x: elbow.x + limb.side * 12 * scale + limb.swing * 0.18,
                y: elbow.y + 35 * scale + Math.sin(limb.handPhase) * 8 * scale,
            };
            strokeBone(limb.shoulder, elbow, bone * 0.96);
            strokeBone(
                { x: elbow.x - limb.side * 2.2 * scale, y: elbow.y + 0.6 * scale },
                { x: hand.x - limb.side * 1.5 * scale, y: hand.y - 0.4 * scale },
                bone * 0.5,
            );
            strokeBone(
                { x: elbow.x + limb.side * 2.2 * scale, y: elbow.y - 0.6 * scale },
                { x: hand.x + limb.side * 1.3 * scale, y: hand.y + 0.5 * scale },
                bone * 0.42,
            );
            drawJoint(limb.shoulder.x, limb.shoulder.y, joint * 0.8);
            drawJoint(elbow.x, elbow.y, joint * 0.66);
            drawJoint(hand.x, hand.y, joint * 0.58);
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.lineWidth = Math.max(0.8, bone * 0.28);
            for (const finger of [-1.5, -0.5, 0.5, 1.5]) {
                ctx.beginPath();
                ctx.moveTo(hand.x, hand.y);
                ctx.lineTo(hand.x + limb.side * (8 + Math.abs(finger) * 2) * scale, hand.y + finger * 5 * scale + 8 * scale);
                ctx.stroke();
            }
            ctx.restore();
        }

        const legs = [
            { side: -1, swing: legSwing, hip: { x: -13 * scale, y: hipY + hipSway }, phase: stride },
            { side: 1, swing: -legSwing, hip: { x: 13 * scale, y: hipY - hipSway }, phase: counterStride },
        ];

        for (const leg of legs) {
            const knee = {
                x: leg.hip.x + leg.swing * 0.28,
                y: leg.hip.y + 46 * scale + Math.max(0, leg.phase) * 8 * scale,
            };
            const foot = {
                x: knee.x + leg.swing * 0.32 + leg.side * 14 * scale,
                y: knee.y + 45 * scale - Math.max(0, -leg.phase) * 10 * scale,
            };
            strokeBone(leg.hip, knee, bone * 1.08);
            strokeBone(
                { x: knee.x - leg.side * 2.1 * scale, y: knee.y + 0.6 * scale },
                { x: foot.x - leg.side * 1.6 * scale, y: foot.y - 1.3 * scale },
                bone * 0.66,
            );
            strokeBone(
                { x: knee.x + leg.side * 2.2 * scale, y: knee.y - 0.7 * scale },
                { x: foot.x + leg.side * 1.5 * scale, y: foot.y + 1.2 * scale },
                bone * 0.46,
            );
            drawJoint(leg.hip.x, leg.hip.y, joint * 0.8);
            drawJoint(knee.x, knee.y, joint * 0.7);
            drawJoint(foot.x, foot.y, joint * 0.62);
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.lineWidth = Math.max(1, bone * 0.36);
            ctx.beginPath();
            ctx.moveTo(foot.x - leg.side * 2 * scale, foot.y);
            ctx.lineTo(foot.x + leg.side * 17 * scale, foot.y + 4 * scale);
            for (const toe of [-1, 0, 1]) {
                ctx.moveTo(foot.x + leg.side * (8 + toe * 2) * scale, foot.y + 3 * scale);
                ctx.lineTo(foot.x + leg.side * (18 + toe * 3) * scale, foot.y + (7 + Math.abs(toe) * 1.4) * scale);
            }
            ctx.stroke();
            ctx.restore();
        }

        if (this.damage > 0) {
            ctx.save();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = `rgba(15,23,42,${0.34 + this.damage * 0.08})`;
            ctx.lineWidth = Math.max(1, this.size * 0.012);
            for (let mark = 0; mark < this.damage; mark += 1) {
                const offset = (mark - 1) * 10 * scale;
                ctx.beginPath();
                ctx.moveTo(-16 * scale + offset, (-24 + mark * 8) * scale);
                ctx.lineTo(6 * scale + offset, (-10 + mark * 7) * scale);
                ctx.moveTo(-6 * scale + offset, (-27 + mark * 6) * scale);
                ctx.lineTo(15 * scale + offset, (-17 + mark * 8) * scale);
                ctx.stroke();
            }
            ctx.restore();
        }

        ctx.beginPath();
        ctx.moveTo(head.x - 17 * scale, head.y - 4 * scale);
        ctx.bezierCurveTo(head.x - 23 * scale, head.y - 28 * scale, head.x + 23 * scale, head.y - 28 * scale, head.x + 17 * scale, head.y - 4 * scale);
        ctx.bezierCurveTo(head.x + 17 * scale, head.y + 8 * scale, head.x + 11 * scale, head.y + 15 * scale, head.x + 8 * scale, head.y + 23 * scale);
        ctx.lineTo(head.x - 8 * scale, head.y + 23 * scale);
        ctx.bezierCurveTo(head.x - 11 * scale, head.y + 15 * scale, head.x - 17 * scale, head.y + 8 * scale, head.x - 17 * scale, head.y - 4 * scale);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.save();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(83,68,49,0.46)";
        ctx.lineWidth = Math.max(0.85, this.size * 0.0065);
        ctx.beginPath();
        ctx.moveTo(0, head.y - 26 * scale);
        ctx.quadraticCurveTo(-3 * scale, head.y - 17 * scale, 1.5 * scale, head.y - 9 * scale);
        ctx.quadraticCurveTo(4 * scale, head.y - 3 * scale, 0, head.y + 3 * scale);
        ctx.moveTo(-15 * scale, head.y + 5 * scale);
        ctx.quadraticCurveTo(-10 * scale, head.y + 9 * scale, -4 * scale, head.y + 10 * scale);
        ctx.moveTo(15 * scale, head.y + 5 * scale);
        ctx.quadraticCurveTo(10 * scale, head.y + 9 * scale, 4 * scale, head.y + 10 * scale);
        ctx.moveTo(-5 * scale, head.y - 20 * scale);
        ctx.lineTo(-12 * scale, head.y - 16 * scale);
        ctx.moveTo(5 * scale, head.y - 20 * scale);
        ctx.lineTo(12 * scale, head.y - 16 * scale);
        ctx.stroke();
        ctx.restore();

        ctx.fillStyle = "rgba(15,23,42,0.92)";
        ctx.shadowBlur = 0;
        for (const eyeX of [-7, 7]) {
            ctx.beginPath();
            ctx.ellipse(eyeX * scale, head.y - 4 * scale, 5.4 * scale, 7.2 * scale, eyeX > 0 ? -0.16 : 0.16, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.beginPath();
        ctx.moveTo(0, head.y + 2 * scale);
        ctx.lineTo(-4 * scale, head.y + 10 * scale);
        ctx.lineTo(4 * scale, head.y + 10 * scale);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(-8 * scale, head.y + 16 * scale);
        ctx.lineTo(8 * scale, head.y + 16 * scale);
        for (let tooth = -3; tooth <= 3; tooth += 1) {
            ctx.moveTo(tooth * 2.4 * scale, head.y + 13.4 * scale);
            ctx.lineTo(tooth * 2.4 * scale, head.y + 19 * scale);
        }
        ctx.strokeStyle = "rgba(15,23,42,0.72)";
        ctx.lineWidth = Math.max(1, this.size * 0.012);
        ctx.stroke();

        const eyeGlow = 0.45 + Math.sin(now * 0.014 + this.seed) * 0.18 + pulse * 0.3;
        ctx.fillStyle = `rgba(239,68,68,${eyeGlow})`;
        ctx.shadowColor = "rgba(239,68,68,0.84)";
        ctx.shadowBlur = this.size * 0.06;
        for (const eyeX of [-7, 7]) {
            ctx.beginPath();
            ctx.arc(eyeX * scale, head.y - 2 * scale, Math.max(1.6, 2.4 * scale), 0, Math.PI * 2);
            ctx.fill();
        }

        if (pulse > 0) {
            ctx.globalCompositeOperation = "screen";
            ctx.strokeStyle = `rgba(255,255,255,${0.34 * pulse})`;
            ctx.lineWidth = Math.max(2, this.size * 0.018);
            ctx.beginPath();
            ctx.ellipse(0, 6 * scale, this.size * (0.38 + pulse * 0.12), this.size * (0.72 + pulse * 0.1), recoil, 0, Math.PI * 2);
            ctx.stroke();
        }

        ctx.restore();
    }

    hit(damage: number): void {
        this.damage = Math.max(this.damage, damage);
        this.explodedUntil = performance.now() + 360;
    }

    startShotDeath(now: number, hitX: number, hitY: number, shotAngle: number, damage: number): void {
        this.damage = Math.max(this.damage, damage);
        this.explodedUntil = 0;
        this.shotDeath = {
            startedAt: now,
            hitX,
            hitY,
            shotAngle,
            originX: this.x,
            originY: this.y,
            facing: this.facing >= 0 ? 1 : -1,
        };
    }

    isShotDying(): boolean {
        return this.shotDeath !== null;
    }

    isShotDeathComplete(now: number): boolean {
        return Boolean(this.shotDeath && now - this.shotDeath.startedAt > 1900);
    }

    explode(): void {
        this.hit(this.damage);
    }

    private drawShotDeath(ctx: CanvasRenderingContext2D, now: number, sprite?: HTMLImageElement, arrowSprite?: HTMLImageElement): void {
        if (!this.shotDeath) return;

        const death = this.shotDeath;
        const age = Math.max(0, now - death.startedAt);
        const t = Math.max(0, Math.min(1, age / 1380));
        const impact = 1 - Math.pow(1 - Math.min(1, t / 0.24), 3);
        const buckle = Math.max(0, Math.min(1, (t - 0.12) / 0.34));
        const fall = Math.max(0, Math.min(1, (t - 0.36) / 0.48));
        const settle = Math.max(0, Math.min(1, (t - 0.78) / 0.22));
        const fade = age > 1500 ? Math.max(0, 1 - (age - 1500) / 400) : 1;
        const pushX = Math.cos(death.shotAngle) * this.size * (0.08 + impact * 0.34);
        const pushY = Math.sin(death.shotAngle) * this.size * (0.04 + impact * 0.16);
        const fallSide = death.facing >= 0 ? 1 : -1;
        const x = death.originX + pushX + fallSide * this.size * 0.16 * fall;
        const y = death.originY + pushY + this.size * (0.16 * buckle + 0.54 * fall);
        const rotation = (-0.1 * impact + fallSide * (0.42 * buckle + 1.28 * fall)) * (1 - settle * 0.08);
        const squashY = 1 - 0.18 * buckle - 0.1 * settle;
        const spriteHeight = this.size * (1.54 - 0.14 * fall);
        const spriteFrameCount = sprite?.naturalHeight ? getSkeletonSpriteFrameCount(sprite) : 1;
        const spriteFrameWidth = sprite?.naturalWidth ? sprite.naturalWidth / spriteFrameCount : 0;
        const spriteWidth = sprite?.naturalHeight ? spriteHeight * (spriteFrameWidth / sprite.naturalHeight) : this.size * 0.8;

        this.x = x;
        this.y = y;

        ctx.save();
        ctx.globalAlpha *= fade;
        const shadowWidth = this.size * (0.72 + fall * 0.9);
        const shadow = ctx.createRadialGradient(x, death.originY + this.size * 0.7, 0, x, death.originY + this.size * 0.7, shadowWidth);
        shadow.addColorStop(0, "rgba(0,0,0,0.34)");
        shadow.addColorStop(0.62, "rgba(0,0,0,0.14)");
        shadow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.ellipse(x, death.originY + this.size * 0.7, shadowWidth, this.size * (0.16 + fall * 0.05), 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.translate(x, y);
        ctx.scale(death.facing, squashY);
        ctx.rotate(rotation);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        if (sprite?.complete && sprite.naturalWidth > 0) {
            ctx.save();
            const frameCount = getSkeletonSpriteFrameCount(sprite);
            const sourceWidth = sprite.naturalWidth / frameCount;
            const sourceHeight = sprite.naturalHeight;
            const recoilShear = Math.sin(age * 0.028 + this.seed) * 0.035 * (1 - fall);
            ctx.transform(1, recoilShear, -recoilShear * 0.55, 1, 0, 0);
            ctx.drawImage(
                sprite,
                0,
                0,
                sourceWidth,
                sourceHeight,
                -spriteWidth / 2,
                -spriteHeight * 0.56,
                spriteWidth,
                spriteHeight,
            );
            ctx.restore();
        } else {
            this.drawFallbackCorpse(ctx, now, fall, buckle);
        }

        const localHitY = -this.size * (0.08 + buckle * 0.14);
        const arrowAngle = death.shotAngle * death.facing - rotation;
        this.drawEmbeddedArrow(ctx, -this.size * 0.02, localHitY, arrowAngle, this.size * 0.82, 1 - settle * 0.12, arrowSprite);

        ctx.globalCompositeOperation = "screen";
        ctx.fillStyle = `rgba(248,113,113,${0.46 * (1 - settle)})`;
        ctx.shadowColor = "rgba(248,113,113,0.7)";
        ctx.shadowBlur = Math.max(4, this.size * 0.055);
        ctx.beginPath();
        ctx.ellipse(-this.size * 0.02, localHitY, this.size * 0.055, this.size * 0.034, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    private drawEmbeddedArrow(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, length: number, alpha: number, sprite?: HTMLImageElement): void {
        const forwardX = Math.cos(angle);
        const forwardY = Math.sin(angle);
        const sideX = Math.cos(angle + Math.PI / 2);
        const sideY = Math.sin(angle + Math.PI / 2);
        const tipX = x + forwardX * length * 0.18;
        const tipY = y + forwardY * length * 0.18;
        const tailX = tipX - forwardX * length;
        const tailY = tipY - forwardY * length;

        ctx.save();
        ctx.globalAlpha *= alpha;
        if (sprite?.complete && sprite.naturalWidth > 0) {
            const spriteRatio = sprite.naturalHeight / sprite.naturalWidth;
            const height = Math.max(18, length * spriteRatio);
            ctx.translate(tipX, tipY);
            ctx.rotate(angle);
            ctx.scale(-1, 1);
            ctx.shadowColor = "rgba(0,0,0,0.46)";
            ctx.shadowBlur = Math.max(5, height * 0.26);
            ctx.drawImage(sprite, 0, -height / 2, length, height);
            ctx.restore();
            return;
        }
        ctx.strokeStyle = "rgba(15,23,42,0.7)";
        ctx.lineWidth = Math.max(3, length * 0.05);
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        ctx.strokeStyle = "rgba(226,232,240,0.94)";
        ctx.lineWidth = Math.max(1.2, length * 0.018);
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(tipX - forwardX * length * 0.08, tipY - forwardY * length * 0.08);
        ctx.stroke();
        ctx.fillStyle = "rgba(203,213,225,0.96)";
        ctx.beginPath();
        ctx.moveTo(tipX + forwardX * length * 0.06, tipY + forwardY * length * 0.06);
        ctx.lineTo(tipX - forwardX * length * 0.12 + sideX * length * 0.052, tipY - forwardY * length * 0.12 + sideY * length * 0.052);
        ctx.lineTo(tipX - forwardX * length * 0.05, tipY - forwardY * length * 0.05);
        ctx.lineTo(tipX - forwardX * length * 0.12 - sideX * length * 0.052, tipY - forwardY * length * 0.12 - sideY * length * 0.052);
        ctx.closePath();
        ctx.fill();
        for (const side of [-1, 1]) {
            ctx.fillStyle = side > 0 ? "rgba(31,41,55,0.88)" : "rgba(100,116,139,0.82)";
            ctx.beginPath();
            ctx.moveTo(tailX, tailY);
            ctx.lineTo(tailX - forwardX * length * 0.12 + sideX * side * length * 0.07, tailY - forwardY * length * 0.12 + sideY * side * length * 0.07);
            ctx.lineTo(tailX + forwardX * length * 0.1 + sideX * side * length * 0.034, tailY + forwardY * length * 0.1 + sideY * side * length * 0.034);
            ctx.closePath();
            ctx.fill();
        }
        ctx.restore();
    }

    private drawFallbackCorpse(ctx: CanvasRenderingContext2D, now: number, fall: number, buckle: number): void {
        const scale = this.size / 150;
        const boneWidth = Math.max(2.4, this.size * 0.028);
        ctx.strokeStyle = "rgba(232,223,200,0.96)";
        ctx.fillStyle = "rgba(232,223,200,0.96)";
        ctx.lineWidth = boneWidth;
        ctx.shadowColor = "rgba(0,0,0,0.42)";
        ctx.shadowBlur = this.size * 0.025;

        const torsoTilt = fall * 0.6 + buckle * 0.24;
        ctx.save();
        ctx.rotate(torsoTilt);
        ctx.beginPath();
        ctx.moveTo(0, -44 * scale);
        ctx.lineTo(0, 36 * scale);
        ctx.stroke();
        for (let rib = 0; rib < 6; rib += 1) {
            const y = (-32 + rib * 9) * scale;
            const width = (25 - rib * 1.4) * scale;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.quadraticCurveTo(-width, y + 4 * scale, -width * 0.82, y + 12 * scale);
            ctx.moveTo(0, y);
            ctx.quadraticCurveTo(width, y + 4 * scale, width * 0.82, y + 12 * scale);
            ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, -72 * scale, 18 * scale, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        const twitch = Math.sin(now * 0.024 + this.seed) * (1 - fall) * 5 * scale;
        for (const side of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(side * 18 * scale, -30 * scale);
            ctx.lineTo(side * (34 + twitch) * scale, 10 * scale + side * fall * 8 * scale);
            ctx.lineTo(side * (48 + twitch) * scale, 48 * scale);
            ctx.moveTo(side * 14 * scale, 34 * scale);
            ctx.lineTo(side * (30 - twitch) * scale, 76 * scale);
            ctx.lineTo(side * (62 - twitch) * scale, 84 * scale);
            ctx.stroke();
        }
    }
}
