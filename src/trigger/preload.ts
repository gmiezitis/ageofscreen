import { ipcRenderer } from "electron";

const TRIGGER_DEBOUNCE_MS = 60;
const TRIGGER_HOVER_INTENT_MS = 180;

// Wait for DOM to be ready
window.addEventListener("DOMContentLoaded", () => {
    const triggerLine = document.getElementById("trigger-line");
    let lastTriggerAt = 0;
    let hoverIntentTimeout: number | null = null;
    let pointerInside = false;

    const notifyTriggerHover = () => {
        const now = Date.now();
        if (now - lastTriggerAt < TRIGGER_DEBOUNCE_MS) return;
        lastTriggerAt = now;
        ipcRenderer.send("trigger-mouse-enter");
    };

    const cancelHoverIntent = () => {
        pointerInside = false;
        if (hoverIntentTimeout !== null) {
            window.clearTimeout(hoverIntentTimeout);
            hoverIntentTimeout = null;
        }
    };

    const armHoverIntent = () => {
        pointerInside = true;
        if (hoverIntentTimeout !== null) return;
        hoverIntentTimeout = window.setTimeout(() => {
            hoverIntentTimeout = null;
            if (!pointerInside) return;
            console.log("Preload: Trigger Line Hovered");
            notifyTriggerHover();
        }, TRIGGER_HOVER_INTENT_MS);
    };

    if (triggerLine) {
        triggerLine.addEventListener("mouseenter", armHoverIntent);
        triggerLine.addEventListener("mousemove", armHoverIntent);
        triggerLine.addEventListener("pointerenter", armHoverIntent);
        triggerLine.addEventListener("pointermove", armHoverIntent);
        triggerLine.addEventListener("mouseleave", cancelHoverIntent);
        triggerLine.addEventListener("pointerleave", cancelHoverIntent);
        window.addEventListener("blur", cancelHoverIntent);
    } else {
        console.error("Preload: Could not find #trigger-line element");
    }
});

console.log("ageofscreen Trigger Preload Script Loaded");
