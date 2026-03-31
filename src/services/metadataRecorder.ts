import { screen } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { RELEASE_PROFILE } from '../config/releaseProfile';

export type InteractionEvent = {
    type: 'move' | 'click' | 'key' | 'meta' | 'zoom_toggle';
    x: number;
    y: number;
    t: number;
    button?: number;
    key?: number;
    zoomIn?: boolean;
    bounds?: { x: number; y: number; width: number; height: number };
    ignoredByAutoFocus?: boolean;
    ignoredTarget?: 'recording_widget' | 'webcam' | string;
    nativeCursorSuppressed?: boolean;
    capturePlatform?: string;
};

const CURSOR_SAMPLE_INTERVAL_MS = 8;
const CLICK_SAMPLE_INTERVAL_MS = 12;

let recordedMetadata: InteractionEvent[] = [];
let recordingStartTime: number | null = null;
let isRecording = false;

let pollInterval: NodeJS.Timeout | null = null;
let clickProcess: ChildProcess | null = null;
let lastX = 0;
let lastY = 0;
let captureBounds: { x: number; y: number; width: number; height: number } | null = null;
let clickListener: ((x: number, y: number) => void) | null = null;
let clickMetadataResolver: ((x: number, y: number) => Partial<InteractionEvent> | null) | null = null;
let recordingMetaOverrides: Partial<InteractionEvent> = {};

const resolvePowerShellBinary = (): string => {
    if (process.platform !== 'win32') return 'powershell';

    const systemRoot = process.env.SYSTEMROOT || 'C:\\Windows';
    const candidates = [
        path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        path.join(systemRoot, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        'powershell.exe',
        'pwsh.exe',
    ];

    return candidates.find((candidate) => candidate.endsWith('.exe') ? fs.existsSync(candidate) : true) || 'powershell.exe';
};

/** Called from index.ts when the user triggers a zoom mark (e.g. via Alt+Z). */
export const recordZoomToggle = (x: number, y: number, zoomIn: boolean) => {
    pushEvent({ type: 'zoom_toggle', x, y, button: 2, zoomIn, t: recordingStartTime ? Date.now() - recordingStartTime : 0 });
};

/** Optional runtime listener for live click actions while recording. */
export const setClickListener = (listener: ((x: number, y: number) => void) | null) => {
    clickListener = listener;
};

/** Optional click metadata classifier used to suppress auto-focus on utility UI like webcam/widget windows. */
export const setClickMetadataResolver = (resolver: ((x: number, y: number) => Partial<InteractionEvent> | null) | null) => {
    clickMetadataResolver = resolver;
};

export const setRecordingCaptureMetadata = (metadata: Partial<InteractionEvent>) => {
    recordingMetaOverrides = { ...recordingMetaOverrides, ...metadata };
    const metaIndex = recordedMetadata.findIndex((event) => event?.type === 'meta');
    if (metaIndex >= 0) {
        recordedMetadata[metaIndex] = {
            ...recordedMetadata[metaIndex],
            ...recordingMetaOverrides,
        };
    }
};

function pushEvent(event: InteractionEvent) {
    if (!isRecording || !recordingStartTime) return;
    recordedMetadata.push(event);
}

export const startMetadataRecording = (bounds?: { x: number; y: number; width: number; height: number }) => {
    recordedMetadata = [];
    recordingStartTime = Date.now();
    isRecording = true;
    captureBounds = bounds || null;
    recordingMetaOverrides = {};

    const initialPoint = screen.getCursorScreenPoint();
    lastX = initialPoint.x;
    lastY = initialPoint.y;

    pushEvent({
        type: 'meta',
        x: 0, y: 0, t: 0,
        bounds: captureBounds || screen.getPrimaryDisplay().bounds,
        ...recordingMetaOverrides,
    });

    pushEvent({
        type: 'move',
        x: lastX,
        y: lastY,
        t: 0,
    });

    console.log('[MetadataRecorder] Starting robust tracking with bounds:', captureBounds, 'sampleIntervalMs=', CURSOR_SAMPLE_INTERVAL_MS);

    pollInterval = setInterval(() => {
        if (!isRecording || !recordingStartTime) return;
        const pt = screen.getCursorScreenPoint();

        if (pt.x !== lastX || pt.y !== lastY) {
            lastX = pt.x;
            lastY = pt.y;
            pushEvent({
                type: 'move',
                x: pt.x,
                y: pt.y,
                t: Date.now() - recordingStartTime
            });
        }
    }, CURSOR_SAMPLE_INTERVAL_MS);

    if (!RELEASE_PROFILE.allowExternalExecutableInterop) {
        console.log('[MetadataRecorder] Click tracking disabled for this release profile. Recording cursor movement metadata only.');
        return;
    }

    const psScript = `
        Add-Type -TypeDefinition '
        using System;
        using System.Runtime.InteropServices;
        public class Win32 {
            [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
        }';
        $p = $false;
        while($true) {
            $s = [Win32]::GetAsyncKeyState(1) -band 0x8000;
            if ($s -and -not $p) { Write-Output "C" }
            $p = $s;
            Start-Sleep -Milliseconds ${CLICK_SAMPLE_INTERVAL_MS}
        }
    `;

    try {
        clickProcess = spawn(resolvePowerShellBinary(), ['-NoProfile', '-Command', psScript], { windowsHide: true });
        clickProcess.stdout?.on('data', (data) => {
            if (!recordingStartTime) return;
            if (data.toString().includes('C')) {
                const extraMetadata = clickMetadataResolver?.(lastX, lastY) ?? null;
                pushEvent({
                    type: 'click',
                    x: lastX,
                    y: lastY,
                    button: 1,
                    t: Date.now() - recordingStartTime,
                    ...(extraMetadata ?? {}),
                });
                if (clickListener) {
                    clickListener(lastX, lastY);
                }
            }
        });
        clickProcess.on('error', (error) => {
            console.error('[MetadataRecorder] Click tracker process failed:', error);
        });
        clickProcess.on('exit', (code) => {
            if (isRecording && code !== null && code !== 0) {
                console.warn('[MetadataRecorder] Click tracker exited unexpectedly with code', code);
            }
        });
    } catch (err) {
        console.error('[MetadataRecorder] Failed to start click tracker:', err);
    }
};

export const stopMetadataRecording = (): InteractionEvent[] => {
    isRecording = false;
    recordingStartTime = null;

    if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
    }

    if (clickProcess) {
        clickProcess.kill();
        clickProcess = null;
    }
    clickMetadataResolver = null;
    recordingMetaOverrides = {};

    console.log('[MetadataRecorder] Stopped. Captured events:', recordedMetadata.length);
    return [...recordedMetadata];
};
