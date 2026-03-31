import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { FEATURES } from "../config/features";
import { RadialMenu, RadialMenuTool } from "../components/RadialMenu";
import { RecordingSetup, RecordingConfig } from "../components/RecordingSetup";
import { useRecordingManager } from "../components/RecordingManager";
import type { AgentJob, AgentRecordingRequest, ShieldMode, ShieldState } from "../shared/agent";
import {
    Aperture,
    Bot,
    Camera,
    Film,
    LayoutList,
    Maximize,
    Monitor,
    Play,
    Scissors,
    Sparkles,
    Square,
} from "lucide-react";

const DEFAULT_SHIELD_STATE: ShieldState = {
    mode: "human_local",
    localOnly: true,
    agentEnabled: false,
    networkFilterEnabled: true,
};

const MENU_SLEEP_RADIUS_X = 210;
const MENU_SLEEP_RADIUS_Y = 182;
const MENU_WAKE_CORRIDOR_HALF_WIDTH = 78;
const MENU_WAKE_CORRIDOR_BOTTOM_OFFSET = 36;
const AGENT_PANEL_WAKE_WIDTH = 340;
const AGENT_PANEL_WAKE_HEIGHT = 380;

type MenuPointerPosition = {
    screenX: number;
    screenY: number;
    localX: number;
    localY: number;
};

const MenuApp: React.FC = () => {
    const [isRecordingSetupVisible, setIsRecordingSetupVisible] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [shieldState, setShieldState] = useState<ShieldState>(DEFAULT_SHIELD_STATE);
    const [shieldToast, setShieldToast] = useState<string | null>(null);
    const sleepRequestedRef = useRef(false);

    const showTimedStatus = (message: string, durationMs = 3200) => {
        setStatusMessage(message);
        window.setTimeout(() => {
            setStatusMessage((current) => (current === message ? null : current));
        }, durationMs);
    };

    const showAgentToast = (message: string) => {
        setShieldToast(message);
        window.setTimeout(() => {
            setShieldToast((current) => (current === message ? null : current));
        }, 2500);
    };

    const { isRecording, handleStartRecording, handleStopRecording } = useRecordingManager({
        onMessage: (message: string) => {
            console.log("[MenuApp] Recording message:", message);
            showTimedStatus(message);
        },
        onUpgradePrompt: (_source, message) => {
            showTimedStatus(message, 4000);
        },
    });

    useEffect(() => {
        const cleanupStart = window.menuAPI.onStartRecordingRequested((config?: AgentRecordingRequest) => {
            if (!isRecording) {
                handleStartRecording(config);
            }
        });
        const cleanupStop = window.menuAPI.onStopRecordingRequested(() => {
            if (isRecording) {
                handleStopRecording();
            }
        });

        return () => {
            cleanupStart();
            cleanupStop();
        };
    }, [handleStartRecording, handleStopRecording, isRecording]);

    useEffect(() => {
        const cleanupState = window.menuAPI.shield.onState((state: ShieldState) => setShieldState(state));
        const cleanupBlocked = window.menuAPI.shield.onBlocked((data: { url: string; hostname?: string }) => {
            const host = data?.hostname || "external host";
            showAgentToast(`Agent stays local. External connection blocked (${host})`);
        });

        window.menuAPI.shield.getState().then((state: ShieldState) => {
            setShieldState(state);
        }).catch(() => { });

        return () => {
            cleanupState();
            cleanupBlocked();
        };
    }, []);

    useEffect(() => {
        const cleanupMouseMoved = window.menuAPI.onMouseMoved((point: MenuPointerPosition) => {
            if (isRecordingSetupVisible || isRecording) {
                sleepRequestedRef.current = false;
                return;
            }

            const menuCenterX = window.innerWidth / 2;
            const menuCenterY = window.innerHeight / 2;
            const dx = point.localX - menuCenterX;
            const dy = point.localY - menuCenterY;
            const withinWakeCorridor = Math.abs(dx) <= MENU_WAKE_CORRIDOR_HALF_WIDTH
                && point.localY <= menuCenterY + MENU_WAKE_CORRIDOR_BOTTOM_OFFSET;
            const withinMenuHalo = ((dx * dx) / (MENU_SLEEP_RADIUS_X * MENU_SLEEP_RADIUS_X))
                + ((dy * dy) / (MENU_SLEEP_RADIUS_Y * MENU_SLEEP_RADIUS_Y)) <= 1;
            const withinAgentPanelZone = FEATURES.ENABLE_AGENT_SURFACES
                && shieldState.mode === "agent_local"
                && point.localX >= window.innerWidth - AGENT_PANEL_WAKE_WIDTH
                && point.localY >= window.innerHeight - AGENT_PANEL_WAKE_HEIGHT;

            if (withinWakeCorridor || withinMenuHalo || withinAgentPanelZone) {
                sleepRequestedRef.current = false;
                return;
            }

            if (sleepRequestedRef.current) {
                return;
            }

            sleepRequestedRef.current = true;
            window.menuAPI.hideMenu();
        });

        return () => {
            cleanupMouseMoved();
        };
    }, [isRecording, isRecordingSetupVisible, shieldState.mode]);

    const runAgentJob = async (job: AgentJob) => {
        try {
            const result = await window.menuAPI.agent.runJob(job);
            showAgentToast(result.success ? (result.message || "Agent action complete.") : (result.error || "Agent action failed."));
        } catch (error) {
            showAgentToast((error as Error).message);
        }
    };

    const handleStartRecordingWithConfig = (config: RecordingConfig) => {
        if (config.cameraEnabled) {
            window.menuAPI.toggleCamera(
                config.cameraShape,
                config.cameraSize,
                config.presenterNameEnabled ? config.presenterName : undefined,
                config.cameraBorderColor,
            );
        }

        if (config.teleprompterEnabled && config.teleprompterText) {
            window.menuAPI.showTeleprompter(config.teleprompterText, config.teleprompterSpeed);
        }

        window.menuAPI.setEditAfterRecording(config.editAfterRecording);

        handleStartRecording({
            liveMagnifierEnabled: config.liveMagnifierEnabled,
            captureCursorData: config.captureCursorData,
            recordingMode: config.recordingMode,
            windowBackground: config.windowBackground,
            windowId: config.windowId,
            cameraEnabled: config.cameraEnabled,
            cameraShape: config.cameraShape,
            cameraSize: config.cameraSize,
            cameraBorderColor: config.cameraBorderColor,
            editAfterRecording: config.editAfterRecording,
        });

        setIsRecordingSetupVisible(false);
    };

    const handleOpenMediaEditor = () => {
        window.menuAPI.openMediaEditor();
        window.menuAPI.hideMenu();
    };

    const toggleShieldMode = async () => {
        const nextMode: ShieldMode = shieldState.mode === "human_local" ? "agent_local" : "human_local";

        try {
            const nextState = await window.menuAPI.shield.setMode(nextMode);
            setShieldState(nextState);
            showAgentToast(
                nextMode === "agent_local"
                    ? "Agent enabled. It can make screenshots and screen recordings on this device."
                    : "Agent disabled. Only human actions are allowed.",
            );
        } catch (error) {
            console.error("[MenuApp] Failed to toggle shield mode", error);
        }
    };

    const shieldIsHuman = shieldState.mode === "human_local";

    const tools: RadialMenuTool[] = [
        {
            id: "fullscreen",
            name: "Screen",
            icon: <Maximize size={18} strokeWidth={2} />,
            color: "blue",
            action: () => window.menuAPI.triggerFullscreen(),
        },
        {
            id: "window",
            name: "Window",
            icon: <Monitor size={18} strokeWidth={2} />,
            color: "blue",
            action: () => window.menuAPI.triggerWindow(),
        },
        {
            id: "snip",
            name: "Snip",
            icon: <Scissors size={18} strokeWidth={2} />,
            color: "blue",
            action: () => window.menuAPI.triggerSnip(),
        },
        {
            id: "media",
            name: "Media",
            icon: <Film size={18} strokeWidth={2} />,
            color: "green",
            action: handleOpenMediaEditor,
        },
    ];

    if (FEATURES.ENABLE_AGENT_SURFACES) {
        tools.push({
            id: "agent-mode",
            name: "Agent",
            icon: <Bot size={18} strokeWidth={2} color={shieldIsHuman ? "#34d399" : "#f59e0b"} />,
            color: shieldIsHuman ? "green" : "orange",
            action: () => void toggleShieldMode(),
        });
    }

    const agentPanelStyle: React.CSSProperties = {
        position: "absolute",
        right: 24,
        bottom: 24,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 20,
        background: "linear-gradient(135deg, rgba(20, 25, 40, 0.9), rgba(10, 15, 30, 0.96))",
        backdropFilter: "blur(28px) saturate(180%)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        borderRadius: 24,
        boxShadow: "0 25px 60px rgba(0, 0, 0, 0.45)",
        zIndex: 130,
        minWidth: 240,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    };

    const agentButtonStyle: React.CSSProperties = {
        border: "1px solid rgba(255, 255, 255, 0.02)",
        background: "rgba(255, 255, 255, 0.03)",
        color: "#ffffff",
        borderRadius: 14,
        padding: "12px 16px",
        fontSize: 13,
        fontWeight: 500,
        cursor: "pointer",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: 12,
        transition: "all 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
        fontFamily: "inherit",
    };

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                overflow: "hidden",
                position: "relative",
                background: "transparent",
                fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                WebkitFontSmoothing: "antialiased",
            }}
        >
            <style>
                {`
                    @keyframes fadeInUp {
                        from { opacity: 0; transform: translate(-50%, 12px); }
                        to { opacity: 1; transform: translate(-50%, 0); }
                    }
                    @keyframes fadeInDown {
                        from { opacity: 0; transform: translate(-50%, -12px); }
                        to { opacity: 1; transform: translate(-50%, 0); }
                    }
                    .agent-btn:hover {
                        background: rgba(255, 255, 255, 0.08) !important;
                        border-color: rgba(255, 255, 255, 0.18) !important;
                        transform: translateY(-2px);
                    }
                    .agent-btn:active {
                        transform: translateY(0);
                    }
                `}
            </style>

            {statusMessage && (
                <div
                    style={{
                        position: "absolute",
                        top: 26,
                        left: "50%",
                        transform: "translateX(-50%)",
                        color: "rgba(241, 245, 249, 0.92)",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        textShadow: "0 6px 18px rgba(0, 0, 0, 0.6)",
                        zIndex: 180,
                        animation: "fadeInDown 0.28s ease",
                        pointerEvents: "none",
                    }}
                >
                    {statusMessage}
                </div>
            )}

            {shieldToast && (
                <div
                    style={{
                        position: "absolute",
                        bottom: 36,
                        left: "50%",
                        transform: "translateX(-50%)",
                        color: "rgba(226, 232, 240, 0.92)",
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.04em",
                        textShadow: "0 6px 18px rgba(0, 0, 0, 0.65)",
                        zIndex: 120,
                        animation: "fadeInUp 0.28s ease",
                        pointerEvents: "none",
                    }}
                >
                    {shieldToast}
                </div>
            )}

            <RadialMenu
                onHide={() => window.menuAPI.hideMenu()}
                tools={tools}
                centerAction={() => {
                    sleepRequestedRef.current = false;
                    setIsRecordingSetupVisible(true);
                }}
                centerIcon={<Aperture size={18} strokeWidth={2} />}
            />

            {FEATURES.ENABLE_AGENT_SURFACES && !shieldIsHuman && (
                <div style={agentPanelStyle}>
                    <div
                        style={{
                            fontSize: 11,
                            fontWeight: 700,
                            letterSpacing: "0.15em",
                            textTransform: "uppercase",
                            color: "#fbbf24",
                            marginBottom: 6,
                            marginTop: 2,
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            opacity: 0.92,
                        }}
                    >
                        <Bot size={14} />
                        Agent Mode
                    </div>
                    <button type="button" className="agent-btn" style={agentButtonStyle} onClick={() => void runAgentJob({ type: "capture_screenshot", mode: "fullscreen" })}>
                        <Camera size={14} strokeWidth={2} opacity={0.7} />
                        Capture Screenshot
                    </button>
                    <button
                        type="button"
                        className="agent-btn"
                        style={agentButtonStyle}
                        onClick={() => void runAgentJob({
                            type: "start_recording",
                            config: {
                                recordingMode: "fullscreen",
                                cameraEnabled: false,
                                micEnabled: false,
                                captureCursorData: true,
                                editAfterRecording: true,
                            },
                        })}
                    >
                        <Play size={14} fill="currentColor" opacity={0.7} />
                        Start Recording
                    </button>
                    <button type="button" className="agent-btn" style={{ ...agentButtonStyle, color: "#f87171" }} onClick={() => void runAgentJob({ type: "stop_recording" })}>
                        <Square size={14} fill="currentColor" opacity={0.7} />
                        Stop Recording
                    </button>
                    <div style={{ width: "100%", height: "1px", background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
                    <button type="button" className="agent-btn" style={agentButtonStyle} onClick={() => void runAgentJob({ type: "polish_recording" })}>
                        <Sparkles size={14} strokeWidth={2} color="#fbbf24" />
                        Polish Recording
                    </button>
                    <button
                        type="button"
                        className="agent-btn"
                        style={agentButtonStyle}
                        onClick={() => void runAgentJob({
                            type: "create_summary_clip",
                            title: "Latest Recording Summary",
                            bullets: [
                                "Captured locally with Agent mode",
                                "Ready for polish and review",
                                "Prepared for export in SnipFocus",
                            ],
                            style: "studio_clean",
                        })}
                    >
                        <LayoutList size={14} strokeWidth={2} opacity={0.7} />
                        Summary Latest
                    </button>
                </div>
            )}

            <RecordingSetup
                isVisible={isRecordingSetupVisible}
                onClose={() => {
                    sleepRequestedRef.current = false;
                    setIsRecordingSetupVisible(false);
                }}
                onStartRecording={handleStartRecordingWithConfig}
            />
        </div>
    );
};

const rootElement = document.getElementById("root");
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <React.StrictMode>
            <MenuApp />
        </React.StrictMode>,
    );
}
