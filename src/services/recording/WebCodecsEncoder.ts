/**
 * WebCodecs hardware-accelerated video encoder.
 * Provides high-performance H.264/H.265 encoding via GPU.
 */

export interface EncoderConfig {
    width: number;
    height: number;
    fps: number;
    bitrate: number;
    onChunk: (chunk: EncodedVideoChunk, metadata?: EncodedVideoChunkMetadata) => void;
    onError: (error: any) => void;
}

export class WebCodecsEncoder {
    private encoder: VideoEncoder | null = null;
    private config: EncoderConfig;
    private frameCount = 0;

    constructor(config: EncoderConfig) {
        this.config = config;
        this.initialize();
    }

    private async initialize() {
        try {
            const support = await VideoEncoder.isConfigSupported({
                codec: 'avc1.42E01E', // Baseline H.264
                width: this.config.width,
                height: this.config.height,
                bitrate: this.config.bitrate,
                framerate: this.config.fps,
                latencyMode: 'realtime',
                hardwareAcceleration: 'prefer-hardware'
            });

            if (!support.supported) {
                throw new Error('Hardware-accelerated H.264 not supported on this platform');
            }

            this.encoder = new VideoEncoder({
                output: (chunk, metadata) => {
                    this.config.onChunk(chunk, metadata);
                },
                error: (e) => {
                    this.config.onError(e);
                }
            });

            this.encoder.configure({
                codec: 'avc1.42E01E',
                width: this.config.width,
                height: this.config.height,
                bitrate: this.config.bitrate,
                framerate: this.config.fps,
                latencyMode: 'realtime',
                hardwareAcceleration: 'prefer-hardware',
                avc: { format: 'annexb' }
            });

            console.log('[WebCodecsEncoder] Initialized with support:', support.config);
        } catch (err) {
            this.config.onError(err);
        }
    }

    public encode(canvas: OffscreenCanvas, timestamp: number) {
        if (!this.encoder || this.encoder.state !== 'configured') return;

        // Create a VideoFrame from the canvas
        const frame = new VideoFrame(canvas, { timestamp });

        // Keyframe every 2 seconds
        const keyFrame = this.frameCount % (this.config.fps * 2) === 0;

        this.encoder.encode(frame, { keyFrame });
        frame.close(); // Crucial to prevent memory leaks
        this.frameCount++;
    }

    public async flush() {
        if (this.encoder && this.encoder.state === 'configured') {
            await this.encoder.flush();
        }
    }

    public close() {
        if (this.encoder) {
            if (this.encoder.state !== 'closed') {
                this.encoder.close();
            }
            this.encoder = null;
        }
    }
}
