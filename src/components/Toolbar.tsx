import React from "react";
import {
  Camera,
  Crop,
  PanelsTopLeft,
  Video,
  StopCircle,
  PenLine,
  ArrowUpRight,
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
  Settings,
  X,
  ImagePlus,
  Dice5,
  Hash,
  Plus,
  CircleSlash,
  Check,
  Smile,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
// Import shared types and styles
import type { Tool, PenSize, BlurMode, DraggableCSSProperties } from "../types";
import {
  penSizeValues,
  textSizeValues,
  highlighterSizeValues,
} from "../styles";

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
  selectedTextSize: PenSize;
  onTextSizeSelect: (size: PenSize) => void; // Rename for consistency
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
  onImportRandom: () => void;
  onOpenSettings: () => void;
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
  onClose: () => void;
}

const drawingTools: Array<{ id: Tool; Icon: LucideIcon; label: string }> = [
  { id: "pen", Icon: PenLine, label: "Pen Tool" },
  { id: "arrow", Icon: ArrowUpRight, label: "Arrow Tool" },
  { id: "rectangle", Icon: Square, label: "Rectangle Tool" },
  { id: "ellipse", Icon: Circle, label: "Ellipse Tool" },
  { id: "highlighter", Icon: Highlighter, label: "Highlighter" },
  { id: "text", Icon: Type, label: "Text Tool" },
  { id: "step", Icon: ListOrdered, label: "Step Counter" },
  { id: "symbol", Icon: Smile, label: "Symbols" },
  { id: "blur", Icon: Droplet, label: "Blur Tool" },
];

const SYMBOLS = ["❤️", "🧑‍⚕️", "⭐", "✅", "❌", "🔥", "👍", "👎", "😊", "🎉", "💡", "⚠️", "📌", "✨", "🎈", "💉", "💊", "🏥", "🚑"];

// Helper function to create size preview style
const getSizePreviewStyle = (
  size: PenSize,
  color: string,
  type: "pen" | "text" | "step" | "highlighter"
): React.CSSProperties => {
  if (type === "text") {
    const dimension = textSizeValues[size];
    return {
      fontSize: `${Math.min(dimension, 16)}px`,
      color: color,
      fontWeight: "bold",
      padding: "2px 4px",
    };
  } else if (type === "highlighter") {
    const dimension = highlighterSizeValues[size];
    // Show a line sample for highlighter
    return {
      width: "20px",
      height: `${dimension}px`,
      backgroundColor: color,
      display: "inline-block",
      verticalAlign: "middle",
      marginLeft: "5px",
      opacity: 0.6,
      borderRadius: "1px",
    };
  } else {
    const dimension = penSizeValues[size];
    // Show a line sample for pen/step
    return {
      width: "20px",
      height: `${dimension}px`,
      backgroundColor: color,
      display: "inline-block",
      verticalAlign: "middle",
      marginLeft: "5px",
      borderRadius: `${dimension / 2}px`, // Rounded ends like pen stroke
    };
  }
};

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
    selectedTextSize,
    onTextSizeSelect,
    textColor,
    onTextColorChange,
    nextStepNumber,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    onSave,
    onImport,
    onImportRandom,
    onOpenSettings,
    selectedHighlighterSize,
    onHighlighterSizeSelect,
    selectedStepSize,
    onStepSizeSelect,
    selectedStepSymbol,
    onStepSymbolChange,
    selectedSymbolText,
    onSymbolTextChange,
    isFullscreen,
    onClear,
    // Destructure blur strength props
    blurStrength,
    // Dark mode
    isDarkMode = false,
    onBlurStrengthChange,
    onClose,
  } = props;

  const sharedIconProps = { size: 16, strokeWidth: 1.7 };

  // Clean, simple toolbar - minimal and intuitive
  const toolbarStyle: DraggableCSSProperties = {
    display: "flex",
    gap: "4px",
    flexWrap: "nowrap",
    WebkitAppRegion: "no-drag",
    padding: "6px 10px",
    background: isDarkMode ? "rgba(18, 20, 31, 0.9)" : "rgba(248, 248, 250, 0.9)",
    borderBottom: isDarkMode ? "1px solid rgba(255, 255, 255, 0.1)" : "1px solid #e0e0e0",
    backdropFilter: "blur(12px)",
    alignItems: "center",
    position: "relative",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif",
    height: "38px",
    transition: "background 0.3s ease, border-color 0.3s ease",
  };

  // Clean, simple button styling
  const buttonStyle: DraggableCSSProperties = {
    WebkitAppRegion: "no-drag",
    margin: "0",
    padding: "4px 6px",
    fontSize: "11px",
    fontWeight: "500",
    border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.15)" : "1px solid #d7dbe3",
    borderRadius: "6px",
    cursor: "pointer",
    background: isDarkMode ? "rgba(255, 255, 255, 0.06)" : "#ffffff",
    color: isDarkMode ? "rgba(255, 255, 255, 0.9)" : "#1f2937",
    transition: "all 0.1s ease",
    userSelect: "none",
    height: "30px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "4px",
    minWidth: "28px",
  };

  // Active button styling - simple selected state
  const buttonStyleActive: DraggableCSSProperties = {
    ...buttonStyle,
    background: isDarkMode ? "#3b82f6" : "#0078d4",
    border: isDarkMode ? "1px solid #3b82f6" : "1px solid #0078d4",
    color: "#fff",
  };


  // Simple input styling
  const inputStyle: DraggableCSSProperties = {
    WebkitAppRegion: "no-drag",
    marginLeft: "2px",
    border: isDarkMode ? "1px solid rgba(255, 255, 255, 0.2)" : "1px solid #c0c0c0",
    borderRadius: "2px",
    padding: "1px",
    width: "18px",
    height: "18px",
    verticalAlign: "middle",
    background: isDarkMode ? "rgba(255, 255, 255, 0.1)" : "#fff",
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

  // Recording button special styling
  const recordingButtonStyle: DraggableCSSProperties = {
    ...buttonStyle,
    background: "#dc3545",
    border: "1px solid #dc3545",
    color: "#fff",
    animation: "pulse 2s infinite",
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

          .toolbar-button:hover {
            background: ${isDarkMode ? 'rgba(255, 255, 255, 0.15)' : '#e8e8e8'} !important;
            border-color: ${isDarkMode ? 'rgba(255, 255, 255, 0.3)' : '#999'} !important;
          }

          .toolbar-button:active {
            background: ${isDarkMode ? 'rgba(255, 255, 255, 0.2)' : '#d8d8d8'} !important;
          }

          .toolbar-input:hover {
            border-color: ${isDarkMode ? 'rgba(255, 255, 255, 0.4)' : '#808080'} !important;
          }
        `}
      </style>

      <div style={toolbarStyle}>
        {/* --- Capture Group --- */}
        <div style={{ display: "flex", gap: "1px", alignItems: "center" }}>
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onFullscreenCapture}
            title="Capture Fullscreen"
          >
            <Camera {...sharedIconProps} />
          </button>
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={() => {
              console.log("[Toolbar] Region button clicked");
              onRegionCapture();
            }}
            title="Capture Region"
          >
            <Crop {...sharedIconProps} />
          </button>
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onWindowCapture}
            title="Capture Window"
          >
            <PanelsTopLeft {...sharedIconProps} />
          </button>
          <span style={separatorStyle}></span>
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onImport}
            title="Import Image"
          >
            <ImagePlus {...sharedIconProps} />
          </button>
          {!isRecording ? (
            <button
              className="toolbar-button"
              style={buttonStyle}
              onClick={onStartRecording}
              title="Start Screen Recording"
            >
              <Video {...sharedIconProps} />
            </button>
          ) : (
            <button
              className="toolbar-button"
              style={recordingButtonStyle}
              onClick={onStopRecording}
              title="Stop Recording"
            >
              <StopCircle {...sharedIconProps} />
            </button>
          )}
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
        </div>

        {/* --- Tool Options Group --- */}
        <span style={separatorStyle}></span>

        {/* Unified Tool Options - Clean and Simple */}
        {(selectedTool === "pen" || selectedTool === "arrow" || selectedTool === "rectangle" ||
          selectedTool === "ellipse" || selectedTool === "highlighter" || selectedTool === "text" ||
          selectedTool === "step" || selectedTool === "symbol") && (
            <div style={{ display: "flex", gap: "2px", alignItems: "center" }}>
              <input
                className="toolbar-input"
                type="color"
                style={inputStyle}
                value={
                  selectedTool === "highlighter" ? highlighterColor :
                    selectedTool === "text" ? textColor :
                      (selectedTool === "step" || selectedTool === "symbol") ? stepColor :
                        penColor
                }
                onChange={(e) => {
                  if (selectedTool === "highlighter") onHighlighterColorChange(e.target.value);
                  else if (selectedTool === "text") onTextColorChange(e.target.value);
                  else if (selectedTool === "step" || selectedTool === "symbol") onStepColorChange(e.target.value);
                  else onPenColorChange(e.target.value);
                }}
                title="Color"
              />
              {(["s", "m", "l"] as PenSize[]).map((size) => (
                <button
                  key={size}
                  className="toolbar-button"
                  style={
                    ((selectedTool === "highlighter" ? selectedHighlighterSize :
                      selectedTool === "text" ? selectedTextSize :
                        selectedTool === "step" ? selectedStepSize :
                          selectedPenSize) === size) ? buttonStyleActive : buttonStyle
                  }
                  onClick={() => {
                    if (selectedTool === "highlighter") onHighlighterSizeSelect(size);
                    else if (selectedTool === "text") onTextSizeSelect(size);
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

        {/* --- Save/Settings Group (Pushed to Right) --- */}
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
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onOpenSettings}
            title="Settings"
          >
            <Settings {...sharedIconProps} />
          </button>
          <span style={separatorStyle}></span>
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
