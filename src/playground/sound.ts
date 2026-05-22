import type { PlaygroundToolId } from "./engine";

let audioContext: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtor) return null;
    if (!audioContext) audioContext = new AudioCtor();
    return audioContext;
};

export const playToolSound = (tool: PlaygroundToolId): void => {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    
    if (tool === "laser") {
        // Star Wars style Lightsaber Ignite + Hum
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        
        osc.type = "sawtooth";
        // Ignition spike
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(110, now + 0.05);
        osc.frequency.linearRampToValueAtTime(80 + Math.random() * 20, now + 0.15);
        
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.01);
        gain.gain.linearRampToValueAtTime(0.04, now + 0.15);
        
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1200, now);
        filter.frequency.exponentialRampToValueAtTime(450, now + 0.15);
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now);
        osc.stop(now + 0.18);
        
        // Add a secondary sub-hum for depth
        const subOsc = ctx.createOscillator();
        const subGain = ctx.createGain();
        subOsc.type = "sine";
        subOsc.frequency.setValueAtTime(40, now);
        subGain.gain.setValueAtTime(0, now);
        subGain.gain.linearRampToValueAtTime(0.08, now + 0.02);
        subGain.gain.linearRampToValueAtTime(0, now + 0.18);
        subOsc.connect(subGain);
        subGain.connect(ctx.destination);
        subOsc.start(now);
        subOsc.stop(now + 0.18);
    } else {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        const baseFrequency = tool === "burn" ? 96 : tool === "scatter" ? 260 : tool === "glyph" ? 520 : 145;
        const endFrequency = tool === "glyph" ? 860 : tool === "scatter" ? 90 : 48;

        filter.type = tool === "burn" ? "lowpass" : "bandpass";
        filter.frequency.setValueAtTime(tool === "glyph" ? 1400 : 720, now);
        osc.type = tool === "glyph" ? "triangle" : tool === "burn" ? "sawtooth" : "square";
        osc.frequency.setValueAtTime(baseFrequency, now);
        osc.frequency.exponentialRampToValueAtTime(endFrequency, now + 0.16);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(tool === "hammer" ? 0.11 : 0.075, now + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
    }
};
