import React, { useEffect, useRef, useState } from "react";
import {
  Camera,
  Keyboard,
  Crop,
  ChevronDown,
  MousePointer2,
  PanelsTopLeft,
  Video,
  StopCircle,
  PenLine,
  ArrowUpRight,
  Minus,
  Square,
  Circle,
  Highlighter,
  Type,
  ListOrdered,
  Droplet,
  Paintbrush,
  Focus,
  Undo2,
  Redo2,
  Trash2,
  Save,
  X,
  ImagePlus,
  Hash,
  Plus,
  CircleSlash,
  Check,
  Smile,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
// Import shared types and styles
import type { Tool, PenSize, BlurMode, DraggableCSSProperties } from "../types";


// Props expected by the Toolbar component
interface ToolbarProps {
  // Capture handlers
  onFullscreenCapture: () => void; // Use specific names now
  onRegionCapture: () => void;
  onWindowCapture: () => void;
  // Recording state and handlers
  isRecording: boolean;
  onStartRecording: () => void;
  onStopRecording: () => void; // Add stop recording handler prop
  // Selected tool state and handler
  selectedTool: Tool;
  onToolSelect: (tool: Tool) => void;
  // Blur mode state and handler (if blur tool selected)
  selectedBlurMode: BlurMode; // Rename for consistency
  onBlurModeChange: (mode: BlurMode) => void;
  // Color state and handler (for pen, arrow, shapes, step)
  penColor: string;
  onPenColorChange: (color: string) => void;
  // --- REMOVE Highlighter Color Props (Assuming penColor is used) ---
  // highlighterColor: string;
  // onHighlighterColorChange: (color: string) => void;
  // --- Highlighter Color ---
  highlighterColor: string;
  onHighlighterColorChange: (color: string) => void;
  // --- Step Color ---
  stepColor: string;
  onStepColorChange: (color: string) => void;
  // Pen/Shape size state and handler
  selectedPenSize: PenSize;
  onPenSizeSelect: (size: PenSize) => void; // Rename for consistency
  // Text size state and handler
  hasSelectedTextAnnotation: boolean;
  textFontSize: number;
  textBoxWidth: number;
  textBoxWidthMax: number;
  onBeginTextAdjustment: () => void;
  onTextFontSizeChange: (fontSize: number) => void;
  onTextBoxWidthChange: (width: number) => void;
  // --- REMOVE sizePreviewStyle prop (calculate internally if needed) ---
  // sizePreviewStyle: React.CSSProperties;
  // Text color state and handler
  textColor: string;
  onTextColorChange: (color: string) => void;
  // Next step number for preview
  nextStepNumber?: number;
  // Action handlers
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onSave: () => void; // Rename from onSaveAs
  onImport: () => void;
  onAddImageOverlay: () => void;
  selectedHighlighterSize: PenSize; // <<< NEW
  onHighlighterSizeSelect: (size: PenSize) => void; // <<< NEW
  selectedStepSize: PenSize;
  onStepSizeSelect: (size: PenSize) => void;
  selectedStepSymbol?: string;
  onStepSymbolChange: (symbol: string | undefined) => void;
  selectedSymbolText: string;
  onSymbolTextChange: (symbol: string) => void;
  isFullscreen: boolean;
    onClear: () => void; // Added to accept the onClear prop from App.tsx
  // Add blur strength props
  blurStrength?: number; // Optional if only needed for some blur modes
  onBlurStrengthChange?: (strength: number) => void; // Optional
  // Dark mode support
  isDarkMode?: boolean;
  onMinimize: () => void;
  onMaximize: () => void;
  onClose: () => void;
  hasCropSelection: boolean;
  onApplyCrop: () => void;
  onCancelCrop: () => void;
}

const drawingTools: Array<{ id: Tool; Icon: LucideIcon; label: string }> = [
  { id: "move", Icon: MousePointer2, label: "Select & Move" },
  { id: "pen", Icon: PenLine, label: "Pen Tool" },
  { id: "arrow", Icon: ArrowUpRight, label: "Arrow Tool" },
  { id: "line", Icon: Minus, label: "Straight Line" },
  { id: "rectangle", Icon: Square, label: "Rectangle Tool" },
  { id: "ellipse", Icon: Circle, label: "Ellipse Tool" },
  { id: "highlighter", Icon: Highlighter, label: "Highlighter" },
  { id: "text", Icon: Type, label: "Text Tool" },
  { id: "step", Icon: ListOrdered, label: "Step Counter" },
  { id: "symbol", Icon: Smile, label: "Symbols" },
  { id: "blur", Icon: Droplet, label: "Blur Tool" },
];

const SYMBOLS = ["❤️", "🧑‍⚕️", "⭐", "✅", "❌", "🔥", "👍", "👎", "😊", "🎉", "💡", "⚠️", "📌", "✨", "🎈", "💉", "💊", "🏥", "🚑"];

const PHOTO_MENU_CLOSE_DELAY_MS = 280;
const premiumEase = "cubic-bezier(0.22, 1, 0.36, 1)";

const Toolbar: React.FC<ToolbarProps> = (props) => {
  const {
    // Destructure all props defined in the updated interface
    onFullscreenCapture,
    onRegionCapture,
    onWindowCapture,
    isRecording,
    onStartRecording,
    onStopRecording,
    selectedTool,
    onToolSelect,
    selectedBlurMode,
    onBlurModeChange,
    penColor,
    onPenColorChange,
    highlighterColor,
    onHighlighterColorChange,
    stepColor,
    onStepColorChange,
    selectedPenSize,
    onPenSizeSelect,
    hasSelectedTextAnnotation,
    textFontSize,
    textBoxWidth,
    textBoxWidthMax,
    onBeginTextAdjustment,
    onTextFontSizeChange,
    onTextBoxWidthChange,
    textColor,
    onTextColorChange,
    nextStepNumber,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onSave,
    onImport,
    onAddImageOverlay,
    selectedHighlighterSize,
    onHighlighterSizeSelect,
    selectedStepSize,
    onStepSizeSelect,
    selectedStepSymbol,
    onStepSymbolChange,
    selectedSymbolText,
    onSymbolTextChange,
    onClear,
    // Dark mode
    isDarkMode = false,
    onMinimize,
    onMaximize,
    onClose,
    hasCropSelection,
    onApplyCrop,
    onCancelCrop,
  } = props;

  const sharedIconProps = { size: 16, strokeWidth: 1.7 };
  const [isPhotoMenuOpen, setIsPhotoMenuOpen] = useState(false);
  const photoMenuRef = useRef<HTMLDivElement>(null);
  const photoMenuCloseTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (photoMenuCloseTimerRef.current !== null) {
        window.clearTimeout(photoMenuCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isPhotoMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!photoMenuRef.current?.contains(event.target as Node)) {
        setIsPhotoMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isPhotoMenuOpen]);

  const openPhotoMenu = () => {
    if (photoMenuCloseTimerRef.current !== null) {
      window.clearTimeout(photoMenuCloseTimerRef.current);
      photoMenuCloseTimerRef.current = null;
    }
    setIsPhotoMenuOpen(true);
  };

  const schedulePhotoMenuClose = () => {
    if (photoMenuCloseTimerRef.current !== null) {
      window.clearTimeout(photoMenuCloseTimerRef.current);
    }
    photoMenuCloseTimerRef.current = window.setTimeout(() => {
      setIsPhotoMenuOpen(false);
      photoMenuCloseTimerRef.current = null;
    }, PHOTO_MENU_CLOSE_DELAY_MS);
  };

  const closePhotoMenu = () => {
    if (photoMenuCloseTimerRef.current !== null) {
      window.clearTimeout(photoMenuCloseTimerRef.current);
      photoMenuCloseTimerRef.current = null;
    }
    setIsPhotoMenuOpen(false);
  };

  const runPhotoAction = (action: () => void) => {
    closePhotoMenu();
    action();
  };

  // Clean, simple toolbar - minimal and intuitive
  const toolbarStyle: DraggableCSSProperties = {
    display: "flex",
    gap: "6px",
    flexWrap: "nowrap",
    WebkitAppRegion: "no-drag",
    padding: "8px 14px",
    background: isDarkMode
      ? "linear-gradient(180deg, rgba(18, 21, 33, 0.96), rgba(12, 15, 24, 0.94))"
      : "linear-gradient(180deg, rgba(252, 253, 255, 0.98), rgba(244, 247, 250, 0.95))",
    borderBottom: isDarkMode ? "1px solid rgba(148, 163, 184, 0.16)" : "1px solid rgba(148, 163, 184, 0.24)",
    backdropFilter: "blur(18px)",
    alignItems: "center",
    position: "relative",
    zIndex: 120,
    overflow: "visible",
    fontFamily: '"Segoe UI Variable Text", Aptos, "SF Pro Text", "Segoe UI", Roboto, Arial, sans-serif',
    height: "44px",
    boxShadow: isDarkMode
      ? "0 14px 34px rgba(2, 6, 23, 0.18)"
      : "0 14px 30px rgba(15, 23, 42, 0.08)",
    transition: `background 240ms ${premiumEase}, border-color 240ms ${premiumEase}, box-shadow 240ms ${premiumEase}`,
  };

  // Clean, simple button styling
  const buttonStyle: DraggableCSSProperties = {
    WebkitAppRegion: "no-drag",
    margin: "0",
    padding: "4px 8px",
    fontSize: "11.5px",
    fontWeight: "600",
    border: isDarkMode ? "1px solid rgba(148, 163, 184, 0.16)" : "1px solid rgba(148, 163, 184, 0.24)",
    borderRadius: "8px",
    cursor: "pointer",
    background: isDarkMode
      ? "linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.04))"
      : "linear-gradient(180deg, #ffffff, #f8fafc)",
    color: isDarkMode ? "rgba(241, 245, 249, 0.92)" : "#1f2937",
    transition: `transform 180ms ${premiumEase}, background 180ms ${premiumEase}, border-color 180ms ${premiumEase}, box-shadow 180ms ${premiumEase}, color 180ms ${premiumEase}, filter 180ms ${premiumEase}`,
    userSelect: "none",
    height: "32px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
    minWidth: "30px",
    boxShadow: isDarkMode
      ? "inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 1px 2px rgba(2, 6, 23, 0.24)"
      : "inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 1px 2px rgba(15, 23, 42, 0.06)",
  };

  // Active button styling - simple selected state
  const buttonStyleActive: DraggableCSSProperties = {
    ...buttonStyle,
    background: isDarkMode
      ? "linear-gradient(180deg, rgba(59, 130, 246, 0.96), rgba(37, 99, 235, 0.88))"
      : "linear-gradient(180deg, #1d7bf2, #0b69d1)",
    border: isDarkMode ? "1px solid rgba(96, 165, 250, 0.7)" : "1px solid #0b69d1",
    color: "#fff",
    boxShadow: "0 10px 18px rgba(37, 99, 235, 0.24), inset 0 1px 0 rgba(255, 255, 255, 0.16)",
  };


  // Simple input styling
  const inputStyle: DraggableCSSProperties = {
    WebkitAppRegion: "no-drag",
    marginLeft: "2px",
    border: isDarkMode ? "1px solid rgba(148, 163, 184, 0.24)" : "1px solid rgba(148, 163, 184, 0.28)",
    borderRadius: "6px",
    padding: "2px",
    width: "20px",
    height: "20px",
    verticalAlign: "middle",
    background: isDarkMode ? "rgba(255, 255, 255, 0.08)" : "#fff",
    cursor: "pointer",
  };

  // Simple separator styling
  const separatorStyle: React.CSSProperties = {
    marginLeft: "3px",
    marginRight: "3px",
    width: "1px",
    height: "18px",
    background: isDarkMode ? "rgba(255, 255, 255, 0.15)" : "#d0d0d0",
    alignSelf: "center",
  };

  const photoMenuButtonStyle: DraggableCSSProperties = {
    ...buttonStyle,
    minWidth: "auto",
    padding: "4px 10px",
    gap: "6px",
    background: isPhotoMenuOpen
      ? (isDarkMode ? "rgba(59, 130, 246, 0.18)" : "rgba(0, 120, 212, 0.1)")
      : buttonStyle.background,
    border: isPhotoMenuOpen
      ? (isDarkMode ? "1px solid rgba(96, 165, 250, 0.55)" : "1px solid rgba(0, 120, 212, 0.4)")
      : buttonStyle.border,
    color: isPhotoMenuOpen
      ? (isDarkMode ? "#bfdbfe" : "#005a9e")
      : buttonStyle.color,
  };

  const photoMenuSurfaceStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% - 10px)",
    left: 0,
    minWidth: "190px",
    marginTop: "2px",
    padding: "8px",
    borderRadius: "14px",
    background: isDarkMode
      ? "linear-gradient(180deg, rgba(15, 23, 42, 0.97), rgba(15, 23, 42, 0.92))"
      : "linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(248, 250, 252, 0.98))",
    border: isDarkMode ? "1px solid rgba(148, 163, 184, 0.18)" : "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: isDarkMode
      ? "0 22px 48px rgba(2, 6, 23, 0.42)"
      : "0 18px 40px rgba(15, 23, 42, 0.14)",
    backdropFilter: "blur(22px)",
    zIndex: 2000,
  };

  const photoMenuItemStyle: DraggableCSSProperties = {
    ...buttonStyle,
    width: "100%",
    height: "34px",
    justifyContent: "flex-start",
    padding: "0 10px",
    border: "none",
    background: "transparent",
    borderRadius: "8px",
    gap: "8px",
    fontSize: "12px",
  };

  const isTextContext = selectedTool === "text" || hasSelectedTextAnnotation;
  const sliderLabelStyle: React.CSSProperties = {
    fontSize: "11px",
    fontWeight: 600,
    color: isDarkMode ? "rgba(226, 232, 240, 0.82)" : "#475569",
    whiteSpace: "nowrap",
    minWidth: "32px",
  };

  const sliderValueStyle: React.CSSProperties = {
    fontSize: "11px",
    fontVariantNumeric: "tabular-nums",
    color: isDarkMode ? "#f8fafc" : "#0f172a",
    minWidth: "42px",
  };



  return (
    <>
      {/* Classic CSS styles */}
      <style>
        {`
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.8; }
          }

          .toolbar-button {
            transition:
              transform 180ms ${premiumEase},
              box-shadow 180ms ${premiumEase},
              filter 180ms ${premiumEase};
          }

          .toolbar-button:hover {
            transform: translateY(-1px);
            filter: brightness(1.04) saturate(1.02);
            box-shadow: ${isDarkMode
              ? '0 10px 24px rgba(2, 6, 23, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.06)'
              : '0 10px 20px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.85)'};
          }

          .toolbar-button:active {
            transform: translateY(1px) scale(0.985);
            filter: brightness(0.98);
          }

          .toolbar-input {
            transition:
              border-color 180ms ${premiumEase},
              box-shadow 180ms ${premiumEase};
          }

          .toolbar-input:hover {
            border-color: ${isDarkMode ? 'rgba(191, 219, 254, 0.42)' : 'rgba(37, 99, 235, 0.35)'} !important;
            box-shadow: ${isDarkMode
              ? '0 0 0 3px rgba(96, 165, 250, 0.12)'
              : '0 0 0 3px rgba(96, 165, 250, 0.1)'};
          }

          .toolbar-input:focus-visible {
            outline: none;
            border-color: ${isDarkMode ? 'rgba(147, 197, 253, 0.65)' : 'rgba(37, 99, 235, 0.5)'} !important;
            box-shadow: ${isDarkMode
              ? '0 0 0 3px rgba(96, 165, 250, 0.16)'
              : '0 0 0 3px rgba(96, 165, 250, 0.12)'};
          }
        `}
      </style>

      <div style={toolbarStyle}>
        {/* --- Capture Group --- */}
        <div style={{ display: "flex", gap: "1px", alignItems: "center" }}>
          <div
            ref={photoMenuRef}
            style={{
              position: "relative",
              zIndex: 150,
              paddingBottom: isPhotoMenuOpen ? "10px" : 0,
              marginBottom: isPhotoMenuOpen ? "-10px" : 0,
            }}
            onMouseEnter={openPhotoMenu}
            onMouseLeave={schedulePhotoMenuClose}
          >
            <button
              className="toolbar-button"
              style={photoMenuButtonStyle}
              onClick={() => setIsPhotoMenuOpen((open) => !open)}
              onFocus={openPhotoMenu}
              title="Capture, import, or record"
            >
              <Camera {...sharedIconProps} />
              <span>Photo</span>
              <ChevronDown
                size={14}
                strokeWidth={1.8}
                style={{ transform: isPhotoMenuOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }}
              />
            </button>

            {isPhotoMenuOpen && (
              <div style={photoMenuSurfaceStyle}>
                <button className="toolbar-button" style={photoMenuItemStyle} onClick={() => runPhotoAction(onFullscreenCapture)} title="Capture Fullscreen">
                  <Camera {...sharedIconProps} />
                  <span>Fullscreen</span>
                </button>
                <button className="toolbar-button" style={photoMenuItemStyle} onClick={() => runPhotoAction(onRegionCapture)} title="Capture Region">
                  <Crop {...sharedIconProps} />
                  <span>Region</span>
                </button>
                <button className="toolbar-button" style={photoMenuItemStyle} onClick={() => runPhotoAction(onWindowCapture)} title="Capture Window">
                  <PanelsTopLeft {...sharedIconProps} />
                  <span>Window</span>
                </button>
                <button className="toolbar-button" style={photoMenuItemStyle} onClick={() => runPhotoAction(onImport)} title="Open Image">
                  <ImagePlus {...sharedIconProps} />
                  <span>Open Image</span>
                </button>
                {!isRecording ? (
                  <button className="toolbar-button" style={photoMenuItemStyle} onClick={() => runPhotoAction(onStartRecording)} title="Start Screen Recording">
                    <Video {...sharedIconProps} />
                    <span>Start Recording</span>
                  </button>
                ) : (
                  <button className="toolbar-button" style={{ ...photoMenuItemStyle, color: "#f87171" }} onClick={() => runPhotoAction(onStopRecording)} title="Stop Recording">
                    <StopCircle {...sharedIconProps} />
                    <span>Stop Recording</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* --- Tools Group --- */}
        <span style={separatorStyle}></span>
        <div
          style={{
            display: "flex",
            gap: "1px",
            alignItems: "center",
            flexWrap: "nowrap",
          }}
        >
          {drawingTools.map(({ id, Icon, label }) => (
            <button
              key={id}
              className="toolbar-button"
              style={selectedTool === id ? buttonStyleActive : buttonStyle}
              onClick={() => onToolSelect(id)}
              title={label}
            >
              <Icon {...sharedIconProps} />
            </button>
          ))}
          <button
            className="toolbar-button"
            style={selectedTool === "crop" ? buttonStyleActive : buttonStyle}
            onClick={() => onToolSelect("crop")}
            title="Crop Image"
          >
            <Crop {...sharedIconProps} />
          </button>
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onAddImageOverlay}
            title="Add Picture Overlay"
          >
            <ImagePlus {...sharedIconProps} />
          </button>
        </div>

        {/* --- Tool Options Group --- */}
        <span style={separatorStyle}></span>

        {/* Unified Tool Options - Clean and Simple */}
        {(selectedTool === "pen" || selectedTool === "line" || selectedTool === "arrow" || selectedTool === "rectangle" ||
          selectedTool === "ellipse" || selectedTool === "highlighter" || isTextContext ||
          selectedTool === "step" || selectedTool === "symbol") && (
            <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
              <input
                className="toolbar-input"
                type="color"
                style={inputStyle}
                value={
                  selectedTool === "highlighter" ? highlighterColor :
                    isTextContext ? textColor :
                      (selectedTool === "step" || selectedTool === "symbol") ? stepColor :
                        penColor
                }
                onChange={(e) => {
                  if (selectedTool === "highlighter") onHighlighterColorChange(e.target.value);
                  else if (isTextContext) onTextColorChange(e.target.value);
                  else if (selectedTool === "step" || selectedTool === "symbol") onStepColorChange(e.target.value);
                  else onPenColorChange(e.target.value);
                }}
                title="Color"
              />
              {isTextContext ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "6px" }}>
                  <span style={sliderLabelStyle}>Text</span>
                  <input
                    type="range"
                    min={12}
                    max={72}
                    step={1}
                    value={Math.round(textFontSize)}
                    onMouseDown={onBeginTextAdjustment}
                    onTouchStart={onBeginTextAdjustment}
                    onChange={(e) => onTextFontSizeChange(Number(e.target.value))}
                    title="Text size"
                    style={{ width: "120px" }}
                  />
                  <span style={sliderValueStyle}>{Math.round(textFontSize)}px</span>
                  <span style={sliderLabelStyle}>Box</span>
                  <input
                    type="range"
                    min={120}
                    max={Math.max(160, Math.round(textBoxWidthMax))}
                    step={2}
                    value={Math.round(Math.min(textBoxWidth, textBoxWidthMax))}
                    onMouseDown={onBeginTextAdjustment}
                    onTouchStart={onBeginTextAdjustment}
                    onChange={(e) => onTextBoxWidthChange(Number(e.target.value))}
                    title="Text box width"
                    style={{ width: "140px" }}
                  />
                  <span style={sliderValueStyle}>{Math.round(textBoxWidth)}px</span>
                </div>
              ) : (["s", "m", "l"] as PenSize[]).map((size) => (
                <button
                  key={size}
                  className="toolbar-button"
                  style={
                    ((selectedTool === "highlighter" ? selectedHighlighterSize :
                      selectedTool === "step" ? selectedStepSize :
                        selectedPenSize) === size) ? buttonStyleActive : buttonStyle
                  }
                  onClick={() => {
                    if (selectedTool === "highlighter") onHighlighterSizeSelect(size);
                    else if (selectedTool === "step" || selectedTool === "symbol") onStepSizeSelect(size);
                    else onPenSizeSelect(size);
                  }}
                  title={size.toUpperCase()}
                >
                  {size.toUpperCase()}
                </button>
              ))}
              {selectedTool === "symbol" && (
                <div style={{ display: "flex", gap: "2px", alignItems: "center", marginLeft: "6px" }}>
                  <select
                    style={{
                      border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid #c0c0c0",
                      borderRadius: "6px",
                      background: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#f0f0f2",
                      color: isDarkMode ? "#fff" : "#000",
                      padding: "2px 4px",
                      fontSize: "14px",
                      outline: "none",
                      cursor: "pointer",
                      height: "26px"
                    }}
                    value={selectedSymbolText}
                    onChange={(e) => onSymbolTextChange(e.target.value)}
                    title="Select Symbol"
                  >
                    {SYMBOLS.map(sym => (
                      <option key={sym} value={sym} style={{ background: isDarkMode ? "#1e1e28" : "#fff" }}>{sym}</option>
                    ))}
                  </select>
                </div>
              )}
              {selectedTool === "step" && (
                <div style={{ display: "flex", gap: "2px", alignItems: "center", marginLeft: "6px" }}>
                  <div style={{
                    display: "flex",
                    background: isDarkMode ? "rgba(255, 255, 255, 0.05)" : "#f0f0f2",
                    borderRadius: "6px",
                    padding: "2px",
                    gap: "1px",
                    border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #dcdce0"
                  }}>
                    <button
                      className="toolbar-button"
                      style={!selectedStepSymbol ? buttonStyleActive : buttonStyle}
                      onClick={() => onStepSymbolChange(undefined)}
                      title="Number"
                    >
                      <Hash size={14} />
                    </button>
                    <button
                      className="toolbar-button"
                      style={selectedStepSymbol === "check" ? buttonStyleActive : buttonStyle}
                      onClick={() => onStepSymbolChange("check")}
                      title="Checkmark"
                    >
                      <Check size={14} />
                    </button>
                    <button
                      className="toolbar-button"
                      style={selectedStepSymbol === "x" ? buttonStyleActive : buttonStyle}
                      onClick={() => onStepSymbolChange("x")}
                      title="Cross"
                    >
                      <X size={14} />
                    </button>
                    <button
                      className="toolbar-button"
                      style={selectedStepSymbol === "plus" ? buttonStyleActive : buttonStyle}
                      onClick={() => onStepSymbolChange("plus")}
                      title="Plus"
                    >
                      <Plus size={14} />
                    </button>
                    <button
                      className="toolbar-button"
                      style={selectedStepSymbol === "none" ? buttonStyleActive : buttonStyle}
                      onClick={() => onStepSymbolChange("none")}
                      title="None (No Circle)"
                    >
                      <CircleSlash size={14} />
                    </button>
                  </div>
                  <span style={{ fontSize: "11px", fontWeight: "600", color: isDarkMode ? "#3b82f6" : "#0078d4", marginLeft: "4px" }}>
                    #{nextStepNumber ?? 1}
                  </span>
                </div>
              )}
            </div>
          )}

        {/* Blur Tool - Simplified */}
        {selectedTool === "blur" && (
          <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
            <button
              className="toolbar-button"
              style={selectedBlurMode === "spot" ? buttonStyleActive : buttonStyle}
              onClick={() => onBlurModeChange("spot")}
              title="Brush"
            >
              <Paintbrush {...sharedIconProps} />
            </button>
            <button
              className="toolbar-button"
              style={selectedBlurMode === "focus" ? buttonStyleActive : buttonStyle}
              onClick={() => onBlurModeChange("focus")}
              title="Focus"
            >
              <Focus {...sharedIconProps} />
            </button>
            {selectedBlurMode === "spot" && (["s", "m", "l"] as PenSize[]).map((size) => (
              <button
                key={size}
                className="toolbar-button"
                style={selectedPenSize === size ? buttonStyleActive : buttonStyle}
                onClick={() => onPenSizeSelect(size)}
                title={size.toUpperCase()}
              >
                {size.toUpperCase()}
              </button>
            ))}
          </div>
        )}

        {selectedTool === "crop" && (
          <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
            <span style={{ fontSize: "11px", color: isDarkMode ? "rgba(226, 232, 240, 0.78)" : "#4b5563", whiteSpace: "nowrap" }}>
              Adjust the crop frame
            </span>
            <button
              className="toolbar-button"
              style={{
                ...buttonStyle,
                minWidth: "auto",
                padding: "4px 10px",
                opacity: hasCropSelection ? 1 : 0.5,
                cursor: hasCropSelection ? "pointer" : "not-allowed",
              }}
              onClick={onApplyCrop}
              disabled={!hasCropSelection}
              title="Apply Crop"
            >
              Apply
            </button>
            <button
              className="toolbar-button"
              style={{ ...buttonStyle, minWidth: "auto", padding: "4px 10px" }}
              onClick={onCancelCrop}
              title="Cancel Crop"
            >
              Cancel
            </button>
          </div>
        )}

        {/* --- Actions Group --- */}
        <span style={separatorStyle}></span>
        <div style={{ display: "flex", gap: "1px", alignItems: "center" }}>
          <button
            className="toolbar-button"
            style={{
              ...buttonStyle,
              opacity: canUndo ? 1 : 0.5,
              cursor: canUndo ? "pointer" : "not-allowed",
            }}
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
          >
            <Undo2 {...sharedIconProps} />
          </button>
          <button
            className="toolbar-button"
            style={{
              ...buttonStyle,
              opacity: canRedo ? 1 : 0.5,
              cursor: canRedo ? "pointer" : "not-allowed",
            }}
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
          >
            <Redo2 {...sharedIconProps} />
          </button>
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onClear}
            title="Clear All"
          >
            <Trash2 {...sharedIconProps} />
          </button>
        </div>

        {/* --- Save/Close Group (Pushed to Right) --- */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: "1px",
            alignItems: "center",
          }}
        >
          
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onSave}
            title="Save (Ctrl+S)"
          >
            <Save {...sharedIconProps} />
          </button>
          <span style={separatorStyle}></span>
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onMinimize}
            title="Minimize Editor"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 7.5H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onMaximize}
            title="Maximize or Restore Editor"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="3" y="3" width="8" height="8" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </button>
          <button
            className="toolbar-button close-button"
            style={{
              ...buttonStyle,
              backgroundColor: "rgba(255, 60, 60, 0.15)",
              color: "rgba(255, 100, 100, 0.9)",
            }}
            onClick={onClose}
            title="Close Editor"
          >
            <X {...sharedIconProps} />
          </button>
        </div>
      </div>
    </>
  );
};

export default Toolbar;
