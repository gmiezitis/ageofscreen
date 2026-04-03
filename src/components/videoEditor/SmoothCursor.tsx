import React, { useEffect, useState, useMemo } from 'react';
import { InteractionEvent } from '../../services/metadataRecorder';

interface SmoothCursorProps {
    cursorData: InteractionEvent[];
    displayTime: number; // in seconds
}

type CursorVariant = 'off' | 'minimal_light' | 'minimal_dark' | 'warm' | 'dot';

const CURSOR_STORAGE_KEY = 'ageofscreen-cursor-variant';
const DEFAULT_CURSOR_VARIANT: CursorVariant = 'minimal_light';

const getCursorVariant = (): CursorVariant => {
    try {
        const stored = localStorage.getItem(CURSOR_STORAGE_KEY) as CursorVariant | null;
        if (stored && ['off', 'minimal_light', 'minimal_dark', 'warm', 'dot'].includes(stored)) {
            return stored === 'warm' ? 'minimal_light' : stored;
        }
    } catch {
        // ignore localStorage access errors
    }
    return DEFAULT_CURSOR_VARIANT;
};

function interpolateCursorPos(
    cursorData: InteractionEvent[],
    currentMs: number,
): { x: number; y: number; isClicking: boolean } | null {
    const events = cursorData.filter(e => e.type === 'move' || e.type === 'click');
    if (events.length === 0) return null;

    // Find the index of the event just before currentMs
    let idx = -1;
    for (let i = 0; i < events.length; i++) {
        if (events[i].t <= currentMs) idx = i;
        else break;
    }

    if (idx < 0) {
        // Before first event
        return { x: events[0].x, y: events[0].y, isClicking: events[0].type === 'click' };
    }
    if (idx >= events.length - 1) {
        // After last event
        const last = events[events.length - 1];
        return { x: last.x, y: last.y, isClicking: last.type === 'click' };
    }

    const p1 = events[idx];
    const p2 = events[idx + 1];

    const tDiff = p2.t - p1.t;
    const progress = tDiff === 0 ? 0 : (currentMs - p1.t) / tDiff;
    const eased = Math.max(0, Math.min(1, progress));
    const x = p1.x + (p2.x - p1.x) * eased;
    const y = p1.y + (p2.y - p1.y) * eased;
    const nearestClick = [p1, p2].find((event) => event.type === 'click');
    const isClicking = !!nearestClick && Math.abs(currentMs - nearestClick.t) <= 110;

    return { x, y, isClicking };
}

const rippleKeyframes = `
@keyframes snip-cursor-ripple {
    0%   { transform: translate(-50%, -50%) scale(0.4); opacity: 0.7; }
    100% { transform: translate(-50%, -50%) scale(2.8); opacity: 0; }
}
`;

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('snip-cursor-ripple-style')) {
    const style = document.createElement('style');
    style.id = 'snip-cursor-ripple-style';
    style.textContent = rippleKeyframes;
    document.head.appendChild(style);
}

export const SmoothCursor: React.FC<SmoothCursorProps> = ({ cursorData, displayTime }) => {
    const [pos, setPos] = useState({ x: -100, y: -100, isClicking: false });

    // Extract capture bounds from meta event
    const captureBounds = useMemo(() => {
        const meta = cursorData.find(e => e.type === 'meta');
        return meta?.bounds || { x: 0, y: 0, width: 1920, height: 1080 };
    }, [cursorData]);

    useEffect(() => {
        if (!cursorData || cursorData.length === 0) return;
        const currentMs = displayTime * 1000;
        const result = interpolateCursorPos(cursorData, currentMs);
        if (result) {
            setPos(result);
        }
    }, [cursorData, displayTime]);

    if (pos.x < 0 && pos.y < 0) return null;

    const cursorVariant = getCursorVariant();
    if (cursorVariant === 'off') return null;

    const cursorSize = cursorVariant === 'dot' ? 10 : 20;
    const fill = cursorVariant === 'minimal_dark' ? '#0f172a' : '#ffffff';
    const stroke = cursorVariant === 'minimal_dark' ? '#f8fafc' : '#111827';
    const shadow = cursorVariant === 'minimal_dark' ? '0px 1px 5px rgba(15,23,42,0.34)' : '0px 2px 8px rgba(15,23,42,0.32)';
    const rippleColor = cursorVariant === 'minimal_dark' ? 'rgba(248,250,252,0.34)' : 'rgba(255,255,255,0.52)';

    // Map absolute screen coordinate back to capture-relative %
    const relX = ((pos.x - captureBounds.x) / captureBounds.width) * 100;
    const relY = ((pos.y - captureBounds.y) / captureBounds.height) * 100;

    return (
        <div style={{
            position: 'absolute',
            left: `${relX}%`,
            top: `${relY}%`,
            width: cursorSize,
            height: cursorSize,
            pointerEvents: 'none',
            zIndex: 100,
            transform: `translate(-50%, -50%) scale(${pos.isClicking ? 0.88 : 1})`,
            transition: 'transform 0.1s ease-out',
        }}>
            {/* Click ripple ring */}
            {pos.isClicking && (
                <div style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    width: cursorSize * 2,
                    height: cursorSize * 2,
                    borderRadius: '999px',
                    border: `2px solid ${rippleColor}`,
                    animation: 'snip-cursor-ripple 0.55s ease-out forwards',
                    pointerEvents: 'none',
                }} />
            )}

            {cursorVariant === 'dot' ? (
                <div style={{
                    width: cursorSize,
                    height: cursorSize,
                    borderRadius: '50%',
                    background: fill,
                    border: `1.5px solid ${stroke}`,
                    boxShadow: `${shadow}, 0 0 0 ${pos.isClicking ? 4 : 0}px rgba(255,255,255,0.14)`,
                    transition: 'box-shadow 0.1s ease-out',
                }} />
            ) : (
                <svg
                    width={cursorSize}
                    height={cursorSize * 1.3}
                    viewBox="0 0 18 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                    style={{ filter: `drop-shadow(${shadow})` }}
                >
                    <path
                        d="M2 1.5L14.4 13.7C15.1 14.4 14.5 15.6 13.5 15.6H9.5L7.2 21.8C6.9 22.6 5.8 22.6 5.4 21.8L3.2 16.8H1.5C0.6 16.8 0.1 15.7 0.7 15.1L2 1.5Z"
                        fill={fill}
                        stroke={stroke}
                        strokeWidth="1.15"
                        strokeLinejoin="round"
                    />
                </svg>
            )}
        </div>
    );
};
