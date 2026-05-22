import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
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
import type { Tool, PenSize, BlurMode, DraggableCSSProperties, ArrowType, StepType } from "../types";
import { CanvasRenderer } from "../services/canvasRenderer";


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
  selectedArrowType: ArrowType;
  onArrowTypeChange: (type: ArrowType) => void;
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
  isPlainText: boolean;
  onBeginTextAdjustment: () => void;
  onTextFontSizeChange: (fontSize: number) => void;
  onTogglePlainText: (isPlain: boolean) => void;
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
  selectedHighlighterSize: PenSize;
  onHighlighterSizeSelect: (size: PenSize) => void;
  selectedStepSize: PenSize;
  onStepSizeSelect: (size: PenSize) => void;
  selectedStepSymbol?: string;
  onStepSymbolChange: (symbol: string | undefined) => void;
  selectedStepType: StepType;
  onStepTypeChange: (type: StepType) => void;
  selectedSymbolText: string;
  onSymbolTextChange: (symbol: string) => void;
  onClear: () => void;
  isFullscreen: boolean;
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
  { id: "sticker", Icon: Smile, label: "Stickers" },
  { id: "blur", Icon: Droplet, label: "Blur Tool" },
];

const PHOTO_MENU_CLOSE_DELAY_MS = 280;
const PHOTO_MENU_WIDTH = 210;
const STICKER_MENU_WIDTH = 220;
const STEP_MENU_WIDTH = 200;
const VIEWPORT_MARGIN = 10;
const TOOLTIP_MAX_WIDTH = 240;
const TOOLTIP_MIN_WIDTH = 72;
const premiumEase = "cubic-bezier(0.22, 1, 0.36, 1)";

const AVAILABLE_STICKERS = [
  "❤️", "⭐", "✅", "❌", "🔥", "👍", "👎", "😊", "🎉", "💡", "⚠️", "📌",
  "✨", "🎈", "🎯", "🚀", "💎", "💯", "📣", "🔍", "🔒", "🔑", "🌈", "☀️",
  "🌙", "🎨", "🎬", "🎧", "📷", "📱", "💻", "💼", "📅", "📍", "✉️", "🎁",
  "🏆", "🍕", "☕", "🍺", "👀", "👉", "👇", "⬆️", "⬇️", "➡️", "⬅️", "🟢",
  "🟡", "🔴", "🔵", "🟣", "🧠", "💬", "❗", "❓", "📝", "📎", "🔧", "⚙️",
  "🛠️", "🧩", "🏁", "💥", "🌟", "🥳", "😎", "🤔", "🙌", "👏", "🙏", "💪",
  "🛡️", "📈", "📉", "⏱️", "⌛", "🔔", "🔗", "🗂️", "📦"
];

const ARROW_OPTIONS: Array<{ id: ArrowType; label: string }> = [
  { id: "sharp", label: "Sharp Pro" },
  { id: "standard", label: "Classic" },
  { id: "brush", label: "Brush Stroke" },
  { id: "feathered", label: "Feathered" },
  { id: "double", label: "Double Head" },
  { id: "bold", label: "Heavy Bold" },
  { id: "outline", label: "Hollow" },
  { id: "curved", label: "Curved Sweep" },
  { id: "dotted", label: "Dotted" },
  { id: "dashed", label: "Dashed" },
];

const STEP_OPTIONS: { id: StepType; label: string }[] = [
  { id: "circle", label: "Step Counter" },
];

const ArrowPreview: React.FC<{ type: ArrowType; color: string; isDarkMode: boolean }> = ({ type, color, isDarkMode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = 48;
    const height = 28;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = type === 'bold' || type === 'brush' ? 1.5 : 2;
    
    // Draw a small arrow preview
    const padding = 6;
    CanvasRenderer.drawArrow(ctx, padding, height - padding, width - padding, padding, type);
  }, [type, color]);

  return <canvas ref={canvasRef} style={{ width: 48, height: 28, borderRadius: '4px', background: 'transparent' }} />;
};

const StepPreview: React.FC<{ type: StepType; color: string; isDarkMode: boolean }> = ({ type, color, isDarkMode }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const width = 36;
    const height = 36;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);
    
    // We need to cast because drawStepObject expects a full annotation
    const mockAnnotation: any = {
        id: 'preview',
        type: 'step',
        cx: width / 2,
        cy: height / 2,
        radius: 12,
        number: 1,
        color: color,
        fontSize: 14,
        size: 'm',
        stepType: type
    };

    CanvasRenderer.drawStepObject(ctx, mockAnnotation);
  }, [type, color, isDarkMode]);

  return <canvas ref={canvasRef} style={{ width: 36, height: 36, background: 'transparent' }} />;
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
    selectedArrowType,
    onArrowTypeChange,
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
    isPlainText,
    onBeginTextAdjustment,
    onTextFontSizeChange,
    onTogglePlainText,
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
    selectedStepType,
    onStepTypeChange,
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
  const [isStickerMenuOpen, setIsStickerMenuOpen] = useState(false);
  const photoMenuRef = useRef<HTMLDivElement>(null);
  const stickerMenuRef = useRef<HTMLDivElement>(null);
  const photoButtonRef = useRef<HTMLButtonElement>(null);
  const stickerButtonRef = useRef<HTMLButtonElement>(null);
  const photoMenuCloseTimerRef = useRef<number | null>(null);
  const [photoMenuPosition, setPhotoMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [stickerMenuPosition, setStickerMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const [isArrowMenuOpen, setIsArrowMenuOpen] = useState(false);
  const arrowMenuRef = useRef<HTMLDivElement>(null);
  const arrowButtonRef = useRef<HTMLButtonElement>(null);
  const [arrowMenuPosition, setArrowMenuPosition] = useState<{ left: number; top: number } | null>(null);

  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number; width: number; placement: "top" | "bottom" } | null>(null);

  const updatePhotoMenuPosition = useCallback(() => {
    const rect = photoButtonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - PHOTO_MENU_WIDTH - VIEWPORT_MARGIN)
    );
    const top = Math.min(
      rect.bottom + 8,
      Math.max(VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN)
    );

    setPhotoMenuPosition({ left, top });
  }, []);

  const STICKER_MENU_WIDTH = 220;
  const updateStickerMenuPosition = useCallback(() => {
    const rect = stickerButtonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - STICKER_MENU_WIDTH - VIEWPORT_MARGIN)
    );
    const top = Math.min(
      rect.bottom + 8,
      Math.max(VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN)
    );

    setStickerMenuPosition({ left, top });
  }, []);

  const ARROW_MENU_WIDTH = 200;
  const updateArrowMenuPosition = useCallback(() => {
    const rect = arrowButtonRef.current?.getBoundingClientRect();
    if (!rect) return;

    const left = Math.min(
      Math.max(VIEWPORT_MARGIN, rect.left),
      Math.max(VIEWPORT_MARGIN, window.innerWidth - ARROW_MENU_WIDTH - VIEWPORT_MARGIN)
    );
    const top = Math.min(
      rect.bottom + 8,
      Math.max(VIEWPORT_MARGIN, window.innerHeight - VIEWPORT_MARGIN)
    );

    setArrowMenuPosition({ left, top });
  }, []);

  useEffect(() => {
    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest('[data-tooltip]');
      if (target.closest('[data-photo-menu]')) {
        setTooltip(null);
        return;
      }
      if (button) {
        const text = button.getAttribute('data-tooltip') || '';
        const rect = button.getBoundingClientRect();
        const width = Math.min(TOOLTIP_MAX_WIDTH, Math.max(TOOLTIP_MIN_WIDTH, text.length * 7 + 22));
        const minX = VIEWPORT_MARGIN + width / 2;
        const maxX = Math.max(minX, window.innerWidth - VIEWPORT_MARGIN - width / 2);
        const x = Math.min(
          Math.max(minX, rect.left + rect.width / 2),
          maxX
        );
        const bottomY = rect.bottom + 8;
        const placement = bottomY + 32 > window.innerHeight ? "top" : "bottom";
        const y = placement === "top" ? Math.max(VIEWPORT_MARGIN, rect.top - 8) : bottomY;
        setTooltip({ text, x, y, width, placement });
      } else {
        setTooltip(null);
      }
    };
    document.addEventListener('mouseover', handleMouseOver);
    return () => document.removeEventListener('mouseover', handleMouseOver);
  }, []);

  useEffect(() => {
    return () => {
      if (photoMenuCloseTimerRef.current !== null) {
        window.clearTimeout(photoMenuCloseTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isPhotoMenuOpen) return;
    updatePhotoMenuPosition();

    const handlePointerDown = (event: MouseEvent) => {
      if (!photoMenuRef.current?.contains(event.target as Node) && 
          !photoButtonRef.current?.contains(event.target as Node)) {
        setIsPhotoMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updatePhotoMenuPosition);
    document.addEventListener("scroll", updatePhotoMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updatePhotoMenuPosition);
      document.removeEventListener("scroll", updatePhotoMenuPosition, true);
    };
  }, [isPhotoMenuOpen, updatePhotoMenuPosition]);

  useEffect(() => {
    if (!isStickerMenuOpen) return;
    updateStickerMenuPosition();

    const handlePointerDown = (event: MouseEvent) => {
      if (!stickerMenuRef.current?.contains(event.target as Node) && 
          !stickerButtonRef.current?.contains(event.target as Node)) {
        setIsStickerMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updateStickerMenuPosition);
    document.addEventListener("scroll", updateStickerMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updateStickerMenuPosition);
      document.removeEventListener("scroll", updateStickerMenuPosition, true);
    };
  }, [isStickerMenuOpen, updateStickerMenuPosition]);

  useEffect(() => {
    if (!isArrowMenuOpen) return;
    updateArrowMenuPosition();

    const handlePointerDown = (event: MouseEvent) => {
      if (!arrowMenuRef.current?.contains(event.target as Node) && 
          !arrowButtonRef.current?.contains(event.target as Node)) {
        setIsArrowMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updateArrowMenuPosition);
    document.addEventListener("scroll", updateArrowMenuPosition, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updateArrowMenuPosition);
      document.removeEventListener("scroll", updateArrowMenuPosition, true);
    };
  }, [isArrowMenuOpen, updateArrowMenuPosition]);

  const openPhotoMenu = () => {
    if (photoMenuCloseTimerRef.current !== null) {
      window.clearTimeout(photoMenuCloseTimerRef.current);
      photoMenuCloseTimerRef.current = null;
    }
    setTooltip(null);
    updatePhotoMenuPosition();
    setIsPhotoMenuOpen(true);
  };

  const toggleStickerMenu = () => {
    setTooltip(null);
    updateStickerMenuPosition();
    setIsStickerMenuOpen(!isStickerMenuOpen);
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
    padding: "10px 14px",
    background: isDarkMode
      ? "linear-gradient(180deg, rgba(18, 21, 33, 0.96), rgba(12, 15, 24, 0.94))"
      : "linear-gradient(180deg, rgba(252, 253, 255, 0.98), rgba(244, 247, 250, 0.95))",
    borderBottom: isDarkMode ? "1px solid rgba(148, 163, 184, 0.16)" : "1px solid rgba(148, 163, 184, 0.24)",
    backdropFilter: "blur(18px)",
    alignItems: "center",
    position: "relative",
    zIndex: 120,
    overflow: "visible",
    msOverflowStyle: "none",
    scrollbarWidth: "none",
  };

  // Clean, simple button styling
  const buttonStyle: DraggableCSSProperties = {
    WebkitAppRegion: "no-drag",
    margin: "0",
    padding: "4px 8px",
    fontSize: "11.5px",
    fontWeight: "600",
    border: isDarkMode ? "1px solid rgba(148, 163, 184, 0.12)" : "1px solid rgba(148, 163, 184, 0.2)",
    borderRadius: "8px",
    backgroundColor: isDarkMode ? "rgba(15, 23, 42, 0.34)" : "rgba(255, 255, 255, 0.6)",
    color: isDarkMode ? "#94a3b8" : "#64748b",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: "32px",
    minWidth: "32px",
    gap: "6px",
    transition: `transform 180ms ${premiumEase}, background 180ms ${premiumEase}, border-color 180ms ${premiumEase}, box-shadow 180ms ${premiumEase}, color 180ms ${premiumEase}, filter 180ms ${premiumEase}`,
    userSelect: "none",
    boxShadow: isDarkMode
      ? "inset 0 1px 0 rgba(255, 255, 255, 0.025), 0 1px 2px rgba(2, 6, 23, 0.18)"
      : "inset 0 1px 0 rgba(255, 255, 255, 0.8), 0 1px 2px rgba(15, 23, 42, 0.04)",
  };

  // Active button styling - premium selected state
  const buttonStyleActive: DraggableCSSProperties = {
    ...buttonStyle,
    color: isDarkMode ? "#60a5fa" : "#0078d4",
    filter: "brightness(1.1)",
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
      : "transparent",
    border: isPhotoMenuOpen
      ? (isDarkMode ? "1px solid rgba(96, 165, 250, 0.55)" : "1px solid rgba(0, 120, 212, 0.4)")
      : "transparent",
    color: isPhotoMenuOpen
      ? (isDarkMode ? "#bfdbfe" : "#005a9e")
      : buttonStyle.color,
  };

  const photoMenuSurfaceStyle: React.CSSProperties = {
    position: "fixed",
    top: photoMenuPosition?.top ?? 54,
    left: photoMenuPosition?.left ?? VIEWPORT_MARGIN,
    width: PHOTO_MENU_WIDTH,
    maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
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
    overflow: "hidden",
  };

  const stickerMenuSurfaceStyle: React.CSSProperties = {
    position: "fixed",
    top: stickerMenuPosition?.top ?? 54,
    left: stickerMenuPosition?.left ?? VIEWPORT_MARGIN,
    width: STICKER_MENU_WIDTH,
    maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
    marginTop: "2px",
    padding: "10px",
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
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: "6px",
  };

  const stickerMenuItemStyle: DraggableCSSProperties = {
    ...buttonStyle,
    width: "34px",
    height: "34px",
    fontSize: "18px",
    padding: "0",
    border: "none",
    background: "transparent",
    borderRadius: "8px",
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

  const arrowMenuSurfaceStyle: React.CSSProperties = {
    position: "fixed",
    top: arrowMenuPosition?.top ?? 54,
    left: arrowMenuPosition?.left ?? VIEWPORT_MARGIN,
    width: 210, // More compact
    maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`,
    marginTop: "2px",
    padding: "6px", // More compact padding
    borderRadius: "14px",
    background: isDarkMode
      ? "linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(15, 23, 42, 0.94))"
      : "linear-gradient(180deg, rgba(255, 255, 255, 0.99), rgba(248, 250, 252, 0.98))",
    border: isDarkMode ? "1px solid rgba(148, 163, 184, 0.18)" : "1px solid rgba(15, 23, 42, 0.08)",
    boxShadow: isDarkMode
      ? "0 22px 48px rgba(2, 6, 23, 0.42)"
      : "0 18px 40px rgba(15, 23, 42, 0.14)",
    backdropFilter: "blur(22px)",
    zIndex: 2000,
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "6px",
    overflow: "hidden",
  };

  const arrowMenuItemStyle: DraggableCSSProperties = {
    ...photoMenuItemStyle,
    fontSize: "12px",
  };

  const stepMenuItemStyle: DraggableCSSProperties = {
    ...arrowMenuItemStyle,
    height: "auto",
    flexDirection: "column",
    padding: "8px 4px",
    gap: "6px",
  };

  const isTextContext = selectedTool === "text" || hasSelectedTextAnnotation;
  const isStickerContext = selectedTool === "sticker" || selectedTool === "symbol";
  const sliderLabelStyle: React.CSSProperties = {
    fontSize: "11px",
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
          @keyframes popIn {
            from { transform: scale(0.96) translateY(-4px); opacity: 0; }
            to { transform: scale(1) translateY(0); opacity: 1; }
          }

          .toolbar-pop-in {
            animation: popIn 240ms ${premiumEase} forwards;
          }

          .toolbar-button {
            transition:
              transform 180ms ${premiumEase},
              box-shadow 180ms ${premiumEase},
              filter 180ms ${premiumEase},
              opacity 180ms ${premiumEase};
          }

          .toolbar-button:hover {
            filter: brightness(1.03) saturate(1.02);
            box-shadow: ${isDarkMode
              ? '0 10px 24px rgba(2, 6, 23, 0.26), inset 0 1px 0 rgba(255, 255, 255, 0.04)'
              : '0 10px 20px rgba(15, 23, 42, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.85)'};
          .toolbar-button:active {
            opacity: 0.8;
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
        .toolbar-main-container::-webkit-scrollbar,
        .toolbar-scroll-area::-webkit-scrollbar {
          display: none;
        }
        .toolbar-main-container,
        .toolbar-scroll-area {
          scrollbar-width: none;
        }
        `}
      </style>

    <div className="toolbar-main-container" style={toolbarStyle}>
      <div
          className="toolbar-scroll-area"
          style={{
            display: "flex",
            flex: 1,
            overflowX: "hidden",
            overflowY: "visible",
            alignItems: "center",
            gap: "6px",
            minWidth: 0,
            msOverflowStyle: "none",
            scrollbarWidth: "none",
          }}
        >
        {/* --- Capture Group --- */}
        <div style={{ display: "flex", gap: "1px", alignItems: "center", flexShrink: 0 }}>
          <div
            ref={photoMenuRef}
            data-photo-menu
            style={{
              position: "relative",
              zIndex: 150,
            }}
            onMouseEnter={openPhotoMenu}
            onMouseLeave={schedulePhotoMenuClose}
          >
            <button
              ref={photoButtonRef}
              className="toolbar-button"
              style={photoMenuButtonStyle}
              onClick={openPhotoMenu}
              onFocus={updatePhotoMenuPosition}
              aria-expanded={isPhotoMenuOpen}
              data-tooltip="Capture, import, or record"
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
              <div
                className="toolbar-pop-in"
                style={photoMenuSurfaceStyle}
                onMouseEnter={openPhotoMenu}
                onMouseLeave={schedulePhotoMenuClose}
              >
                <button className="toolbar-button" style={photoMenuItemStyle} onClick={() => runPhotoAction(onFullscreenCapture)} data-tooltip="Capture Fullscreen">
                  <Camera {...sharedIconProps} />
                  <span>Fullscreen</span>
                </button>
                <button className="toolbar-button" style={photoMenuItemStyle} onClick={() => runPhotoAction(onRegionCapture)} data-tooltip="Capture Region">
                  <Crop {...sharedIconProps} />
                  <span>Region</span>
                </button>
                <button className="toolbar-button" style={photoMenuItemStyle} onClick={() => runPhotoAction(onWindowCapture)} data-tooltip="Capture Window">
                  <PanelsTopLeft {...sharedIconProps} />
                  <span>Window</span>
                </button>
                <button className="toolbar-button" style={photoMenuItemStyle} onClick={() => runPhotoAction(onImport)} data-tooltip="Open Image">
                  <ImagePlus {...sharedIconProps} />
                  <span>Open Image</span>
                </button>
                {!isRecording ? (
                  <button className="toolbar-button" style={photoMenuItemStyle} onClick={() => runPhotoAction(onStartRecording)} data-tooltip="Start Screen Recording">
                    <Video {...sharedIconProps} />
                    <span>Start Recording</span>
                  </button>
                ) : (
                  <button className="toolbar-button" style={{ ...photoMenuItemStyle, color: "#f87171" }} onClick={() => runPhotoAction(onStopRecording)} data-tooltip="Stop Recording">
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
            flexShrink: 0,
          }}
        >
          {drawingTools.map(({ id, Icon, label }) => {
            if (id === "sticker") {
              return (
                <div key={id} ref={stickerMenuRef} style={{ position: "relative" }}>
                  <button
                    ref={stickerButtonRef}
                    className="toolbar-button"
                    style={selectedTool === id || isStickerMenuOpen ? buttonStyleActive : buttonStyle}
                    onClick={() => { 
                      if (selectedTool === id) {
                        toggleStickerMenu();
                      } else {
                        onToolSelect(id);
                        if (!isStickerMenuOpen) toggleStickerMenu();
                      }
                    }}
                    data-tooltip={label}
                  >
                    <Icon {...sharedIconProps} />
                    <ChevronDown size={12} style={{ opacity: 0.5, marginLeft: "-2px", transform: isStickerMenuOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
                  </button>
                  {isStickerMenuOpen && (
                    <div className="toolbar-pop-in" style={stickerMenuSurfaceStyle}>
                      {AVAILABLE_STICKERS.map((sym, index) => (
                        <button
                          key={`${sym}-${index}`}
                          className="toolbar-button"
                          style={{
                            ...stickerMenuItemStyle,
                            background: selectedSymbolText === sym 
                              ? (isDarkMode ? "rgba(59, 130, 246, 0.2)" : "rgba(37, 99, 235, 0.1)")
                              : "transparent",
                            color: selectedSymbolText === sym 
                              ? (isDarkMode ? "#60a5fa" : "#0078d4")
                              : (isDarkMode ? "#cbd5e1" : "#475569"),
                          }}
                          onClick={() => { onSymbolTextChange(sym); setIsStickerMenuOpen(false); }}
                        >
                          {sym}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }
            if (id === "arrow") {
              return (
                <div key={id} ref={arrowMenuRef} style={{ position: "relative" }}>
                  <button
                    ref={arrowButtonRef}
                    className="toolbar-button"
                    style={selectedTool === id || isArrowMenuOpen ? buttonStyleActive : buttonStyle}
                    onClick={() => { 
                      if (selectedTool === id) {
                        setIsArrowMenuOpen(!isArrowMenuOpen);
                      } else {
                        onToolSelect(id);
                        setIsArrowMenuOpen(true);
                      }
                      updateArrowMenuPosition();
                    }}
                    data-tooltip={label}
                  >
                    <Icon {...sharedIconProps} />
                    <ChevronDown size={12} style={{ opacity: 0.5, marginLeft: "-2px", transform: isArrowMenuOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s ease" }} />
                  </button>
                  {isArrowMenuOpen && (
                    <div className="toolbar-pop-in" style={arrowMenuSurfaceStyle}>
                      {ARROW_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          className="toolbar-button"
                          style={{
                            ...arrowMenuItemStyle,
                            flexDirection: "column",
                            height: "auto",
                            padding: "6px 4px",
                            background: selectedArrowType === opt.id 
                              ? (isDarkMode ? "rgba(56, 189, 248, 0.12)" : "rgba(37, 99, 235, 0.08)")
                              : "transparent",
                            borderColor: selectedArrowType === opt.id 
                              ? (isDarkMode ? "rgba(56, 189, 248, 0.35)" : "rgba(37, 99, 235, 0.25)")
                              : "transparent",
                            borderWidth: "1px",
                            borderStyle: "solid",
                            color: selectedArrowType === opt.id 
                              ? (isDarkMode ? "#7dd3fc" : "#0078d4")
                              : (isDarkMode ? "#94a3b8" : "#475569"),
                            gap: "4px",
                          }}
                          onClick={() => { onArrowTypeChange(opt.id); setIsArrowMenuOpen(false); }}
                          data-tooltip={opt.label}
                        >
                          <ArrowPreview 
                            type={opt.id} 
                            color={selectedArrowType === opt.id ? (isDarkMode ? "#7dd3fc" : "#0078d4") : (isDarkMode ? "#94a3b8" : "#64748b")} 
                            isDarkMode={!!isDarkMode} 
                          />
                          <span style={{ fontSize: "9px", fontWeight: selectedArrowType === opt.id ? "700" : "500", marginTop: "-2px" }}>{opt.label}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button
                key={id}
                className="toolbar-button"
                style={selectedTool === id ? buttonStyleActive : buttonStyle}
                onClick={() => onToolSelect(id)}
                data-tooltip={label}
              >
                <Icon {...sharedIconProps} />
              </button>
            );
          })}










          <button
            className="toolbar-button"
            style={selectedTool === "crop" ? buttonStyleActive : buttonStyle}
            onClick={() => onToolSelect("crop")}
            data-tooltip="Crop Image"
          >
            <Crop {...sharedIconProps} />
          </button>
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onAddImageOverlay}
            data-tooltip="Add Picture Overlay"
          >
            <ImagePlus {...sharedIconProps} />
          </button>
        </div>

        {/* --- Tool Options Group --- */}
        <span style={separatorStyle}></span>

        {/* Unified Tool Options - Clean and Simple */}
        {(selectedTool === "pen" || selectedTool === "line" || selectedTool === "arrow" || selectedTool === "rectangle" ||
          selectedTool === "ellipse" || selectedTool === "highlighter" || isTextContext ||
          selectedTool === "step" || isStickerContext) && (
            <div style={{ display: "flex", gap: "2px", alignItems: "center", flexShrink: 0 }}>
              <input
                className="toolbar-input"
                type="color"
                style={inputStyle}
                value={
                  selectedTool === "highlighter" ? highlighterColor :
                    isTextContext ? textColor :
                      (selectedTool === "step" || isStickerContext) ? stepColor :
                        penColor
                }
                onChange={(e) => {
                  if (selectedTool === "highlighter") onHighlighterColorChange(e.target.value);
                  else if (isTextContext) onTextColorChange(e.target.value);
                  else if (selectedTool === "step" || isStickerContext) onStepColorChange(e.target.value);
                  else onPenColorChange(e.target.value);
                }}
                data-tooltip="Color"
              />
              {isTextContext ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "6px" }}>
                  <span style={sliderLabelStyle}>Text</span>
                  <input
                    type="range"
                    min={12}
                    max={160}
                    step={1}
                    value={Math.round(textFontSize)}
                    onMouseDown={onBeginTextAdjustment}
                    onTouchStart={onBeginTextAdjustment}
                    onChange={(e) => onTextFontSizeChange(Number(e.target.value))}
                    data-tooltip="Text size"
                    style={{ width: "120px" }}
                  />
                  <span style={sliderValueStyle}>{Math.round(textFontSize)}px</span>
                  <label style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "11px", color: isDarkMode ? "#f8fafc" : "#0f172a", cursor: "pointer", marginLeft: "8px" }}>
                    <input
                      type="checkbox"
                      checked={isPlainText}
                      onChange={(e) => onTogglePlainText(e.target.checked)}
                      style={{ cursor: "pointer", width: "14px", height: "14px", margin: 0 }}
                    />
                    Plain Text
                  </label>
                </div>

              ) : (["s", "m", "l", "xl"] as PenSize[]).map((size) => (
                <button
                  key={size}
                  className="toolbar-button"
                  style={
                    ((selectedTool === "highlighter" ? selectedHighlighterSize :
                      (selectedTool === "step" || isStickerContext) ? selectedStepSize :
                        selectedPenSize) === size) ? buttonStyleActive : buttonStyle
                  }
                  onClick={() => {
                    if (selectedTool === "highlighter") onHighlighterSizeSelect(size);
                    else if (selectedTool === "step" || isStickerContext) onStepSizeSelect(size);
                    else onPenSizeSelect(size);
                  }}
                  data-tooltip={size.toUpperCase()}
                >
                  {size.toUpperCase()}
                </button>
              ))}

              {selectedTool === "step" && (
                <div style={{ display: "flex", gap: "2px", alignItems: "center", marginLeft: "6px" }}>
                  <span style={{ fontSize: "11px", fontWeight: "600", color: isDarkMode ? "#3b82f6" : "#0078d4", marginLeft: "4px" }}>
                    Next: #{nextStepNumber ?? 1}
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
              data-tooltip="Brush"
            >
              <Paintbrush {...sharedIconProps} />
            </button>
            <button
              className="toolbar-button"
              style={selectedBlurMode === "focus" ? buttonStyleActive : buttonStyle}
              onClick={() => onBlurModeChange("focus")}
              data-tooltip="Focus"
            >
              <Focus {...sharedIconProps} />
            </button>
            {selectedBlurMode === "spot" && (["s", "m", "l"] as PenSize[]).map((size) => (
              <button
                key={size}
                className="toolbar-button"
                style={selectedPenSize === size ? buttonStyleActive : buttonStyle}
                onClick={() => onPenSizeSelect(size)}
                data-tooltip={size.toUpperCase()}
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
              data-tooltip="Apply Crop"
            >
              Apply
            </button>
            <button
              className="toolbar-button"
              style={{ ...buttonStyle, minWidth: "auto", padding: "4px 10px" }}
              onClick={onCancelCrop}
              data-tooltip="Cancel Crop"
            >
              Cancel
            </button>
          </div>
        )}

        {/* --- Actions Group --- */}
        <span style={separatorStyle}></span>
        <div style={{ display: "flex", gap: "1px", alignItems: "center", flexShrink: 0 }}>
          <button
            className="toolbar-button"
            style={{
              ...buttonStyle,
              opacity: canUndo ? 1 : 0.5,
              cursor: canUndo ? "pointer" : "not-allowed",
            }}
            onClick={onUndo}
            disabled={!canUndo}
            data-tooltip="Undo (Ctrl+Z)"
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
            data-tooltip="Redo (Ctrl+Y)"
          >
            <Redo2 {...sharedIconProps} />
          </button>
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onClear}
            data-tooltip="Clear All"
          >
            <Trash2 {...sharedIconProps} />
          </button>
          </div>
        </div>

        {/* --- Save/Close Group (Pushed to Right) --- */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: "1px",
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onSave}
            data-tooltip="Save (Ctrl+S)"
          >
            <Save {...sharedIconProps} />
          </button>
          <span style={separatorStyle}></span>
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onMinimize}
            data-tooltip="Minimize Editor"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M3 7.5H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
          <button
            className="toolbar-button"
            style={buttonStyle}
            onClick={onMaximize}
            data-tooltip="Maximize or Restore Editor"
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
            data-tooltip="Close Editor"
          >
            <X {...sharedIconProps} />
          </button>
        </div>
      </div>
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.x,
          top: tooltip.y,
          width: tooltip.width,
          maxWidth: TOOLTIP_MAX_WIDTH,
          transform: tooltip.placement === "top" ? "translate(-50%, -100%)" : "translateX(-50%)",
          background: "rgba(15, 23, 42, 0.95)",
          color: "#f8fafc",
          padding: "6px 10px",
          borderRadius: "6px",
          fontSize: "11.5px",
          fontWeight: 500,
          whiteSpace: "normal",
          textAlign: "center",
          overflowWrap: "break-word",
          boxSizing: "border-box",
          zIndex: 999999,
          pointerEvents: "none",
          boxShadow: "0 4px 16px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.1)",
          backdropFilter: "blur(8px)",
          letterSpacing: "0.01em",
        }}>
          {tooltip.text}
        </div>
      )}
    </>
  );
};

export default Toolbar;
