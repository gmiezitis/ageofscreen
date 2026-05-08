import type { ScreenPlaygroundAPI } from "./preload";

declare global {
    interface Window {
        screenPlaygroundAPI?: ScreenPlaygroundAPI;
    }
}

export {};
