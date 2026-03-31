import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { FEATURES } from "../config/features";
import { RadialMenu, RadialMenuTool } from "../components/RadialMenu";
import { RecordingSetup, RecordingConfig } from "../components/RecordingSetup";
import { useRecordingManager } from "../components/RecordingManager";
import type { AgentJob, AgentRecordingRequest, ShieldMode, ShieldState } from "../shared/agent";
import type {
    CaptureShortcutPreference,
    EntitlementState,
    OnboardingState,
    UpgradeSource,
} from "../shared/licensing";
import {
    Aperture,
    ArrowRight,
    Bot,
    Camera,
    Check,
    Crown,
    Film,
    Keyboard,
    LayoutList,
    Maximize,
    Monitor,
    MousePointerClick,
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

const DEFAULT_ENTITLEMENT_STATE: EntitlementState = {
    tier: "free",
    maxRecordingSeconds: 180,
    watermarkEnabled: true,
    canUseAutoPolish: false,
    canUseStudioVoice: false,
    purchaseAvailable: false,
    provider: "manual",
    lastSyncAt: null,
};

const DEFAULT_ONBOARDING_STATE: OnboardingState = {
    hasCompletedOnboarding: false,
    preferredCaptureShortcut: "trigger_line",
    printScreenOptIn: false,
    printScreenRegistrationStatus: "unknown",
    printScreenSupported: true,
    fallbackInstructions: [],
};

const ONBOARDING_STEPS = [
    {
        title: "SnipFocus Stays At The Top Edge",
        body: "When SnipFocus is idle, it shrinks into a tiny line at the top-center of the screen so it stays nearby without blocking your work.",
        eyebrow: "Step 1",
    },
    {
        title: "Hover The Trigger Line",
        body: "Move your mouse to that thin line to reopen the launcher. From there you can snip, capture a window, record your screen, or jump into the editor.",
        eyebrow: "Step 2",
    },
    {
        title: "Use The Center Button To Record",
        body: "The center action opens recording setup. Pick fullscreen or window mode, decide on camera and mic, then start.",
        eyebrow: "Step 3",
    },
    {
        title: "Press Esc To Stop And Edit",
        body: "Stopping a recording opens the editor so you can trim, style, and export right away. Free exports include a watermark; Pro removes it.",
        eyebrow: "Step 4",
    },
    {
        title: "Optional Print Screen Setup",
        body: "You can try to bind Print Screen to SnipFocus. If Windows already owns it, SnipFocus will tell you and show the fallback steps.",
        eyebrow: "Step 5",
    },
] as const;

const MenuApp: React.FC = () => {
    const [isRecordingSetupVisible, setIsRecordingSetupVisible] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const [shieldState, setShieldState] = useState<ShieldState>(DEFAULT_SHIELD_STATE);
    const [shieldToast, setShieldToast] = useState<string | null>(null);
    const [entitlementState, setEntitlementState] = useState<EntitlementState>(DEFAULT_ENTITLEMENT_STATE);
    const [onboardingState, setOnboardingState] = useState<OnboardingState>(DEFAULT_ONBOARDING_STATE);
    const [onboardingStateLoaded, setOnboardingStateLoaded] = useState(false);
    const [upgradeSource, setUpgradeSource] = useState<UpgradeSource | null>(null);
    const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null);
    const [onboardingStep, setOnboardingStep] = useState(0);

    const showTimedStatus = (message: string, upgradeIntent?: UpgradeSource | null) => {
        setStatusMessage(message);
        setUpgradeSource(upgradeIntent ?? null);
        window.setTimeout(() => {
            setStatusMessage((current) => (current === message ? null : current));
            if (upgradeIntent) {
                setUpgradeSource((current) => (current === upgradeIntent ? null : current));
            }
        }, 4500);
    };

    const showAgentToast = (message: string) => {
        setShieldToast(message);
        setTimeout(() => setShieldToast(null), 2500);
    };

    const { isRecording, handleStartRecording, handleStopRecording } = useRecordingManager({
        onMessage: (msg: string) => {
            console.log("[MenuApp] Recording message:", msg);
            showTimedStatus(msg);
        },
        onUpgradePrompt: (source, message) => {
            showTimedStatus(message, source);
        },
    });

    useEffect(() => {
        const cleanupStart = window.menuAPI.onStartRecordingRequested((config?: AgentRecordingRequest) => {
            if (!isRecording) handleStartRecording(config);
        });
        const cleanupStop = window.menuAPI.onStopRecordingRequested(() => {
            if (isRecording) handleStopRecording();
        });
        return () => {
            cleanupStart();
            cleanupStop();
        };
    }, [isRecording, handleStartRecording, handleStopRecording]);

    useEffect(() => {
        let cleanupState: (() => void) | undefined;
        let cleanupBlocked: (() => void) | undefined;
        let cleanupLicense: (() => void) | undefined;
        let cleanupOnboarding: (() => void) | undefined;

        window.menuAPI.shield.getState().then((state: ShieldState) => setShieldState(state)).catch(() => { });
        window.menuAPI.license.getState().then((state: EntitlementState) => setEntitlementState(state)).catch(() => { });
        window.menuAPI.settings.getOnboardingState()
            .then((state: OnboardingState) => setOnboardingState(state))
            .catch(() => { })
            .finally(() => setOnboardingStateLoaded(true));

        cleanupState = window.menuAPI.shield.onState((state: ShieldState) => setShieldState(state));
        cleanupBlocked = window.menuAPI.shield.onBlocked((data: { url: string; hostname?: string }) => {
            const host = data?.hostname || "external host";
            showAgentToast(`Agent stays local. External connection blocked (${host})`);
        });
        cleanupLicense = window.menuAPI.license.onChanged((state: EntitlementState) => {
            setEntitlementState(state);
            if (state.tier === "pro") {
                setUpgradeSource(null);
            }
        });
        cleanupOnboarding = window.menuAPI.settings.onChanged((state: OnboardingState) => {
            setOnboardingState(state);
            setOnboardingStateLoaded(true);
        });

        return () => {
            cleanupState?.();
            cleanupBlocked?.();
            cleanupLicense?.();
            cleanupOnboarding?.();
        };
    }, []);

    const purchasePro = async (source: UpgradeSource = "generic") => {
        if (!entitlementState.purchaseAvailable) {
            setPurchaseMessage("Purchasing is not available in this build yet.");
            return;
        }
        try {
            const result = await window.menuAPI.license.purchasePro(source);
            setEntitlementState(result.state);
            setPurchaseMessage(result.message);
            setUpgradeSource(result.success ? null : source);
            window.setTimeout(() => {
                setPurchaseMessage((current) => (current === result.message ? null : current));
            }, 4200);
        } catch (error) {
            setPurchaseMessage((error as Error).message);
        }
    };

    const applyCaptureShortcut = async (preference: CaptureShortcutPreference) => {
        try {
            const nextState = await window.menuAPI.settings.setCaptureShortcut(preference);
            setOnboardingState(nextState);
        } catch (error) {
            setPurchaseMessage((error as Error).message);
        }
    };

    const finishOnboarding = async () => {
        try {
            const nextState = await window.menuAPI.settings.completeOnboarding();
            setOnboardingState(nextState);
            setOnboardingStep(0);
            showTimedStatus("SnipFocus is ready. Hover the trigger line whenever you want it back.");
        } catch (error) {
            setPurchaseMessage((error as Error).message);
        }
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
        if (config.cameraEnabled) {
            window.menuAPI.toggleCamera(config.cameraShape, config.cameraSize, config.presenterNameEnabled ? config.presenterName : undefined, config.cameraBorderColor);
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
            showAgentToast(nextMode === "agent_local"
                ? "Agent enabled. It can make screenshots and screen recordings on this device."
                : "Agent disabled. Only human actions are allowed.");
        } catch (err) {
            console.error("[MenuApp] Failed to toggle shield mode", err);
        }
    };

    const shieldIsHuman = shieldState.mode === "human_local";
    const isFreeTier = entitlementState.tier === "free";
    const canPurchasePro = entitlementState.purchaseAvailable;
    const showOnboarding = onboardingStateLoaded && !onboardingState.hasCompletedOnboarding;
    const blockMenuInteraction = !onboardingStateLoaded || showOnboarding;
    const currentStep = ONBOARDING_STEPS[onboardingStep];

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
            action: () => toggleShieldMode(),
        });
    }

    const agentPanelStyle: React.CSSProperties = {
        position: "absolute",
        right: 24,
        bottom: 24,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: "20px",
        background: "linear-gradient(135deg, rgba(20, 25, 40, 0.85), rgba(10, 15, 30, 0.95))",
        backdropFilter: "blur(32px) saturate(200%)",
        border: "1px solid rgba(255, 255, 255, 0.1)",
        borderRadius: 24,
        boxShadow: "0 25px 60px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.15)",
        zIndex: 130,
        minWidth: 240,
        fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    };

    const agentButtonStyle: React.CSSProperties = {
        border: "1px solid rgba(255, 255, 255, 0.02)",
        background: "rgba(255, 255, 255, 0.02)",
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
        transition: "all 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
        fontFamily: "inherit",
    };

    const onboardingCardStyle: React.CSSProperties = {
        width: "100%",
        maxWidth: 420,
        padding: 20,
        borderRadius: 24,
        background: "rgba(10, 14, 24, 0.9)",
        border: "1px solid rgba(148,163,184,0.12)",
        boxShadow: "0 18px 48px rgba(2,6,23,0.34)",
        color: "#f8fafc",
        animation: "onboardingRise 0.32s cubic-bezier(0.16, 1, 0.3, 1)",
    };

    const onboardingInsetStyle: React.CSSProperties = {
        width: "100%",
        padding: "14px 15px",
        borderRadius: 16,
        background: "rgba(15,23,42,0.42)",
        border: "1px solid rgba(148,163,184,0.1)",
        color: "#dbeafe",
        lineHeight: 1.6,
        fontSize: 13,
    };

    const onboardingPrimaryButtonStyle: React.CSSProperties = {
        border: "1px solid rgba(125,211,252,0.22)",
        background: "rgba(125,211,252,0.12)",
        color: "#f8fafc",
        padding: "11px 16px",
        borderRadius: 999,
        fontWeight: 700,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 8,
    };

    const triggerLineIllustration = (
        <div style={{
            width: "100%",
            height: 58,
            borderRadius: 16,
            background: "rgba(15,23,42,0.42)",
            border: "1px solid rgba(148,163,184,0.12)",
            position: "relative",
            overflow: "hidden",
        }}>
            <div style={{
                position: "absolute",
                top: 14,
                left: "50%",
                transform: "translateX(-50%)",
                width: 68,
                height: 3,
                borderRadius: 999,
                background: "rgba(226,232,240,0.56)",
            }} />
            <div style={{
                position: "absolute",
                right: 14,
                bottom: 10,
                display: "flex",
                alignItems: "center",
                gap: 6,
                color: "#94a3b8",
                fontSize: 11,
            }}>
                <MousePointerClick size={12} />
                Hover here to reopen SnipFocus
            </div>
        </div>
    );

    const shortcutStatus = useMemo(() => {
        switch (onboardingState.printScreenRegistrationStatus) {
            case "registered":
                return { tone: "#22c55e", label: "Print Screen is connected to SnipFocus." };
            case "blocked":
                return { tone: "#f59e0b", label: "Windows or another app is still using Print Screen." };
            case "unsupported":
                return { tone: "#94a3b8", label: "Print Screen setup is only available on Windows." };
            case "disabled":
                return { tone: "#94a3b8", label: "SnipFocus will keep using the trigger line." };
            default:
                return { tone: "#94a3b8", label: "Choose whether you want to try Print Screen." };
        }
    }, [onboardingState.printScreenRegistrationStatus]);

    return (
        <div style={{
            width: "100%",
            height: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            overflow: "hidden",
            position: "relative",
            background: "radial-gradient(circle at 50% 0%, rgba(56, 189, 248, 0.16), transparent 42%), linear-gradient(180deg, rgba(8,10,18,0.96), rgba(7,11,22,0.98))",
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            WebkitFontSmoothing: "antialiased",
        }}>
            <style>
                {`
                    @keyframes fadeInUp {
                        from { opacity: 0; transform: translate(-50%, 15px); }
                        to { opacity: 1; transform: translate(-50%, 0); }
                    }
                    @keyframes fadeInDown {
                        from { opacity: 0; transform: translateY(-15px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @keyframes onboardingRise {
                        from { opacity: 0; transform: translateY(18px) scale(0.98); }
                        to { opacity: 1; transform: translateY(0) scale(1); }
                    }
                    .agent-btn:hover {
                        background: rgba(255, 255, 255, 0.08) !important;
                        border-color: rgba(255, 255, 255, 0.2) !important;
                        transform: translateY(-2px) scale(1.02);
                        box-shadow: 0 10px 20px rgba(0,0,0,0.2);
                    }
                    .agent-btn:active {
                        transform: translateY(0) scale(0.98);
                    }
                `}
            </style>

            {(statusMessage || purchaseMessage) && (
                <div style={{
                    position: "absolute",
                    top: 32,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 18px",
                    background: "rgba(10, 15, 30, 0.88)",
                    color: "white",
                    borderRadius: 100,
                    fontSize: 13,
                    fontWeight: 600,
                    letterSpacing: "0.2px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    backdropFilter: "blur(20px) saturate(150%)",
                    boxShadow: "0 10px 30px rgba(0,0,0,0.3)",
                    zIndex: 180,
                    animation: "fadeInDown 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                }}>
                    <span>{purchaseMessage || statusMessage}</span>
                    {upgradeSource && entitlementState.tier !== "pro" && canPurchasePro && (
                        <button
                            type="button"
                            onClick={() => void purchasePro(upgradeSource)}
                            style={{
                                border: "1px solid rgba(250,204,21,0.35)",
                                background: "rgba(250,204,21,0.12)",
                                color: "#fde68a",
                                padding: "8px 12px",
                                borderRadius: 999,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                            }}>
                            <Crown size={14} />
                            Upgrade to Pro
                        </button>
                    )}
                </div>
            )}

            {shieldToast && (
                <div style={{
                    position: "absolute",
                    bottom: "40px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    padding: "12px 24px",
                    background: "linear-gradient(135deg, rgba(20, 25, 40, 0.95), rgba(10, 15, 30, 0.98))",
                    color: "white",
                    borderRadius: "100px",
                    fontSize: 13,
                    fontWeight: 500,
                    letterSpacing: "0.2px",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
                    zIndex: 120,
                    minWidth: 280,
                    textAlign: "center",
                    backdropFilter: "blur(20px)",
                    animation: "fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
                }}>
                    {shieldToast}
                </div>
            )}

            <div style={{
                position: "absolute",
                top: 18,
                right: 20,
                display: "flex",
                alignItems: "center",
                gap: 10,
                zIndex: 140,
            }}>
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "10px 14px",
                    borderRadius: 999,
                    background: entitlementState.tier === "pro"
                        ? "rgba(34,197,94,0.14)"
                        : "rgba(251,191,36,0.12)",
                    border: entitlementState.tier === "pro"
                        ? "1px solid rgba(34,197,94,0.25)"
                        : "1px solid rgba(251,191,36,0.22)",
                    color: entitlementState.tier === "pro" ? "#bbf7d0" : "#fde68a",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                }}>
                    <Crown size={14} />
                    {entitlementState.tier === "pro" ? "Pro Active" : "Free Plan"}
                </div>
                {isFreeTier && canPurchasePro && (
                    <button
                        type="button"
                        onClick={() => void purchasePro("generic")}
                        style={{
                            border: "1px solid rgba(248,250,252,0.14)",
                            background: "rgba(255,255,255,0.05)",
                            color: "#f8fafc",
                            padding: "10px 14px",
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer",
                        }}>
                        Upgrade
                    </button>
                )}
            </div>

            {isFreeTier && (
                <div style={{
                    position: "absolute",
                    left: 24,
                    top: 20,
                    padding: "14px 16px",
                    maxWidth: 220,
                    borderRadius: 20,
                    background: "rgba(15, 23, 42, 0.78)",
                    border: "1px solid rgba(148,163,184,0.16)",
                    color: "#e2e8f0",
                    zIndex: 135,
                    boxShadow: "0 18px 40px rgba(2,6,23,0.3)",
                }}>
                    <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", color: "#fbbf24", marginBottom: 6 }}>
                        Free Tier
                    </div>
                    <div style={{ fontSize: 13, lineHeight: 1.5 }}>
                        3-minute recordings, watermark on export, Auto-Polish locked, Studio Voice locked.
                    </div>
                    {!canPurchasePro && (
                        <div style={{ fontSize: 12, lineHeight: 1.5, marginTop: 8, color: "#94a3b8" }}>
                            Pro unlock is not available in this build yet.
                        </div>
                    )}
                </div>
            )}

            <div style={{ filter: blockMenuInteraction ? "blur(6px) saturate(0.92)" : "none", transition: "filter 0.25s ease" }}>
                <RadialMenu
                    onHide={() => window.menuAPI.hideMenu()}
                    tools={tools}
                    centerAction={() => setIsRecordingSetupVisible(true)}
                    centerIcon={<Aperture size={18} strokeWidth={2} />}
                />
            </div>

            {blockMenuInteraction && (
                <div style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 220,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: 18,
                    background: "rgba(2, 6, 23, 0.2)",
                    backdropFilter: "blur(8px)",
                }}>
                    {!onboardingStateLoaded ? (
                        <div style={{
                            width: "100%",
                            maxWidth: 280,
                            padding: 20,
                            borderRadius: 20,
                            background: "rgba(10, 14, 24, 0.88)",
                            border: "1px solid rgba(148,163,184,0.12)",
                            boxShadow: "0 14px 36px rgba(2,6,23,0.28)",
                            color: "#f8fafc",
                            textAlign: "center",
                        }}>
                            <div style={{ fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#94a3b8", marginBottom: 8 }}>
                                Preparing
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
                                Loading SnipFocus
                            </div>
                            <div style={{ fontSize: 13, color: "#cbd5e1", lineHeight: 1.55 }}>
                                Setting up your launcher and onboarding flow.
                            </div>
                        </div>
                    ) : (
                    <div style={onboardingCardStyle}>
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 14,
                        }}>
                            <div>
                                <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.16em", color: "#94a3b8" }}>
                                    {currentStep.eyebrow}
                                </div>
                                <h2 style={{ margin: "6px 0 0", fontSize: 21, lineHeight: 1.2, fontWeight: 700 }}>
                                    {currentStep.title}
                                </h2>
                            </div>
                            <div style={{ display: "flex", gap: 6 }}>
                                {ONBOARDING_STEPS.map((step, index) => (
                                    <div
                                        key={step.title}
                                        style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: 999,
                                            background: index === onboardingStep ? "rgba(125,211,252,0.8)" : "rgba(148,163,184,0.18)",
                                        }}
                                    />
                                ))}
                            </div>
                        </div>

                        <p style={{ margin: 0, color: "#cbd5e1", fontSize: 13, lineHeight: 1.6 }}>
                            {currentStep.body}
                        </p>

                        <div style={{ marginTop: 16 }}>
                            {onboardingStep === 0 && triggerLineIllustration}

                            {onboardingStep > 0 && onboardingStep < 4 && (
                                <div style={onboardingInsetStyle}>
                                    {onboardingStep === 1 && "The trigger line is always there even when the menu is hidden. Hover it, and the launcher returns at the top of the screen."}
                                    {onboardingStep === 2 && "The center button opens the recording flow. Screen and Window are around it, and Media opens the editor for anything you've already captured."}
                                    {onboardingStep === 3 && "Esc stops the active recording. The clip then opens in the editor so you can trim, style, and export without hunting for files."}
                                </div>
                            )}

                            {onboardingStep === 4 && (
                                <div style={{ display: "grid", gap: 14 }}>
                                    <div style={{
                                        ...onboardingInsetStyle,
                                        padding: 14,
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                                            <Keyboard size={16} color="#7dd3fc" />
                                            <span style={{ fontSize: 13, fontWeight: 700 }}>Current quick-launch option</span>
                                        </div>
                                        <div style={{ color: "#cbd5e1", fontSize: 13, lineHeight: 1.55 }}>
                                            {shortcutStatus.label}
                                        </div>
                                    </div>

                                    <div style={{ display: "flex", gap: 10 }}>
                                        <button
                                            type="button"
                                            onClick={() => void applyCaptureShortcut("trigger_line")}
                                            style={{
                                                flex: onboardingState.printScreenSupported ? 1 : undefined,
                                                width: onboardingState.printScreenSupported ? undefined : "100%",
                                                padding: "11px 14px",
                                                borderRadius: 14,
                                                border: onboardingState.preferredCaptureShortcut === "trigger_line"
                                                    ? "1px solid rgba(125,211,252,0.24)"
                                                    : "1px solid rgba(148,163,184,0.12)",
                                                background: onboardingState.preferredCaptureShortcut === "trigger_line"
                                                    ? "rgba(125,211,252,0.1)"
                                                    : "rgba(15,23,42,0.52)",
                                                color: "#e2e8f0",
                                                fontWeight: 700,
                                                cursor: "pointer",
                                            }}>
                                            Keep Trigger Line
                                        </button>
                                        {onboardingState.printScreenSupported && (
                                            <button
                                                type="button"
                                                onClick={() => void applyCaptureShortcut("print_screen")}
                                                style={{
                                                    flex: 1,
                                                    padding: "11px 14px",
                                                    borderRadius: 14,
                                                    border: "1px solid rgba(148,163,184,0.12)",
                                                    background: "rgba(15,23,42,0.52)",
                                                    color: "#e2e8f0",
                                                    fontWeight: 700,
                                                    cursor: "pointer",
                                                }}>
                                                Try Print Screen
                                            </button>
                                        )}
                                    </div>

                                    {(onboardingState.printScreenRegistrationStatus === "blocked" || onboardingState.printScreenRegistrationStatus === "unsupported") && (
                                        <div style={{
                                            ...onboardingInsetStyle,
                                            padding: 14,
                                        }}>
                                            <div style={{ color: shortcutStatus.tone, fontWeight: 700, marginBottom: 8 }}>
                                                {onboardingState.printScreenRegistrationStatus === "blocked"
                                                    ? "Print Screen still needs one Windows change"
                                                    : "Print Screen setup is only available on Windows"}
                                            </div>
                                            {onboardingState.printScreenRegistrationStatus === "unsupported" && (
                                                <div style={{ color: "#e2e8f0", fontSize: 13, lineHeight: 1.6, marginBottom: 8 }}>
                                                    Keep using the trigger line to reopen SnipFocus on this device.
                                                </div>
                                            )}
                                            <div style={{ display: "grid", gap: 6, color: "#e2e8f0", fontSize: 13, lineHeight: 1.6 }}>
                                                {onboardingState.fallbackInstructions.map((item) => (
                                                    <div key={item} style={{ display: "flex", gap: 8 }}>
                                                        <span style={{ color: "#7dd3fc" }}>•</span>
                                                        <span>{item}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                        <div style={{
                            marginTop: 18,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}>
                            <button
                                type="button"
                                onClick={() => setOnboardingStep((step) => Math.max(0, step - 1))}
                                disabled={onboardingStep === 0}
                                style={{
                                    border: "none",
                                    background: "transparent",
                                    color: onboardingStep === 0 ? "rgba(148,163,184,0.45)" : "#94a3b8",
                                    fontWeight: 600,
                                    cursor: onboardingStep === 0 ? "not-allowed" : "pointer",
                                }}>
                                Back
                            </button>

                            {onboardingStep === ONBOARDING_STEPS.length - 1 ? (
                                <button
                                    type="button"
                                    onClick={() => void finishOnboarding()}
                                    style={onboardingPrimaryButtonStyle}>
                                    Finish Setup
                                    <Check size={16} />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setOnboardingStep((step) => Math.min(ONBOARDING_STEPS.length - 1, step + 1))}
                                    style={onboardingPrimaryButtonStyle}>
                                    Next
                                    <ArrowRight size={16} />
                                </button>
                            )}
                        </div>
                    </div>
                    )}
                </div>
            )}

            {FEATURES.ENABLE_AGENT_SURFACES && !shieldIsHuman && (
                <div style={agentPanelStyle}>
                    <div style={{
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
                        opacity: 0.9,
                        textShadow: "0 2px 10px rgba(251, 191, 36, 0.3)",
                    }}>
                        <Bot size={14} />
                        Agent Mode
                    </div>
                    <button type="button" className="agent-btn" style={agentButtonStyle} onClick={() => runAgentJob({ type: "capture_screenshot", mode: "fullscreen" })}>
                        <Camera size={14} strokeWidth={2} opacity={0.7} />
                        Capture Screenshot
                    </button>
                    <button
                        type="button"
                        className="agent-btn"
                        style={agentButtonStyle}
                        onClick={() => runAgentJob({
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
                    <button type="button" className="agent-btn" style={{ ...agentButtonStyle, color: "#f87171" }} onClick={() => runAgentJob({ type: "stop_recording" })}>
                        <Square size={14} fill="currentColor" opacity={0.7} />
                        Stop Recording
                    </button>
                    <div style={{ width: "100%", height: "1px", background: "rgba(255,255,255,0.06)", margin: "4px 0" }} />
                    <button type="button" className="agent-btn" style={agentButtonStyle} onClick={() => runAgentJob({ type: "polish_recording" })}>
                        <Sparkles size={14} strokeWidth={2} color="#fbbf24" />
                        Polish Recording
                    </button>
                    <button
                        type="button"
                        className="agent-btn"
                        style={agentButtonStyle}
                        onClick={() => runAgentJob({
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
                onClose={() => setIsRecordingSetupVisible(false)}
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
