import { ipcRenderer } from "electron";

const TRIGGER_DEBOUNCE_MS = 360;

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
        triggerLine.addEventListener("pointerenter", notifyTriggerHover);
        triggerLine.addEventListener("click", notifyTriggerHover);
    } else {
        console.error("Preload: Could not find #trigger-line element");
    }
});

console.log("ageofscreen Trigger Preload Script Loaded");
