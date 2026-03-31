import { ipcRenderer } from "electron";

const TRIGGER_DEBOUNCE_MS = 160;

// Wait for DOM to be ready
window.addEventListener("DOMContentLoaded", () => {
    const triggerLine = document.getElementById("trigger-line");
    let lastTriggerAt = 0;

    const notifyTriggerHover = () => {
        const now = Date.now();
        if (now - lastTriggerAt < TRIGGER_DEBOUNCE_MS) return;
        lastTriggerAt = now;
        ipcRenderer.send("trigger-mouse-enter");
    };

    if (triggerLine) {
        triggerLine.addEventListener("mouseenter", () => {
            console.log("Preload: Trigger Line Hovered");
            notifyTriggerHover();
        });

        // Reopen quickly after close if the pointer is already on the line and only moves slightly.
        triggerLine.addEventListener("mousemove", () => {
            notifyTriggerHover();
        });
    } else {
        console.error("Preload: Could not find #trigger-line element");
    }
});

console.log("SnipFocus Trigger Preload Script Loaded");
