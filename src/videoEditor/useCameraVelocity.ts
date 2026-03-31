import { useEffect, useRef, useState } from 'react';

type ParsedTransform = { tx: number; ty: number; rot: number; scale: number; dz: number };

const parseTransform = (transform?: string): ParsedTransform => {
    if (!transform) return { tx: 0, ty: 0, rot: 0, scale: 1, dz: 0 };
    const txMatch = transform.match(/translateX\((-?\d*\.?\d+)px\)/);
    const tyMatch = transform.match(/translateY\((-?\d*\.?\d+)px\)/);
    const rotMatch = transform.match(/rotate\((-?\d*\.?\d+)deg\)/);
    const scaleMatch = transform.match(/scale\((-?\d*\.?\d+)\)/);
    const dzMatch = transform.match(/translateZ\((-?\d*\.?\d+)px\)/);
    return {
        tx: txMatch ? parseFloat(txMatch[1]) : 0,
        ty: tyMatch ? parseFloat(tyMatch[1]) : 0,
        rot: rotMatch ? parseFloat(rotMatch[1]) : 0,
        scale: scaleMatch ? parseFloat(scaleMatch[1]) : 1,
        dz: dzMatch ? parseFloat(dzMatch[1]) : 0,
    };
};

export const useCameraVelocity = (effectStyle: React.CSSProperties) => {
    const [velocity, setVelocity] = useState({ dx: 0, dy: 0 });
    const prevRef = useRef<{ tx: number; ty: number; rot: number; scale: number; dz: number; ts: number }>({
        tx: 0,
        ty: 0,
        rot: 0,
        scale: 1,
        dz: 0,
        ts: performance.now(),
    });

    useEffect(() => {
        let decayTimer: ReturnType<typeof setTimeout>;

        const now = performance.now();
        const { tx, ty, rot, scale, dz } = parseTransform(effectStyle.transform as string | undefined);
        const prev = prevRef.current;
        const dt = Math.max(1, now - prev.ts);

        if (dt > 100) {
            setVelocity({ dx: 0, dy: 0 });
            prevRef.current = { tx, ty, rot, scale, dz, ts: now };
            return;
        }

        // Map sway, rotation, and scale deltas to a screen-space proxy velocity.
        const deltaX = Math.abs(tx - prev.tx) + Math.abs(rot - prev.rot) * 3 + Math.abs(scale - prev.scale) * 80 + Math.abs(dz - prev.dz) * 0.01;
        const deltaY = Math.abs(ty - prev.ty) + Math.abs(rot - prev.rot) * 2 + Math.abs(scale - prev.scale) * 80 + Math.abs(dz - prev.dz) * 0.01;

        const dx = (deltaX / dt) * 16;
        const dy = (deltaY / dt) * 16;

        setVelocity({ dx, dy });
        prevRef.current = { tx, ty, rot, scale, dz, ts: now };

        decayTimer = setTimeout(() => {
            setVelocity({ dx: 0, dy: 0 });
        }, 50);

        return () => clearTimeout(decayTimer);
    }, [effectStyle.transform]);

    return velocity;
};
