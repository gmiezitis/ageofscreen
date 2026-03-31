export interface FocusTarget {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
}

export class FocusLogic {
    async init() {
        return;
    }

    async detectTargets(): Promise<FocusTarget[]> {
        return [];
    }

    async destroy() {
        return;
    }
}

export const focusLogic = new FocusLogic();
