import type { SmartTrackingProfile } from '../videoEditor/types';

export type ShieldMode = 'human_local' | 'agent_local';

export interface ShieldState {
    mode: ShieldMode;
    localOnly: true;
    agentEnabled: boolean;
    networkFilterEnabled: boolean;
}

export type AgentSummaryStyle = 'studio_clean' | 'focus_demo';
export type AgentScreenshotMode = 'fullscreen' | 'window';
export type AgentRecordingMode = 'fullscreen' | 'window';

export interface AgentSummaryPayload {
    title: string;
    bullets: string[];
    style: AgentSummaryStyle;
}

export interface AgentRecordingRequest {
    recordingMode?: AgentRecordingMode;
    windowId?: string;
    cameraEnabled?: boolean;
    micEnabled?: boolean;
    captureCursorData?: boolean;
    liveMagnifierEnabled?: boolean;
    cameraShape?: 'circle' | 'rounded' | 'pill' | 'square';
    cameraSize?: number;
    cameraBorderColor?: string;
    presenterNameEnabled?: boolean;
    presenterName?: string;
    windowBackground?: string;
    editAfterRecording?: boolean;
}

export type AgentJob =
    | {
        type: 'open_editor';
        sourceVideo?: string;
        name?: string;
    }
    | {
        type: 'polish_recording';
        sourceVideo?: string;
        name?: string;
        trackingProfile?: SmartTrackingProfile;
    }
    | {
        type: 'create_summary_clip';
        sourceVideo?: string;
        name?: string;
        title: string;
        bullets: string[];
        style?: AgentSummaryStyle;
    }
    | {
        type: 'capture_screenshot';
        mode?: AgentScreenshotMode;
        windowId?: string;
    }
    | {
        type: 'start_recording';
        name?: string;
        config?: AgentRecordingRequest;
    }
    | {
        type: 'stop_recording';
    };

export interface AgentJobResult {
    success: boolean;
    message?: string;
    error?: string;
    data?: Record<string, unknown>;
}
