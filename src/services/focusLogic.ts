import { createWorker } from 'tesseract.js';

export interface FocusTarget {
    x: number;
    y: number;
    width: number;
    height: number;
    text: string;
}

export class FocusLogic {
    private worker: any = null;

    async init() {
        if (this.worker) return;
        this.worker = await createWorker('eng');
    }

    async detectTargets(imageBuffer: Buffer): Promise<FocusTarget[]> {
        if (!this.worker) await this.init();

        const { data: { blocks } } = await this.worker.recognize(imageBuffer);

        // Filter blocks that look like text fields or interesting areas
        return (blocks || []).map((block: any) => ({
            x: block.bbox.x0,
            y: block.bbox.y0,
            width: block.bbox.x1 - block.bbox.x0,
            height: block.bbox.y1 - block.bbox.y0,
            text: block.text
        }));
    }

    async destroy() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
        }
    }
}

export const focusLogic = new FocusLogic();
