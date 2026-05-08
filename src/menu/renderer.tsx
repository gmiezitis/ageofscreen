import React, { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom/client";
import { FEATURES } from "../config/features";
import { RadialMenu, RadialMenuTool } from "../components/RadialMenu";
import { RecordingSetup, RecordingConfig } from "../components/RecordingSetup";
import { useRecordingManager } from "../components/RecordingManager";
import type { AgentJob, AgentRecordingRequest, ShieldMode, ShieldState } from "../shared/agent";
import type { OnboardingState } from "../shared/licensing";
import { getMenuSleepSuppressedUntil, isMenuSleepSuppressed } from "./menuLifecycle";
import {
    Bot,
    Camera,
    Film,
    Gamepad2,
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

const DEFAULT_ONBOARDING_STATE: OnboardingState = {
    hasCompletedOnboarding: false,
    preferredCaptureShortcut: "print_screen",
};

const SCREEN_PLAYGROUND_UNLOCK_KEY = "ageofscreen-screen-playground-unlocked";
const MENU_WAKE_ZONE_WIDTH = 380;
const MENU_WAKE_ZONE_HEIGHT = 380;
const MENU_WAKE_ZONE_OFFSET_Y = -12;
const TRIGGER_WAKE_CORRIDOR_HALF_WIDTH = 28;
const TRIGGER_WAKE_CORRIDOR_BOTTOM_OFFSET = 28;

const pointInsideRect = (x: number, y: number, rect: DOMRect | null): boolean => (
    !!rect
    && x >= rect.left
    && x <= rect.right
    && y >= rect.top
    && y <= rect.bottom
);

const MenuApp: React.FC = () => {
    const [isRecordingSetupVisible, setIsRecordingSetupVisible] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [shieldState, setShieldState] = useState<ShieldState>(DEFAULT_SHIELD_STATE);
    const [shieldToast, setShieldToast] = useState<string | null>(null);
    const [onboardingState, setOnboardingState] = useState<OnboardingState>(DEFAULT_ONBOARDING_STATE);
    const [screenPlaygroundUnlocked, setScreenPlaygroundUnlocked] = useState(() => localStorage.getItem(SCREEN_PLAYGROUND_UNLOCK_KEY) === "1");
    const sleepRequestedRef = useRef(false);
    const sleepSuppressedUntilRef = useRef(0);
    const menuWakeZoneRef = useRef<HTMLDivElement | null>(null);
    const agentPanelRef = useRef<HTMLDivElement | null>(null);

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
                return;
            }

            showTimedStatus("A recording is already in progress. Stop it before starting another one.");
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
        const cleanupOnboarding = window.menuAPI.settings.onChanged((state: OnboardingState) => {
            setOnboardingState(state);
        });

        window.menuAPI.settings.getOnboardingState()
            .then((state: OnboardingState) => setOnboardingState(state))
            .catch(() => { });

        return cleanupOnboarding;
    }, []);

    useEffect(() => {
        const applyMenuOpenPayload = (payload: { reason: "manual"; openedAt: number }) => {
            sleepRequestedRef.current = false;
            sleepSuppressedUntilRef.current = Math.max(
                sleepSuppressedUntilRef.current,
                getMenuSleepSuppressedUntil(payload),
            );
        };

        const cleanupMenuOpened = window.menuAPI.onMenuOpened(applyMenuOpenPayload);
        const pendingPayload = window.menuAPI.consumeMenuOpened();
        if (pendingPayload) {
            applyMenuOpenPayload(pendingPayload);
        }

        return cleanupMenuOpened;
    }, []);

    useEffect(() => {
        sleepRequestedRef.current = false;
    }, [isRecording, isRecordingSetupVisible, shieldState.mode]);

    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (!FEATURES.ENABLE_SCREEN_PLAYGROUND) return;
            if (!event.ctrlKey || !event.shiftKey || event.key.toLowerCase() !== "p") return;
            event.preventDefault();
            setScreenPlaygroundUnlocked((current) => {
                const next = !current;
                localStorage.setItem(SCREEN_PLAYGROUND_UNLOCK_KEY, next ? "1" : "0");
                showTimedStatus(next ? "Labs unlocked: Screen Playground is available." : "Screen Playground hidden.");
                return next;
            });
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, []);

    const requestSleep = () => {
        if (
            isRecordingSetupVisible
            || isRecording
            || sleepRequestedRef.current
            || isMenuSleepSuppressed(sleepSuppressedUntilRef.current)
        ) {
            return;
        }

        sleepRequestedRef.current = true;
        window.menuAPI.hideMenu();
    };

    const clearSleepRequest = () => {
        sleepRequestedRef.current = false;
    };

    const clearSleepSuppression = () => {
        sleepSuppressedUntilRef.current = 0;
    };

    const handleRootMouseEnter = () => {
        clearSleepRequest();
    };

    const handleInteractiveMouseEnter = () => {
        clearSleepRequest();
        clearSleepSuppression();
    };

    const handleRootMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (isRecordingSetupVisible || isRecording) {
            clearSleepRequest();
            return;
        }

        const rootRect = event.currentTarget.getBoundingClientRect();
        const rootCenterX = rootRect.left + (rootRect.width / 2);
        const menuRect = menuWakeZoneRef.current?.getBoundingClientRect() ?? null;
        const withinMenu = pointInsideRect(
            event.clientX,
            event.clientY,
            menuRect,
        );
        const withinAgentPanel = pointInsideRect(
            event.clientX,
            event.clientY,
            agentPanelRef.current?.getBoundingClientRect() ?? null,
        );
        const withinTriggerCorridor = Math.abs(event.clientX - rootCenterX) <= TRIGGER_WAKE_CORRIDOR_HALF_WIDTH
            && event.clientY <= ((menuRect?.top ?? rootRect.top) + TRIGGER_WAKE_CORRIDOR_BOTTOM_OFFSET);

        if (withinMenu || withinAgentPanel) {
            clearSleepRequest();
            clearSleepSuppression();
            return;
        }

        if (withinTriggerCorridor) {
            clearSleepRequest();
            return;
        }

        requestSleep();
    };

    const runAgentJob = async (job: AgentJob) => {
        try {
            const result = await window.menuAPI.agent.runJob(job);
            showAgentToast(result.success ? (result.message || "Agent action complete.") : (result.error || "Agent action failed."));
        } catch (error) {
            showAgentToast((error as Error).message);
        }
    };

    const handleStartRecordingWithConfig = (config: RecordingConfig) => {
        if (isRecording) {
            showTimedStatus("A recording is already in progress. Stop it before starting another one.");
            return;
        }

        if (config.cameraEnabled) {
            window.menuAPI.toggleCamera(
                config.cameraShape,
                config.cameraSize,
                config.presenterNameEnabled ? config.presenterName : undefined,
                config.cameraBorderColor,
                config.cameraBorderWidth,
                config.cameraGlowEnabled,
                config.cameraAudioMeterEnabled,
            );
        }

        if (config.teleprompterEnabled && config.teleprompterText) {
            window.menuAPI.showTeleprompter(config.teleprompterText, config.teleprompterSpeed);
        }

        window.menuAPI.setEditAfterRecording(config.editAfterRecording);

        handleStartRecording({
            liveMagnifierEnabled: config.liveMagnifierEnabled,
            captureCursorData: config.captureCursorData,
            micEnabled: config.micEnabled,
            recordingMode: config.recordingMode,
            windowBackground: config.windowBackground,
            windowId: config.windowId,
            cameraEnabled: config.cameraEnabled,
            cameraShape: config.cameraShape,
            cameraSize: config.cameraSize,
            cameraBorderColor: config.cameraBorderColor,
            cameraBorderWidth: config.cameraBorderWidth,
            cameraGlowEnabled: config.cameraGlowEnabled,
            cameraAudioMeterEnabled: config.cameraAudioMeterEnabled,
            presenterName: config.presenterNameEnabled ? config.presenterName : undefined,
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

    const completeShortcutTip = async () => {
        try {
            await window.menuAPI.settings.completeOnboarding();
        } catch (error) {
            console.warn("[MenuApp] Failed to complete onboarding", error);
        }
    };

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

    if (FEATURES.ENABLE_SCREEN_PLAYGROUND && screenPlaygroundUnlocked) {
        tools.push({
            id: "screen-playground",
            name: "Play",
            icon: <Gamepad2 size={18} strokeWidth={2} />,
            color: "orange",
            action: () => {
                window.menuAPI.openScreenPlayground();
                window.menuAPI.hideMenu();
            },
        });
    }

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
            onMouseMove={handleRootMouseMove}
            onMouseLeave={requestSleep}
            onMouseEnter={handleRootMouseEnter}
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

            <div
                ref={menuWakeZoneRef}
                style={{
                    width: MENU_WAKE_ZONE_WIDTH,
                    height: MENU_WAKE_ZONE_HEIGHT,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transform: `translateY(${MENU_WAKE_ZONE_OFFSET_Y}px)`,
                    position: "relative",
                }}
                onMouseEnter={handleInteractiveMouseEnter}
            >
                <RadialMenu
                    onHide={() => window.menuAPI.hideMenu()}
                    tools={tools}
                    centerAction={() => {
                        sleepRequestedRef.current = false;
                        setIsRecordingSetupVisible(true);
                    }}
                />
            </div>

            {FEATURES.ENABLE_AGENT_SURFACES && !shieldIsHuman && (
                <div ref={agentPanelRef} style={agentPanelStyle} onMouseEnter={handleInteractiveMouseEnter}>
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
                                "Prepared for export in ageofscreen",
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
                showShortcutTip={!onboardingState.hasCompletedOnboarding}
                onCompleteShortcutTip={() => void completeShortcutTip()}
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
    root.render(<MenuApp />);
}
