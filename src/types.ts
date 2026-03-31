// --- NEW: Add all type definitions here ---

// Define tool types
export type Tool =
  | "pen"
  | "arrow"
  | "text"
  | "blur"
  | "highlighter"
  | "rectangle"
  | "ellipse"
  | "step"
  | "select"
  | "move"
  | "none"
  | "text-dragging"
  | "blur-dragging"
  | "notes"
  | "symbol";

// Define size types
export type PenSize = "s" | "m" | "l";
export type BlurMode = "spot" | "focus";

// Base annotation interface
export interface BaseAnnotation {
  id: string; // Unique ID for selection, modification, deletion
  startTime?: number;
  duration?: number;
}

// Text annotation interface
export interface TextAnnotation extends BaseAnnotation {
  type: "text";
  x: number; // Scaled canvas coordinate (text position)
  y: number; // Scaled canvas coordinate (text baseline)
  content: string;
  color: string;
  font: string; // Includes size and font family
  size: PenSize; // Store the abstract size ('s', 'm', 'l')
  // Optional box bounds for text area
  boxX?: number; // Box top-left x
  boxY?: number; // Box top-left y
  boxWidth?: number; // Box width
  boxHeight?: number; // Box height
}

// Pen annotation interface
export interface PenAnnotation extends BaseAnnotation {
  type: "pen";
  points: { x: number; y: number }[]; // Array of points in the stroke
  color: string;
  width: number;
  size: PenSize; // Store abstract size too
}

// Arrow annotation interface
export interface ArrowAnnotation extends BaseAnnotation {
  type: "arrow";
  startX: number; // Scaled coordinate
  startY: number; // Scaled coordinate
  endX: number; // Scaled coordinate
  endY: number; // Scaled coordinate
  color: string;
  width: number;
  size: PenSize; // Store abstract size
}

// Blur annotation interface
export interface BlurAnnotation extends BaseAnnotation {
  type: "blur";
  mode: "spot";
  points?: { x: number; y: number }[];
  brushSize?: number;
}

// Highlighter annotation interface
export interface HighlighterAnnotation extends BaseAnnotation {
  type: "highlighter";
  points: { x: number; y: number }[]; // Array of points in the stroke
  color: string; // Base color (e.g., yellow)
  width: number; // Thickness
  size: PenSize; // Store abstract size too
}

// Rectangle annotation interface
export interface RectangleAnnotation extends BaseAnnotation {
  type: "rectangle";
  x: number; // Scaled top-left x
  y: number; // Scaled top-left y
  width: number; // Scaled width
  height: number; // Scaled height
  color: string; // Stroke color
  lineWidth: number; // Stroke width
  size: PenSize; // Store abstract size
}

// Ellipse annotation interface
export interface EllipseAnnotation extends BaseAnnotation {
  type: "ellipse";
  cx: number; // Scaled center x
  cy: number; // Scaled center y
  rx: number; // Scaled radius x
  ry: number; // Scaled radius y
  color: string; // Stroke color
  lineWidth: number; // Stroke width
  size: PenSize; // Store abstract size
}

// Step annotation interface
export interface StepAnnotation extends BaseAnnotation {
  type: "step";
  cx: number; // Scaled center x
  cy: number; // Scaled center y
  radius: number; // Scaled radius (derived from font size)
  number: number; // The step number
  color: string; // Color for circle and text
  fontSize: number; // Font size used for number and radius calculation
  size: PenSize; // Store abstract size used ('s', 'm', 'l')
  symbol?: string; // Optional symbol to display instead of number (e.g., 'check', 'cross') or 'none'
}

// --- NEW: Symbol Annotation ---
export interface SymbolAnnotation extends BaseAnnotation {
  type: "symbol";
  x: number; // Scaled center x
  y: number; // Scaled center y
  symbol: string; // The emoji or symbol character
  color: string; // fallback color
  fontSize: number;
  size: PenSize;
}

// --- NEW: Focus Rectangle Annotation ---
export interface FocusRectangleAnnotation extends BaseAnnotation {
  type: "focusRect";
  x: number; // Scaled top-left x
  y: number; // Scaled top-left y
  width: number; // Scaled width
  height: number; // Scaled height
  // No color or line width, as these are invisible areas
}

// Union type for all annotations
export type AnnotationObject =
  | TextAnnotation
  | PenAnnotation
  | ArrowAnnotation
  | BlurAnnotation
  | HighlighterAnnotation
  | RectangleAnnotation
  | EllipseAnnotation
  | StepAnnotation
  | SymbolAnnotation
  | FocusRectangleAnnotation;

// Custom CSS properties interface
import type { CSSProperties } from "react";

export interface DraggableCSSProperties extends CSSProperties {
  WebkitAppRegion?: "drag" | "no-drag";
}

// --- HubMenu Settings ---
export type HexagonColor = "blue" | "green" | "red" | "gray" | "default";

// --- NEW: External Application Types ---
export interface ExternalApplication {
  id: string;
  name: string;
  executablePath: string;
  arguments?: string[];
  workingDirectory?: string;
  icon?: string; // Path to icon file or base64 data
  color?: HexagonColor;
  isCustom: boolean; // Whether this was added by user vs detected
}

export interface HubMenuSettings {
  availableColors: HexagonColor[];
  preferredColors: HexagonColor[];
  menuOpacity: number; // 0-1
  autoHideDelay: number; // milliseconds
  enableColorCycling: boolean;
  maxHexagons: number;
  showLabels: boolean;
  hexagonSize: "small" | "medium" | "large";
  layoutStyle: "circular" | "grid"; // New option for layout style
  // Add support for external applications
  customApplications: ExternalApplication[];
  enableDragAndDrop: boolean;
}

// --- Network Mode Types ---
export type NetworkMode = "local" | "online";

export interface NetworkModeSettings {
  mode: NetworkMode;
  lastChanged: string; // UTC timestamp
  blockAllConnections: boolean; // When local, block all outgoing connections
}

// --- AppSettings Definition (Moved from manualSettingsStore.ts) ---
export interface AppSettings {
  saveFormat: "png" | "jpg";
  jpegQuality: number; // 1-100
  captureIncludeCursor: boolean;
  defaultPenColor: string;
  defaultPenSize: PenSize; // Uses PenSize from this file
  defaultTextColor: string;
  defaultTextSize: PenSize; // Uses PenSize from this file
  defaultHighlighterColor: string;
  defaultHighlighterSize: PenSize; // Uses PenSize from this file
  defaultStepColor: string;
  defaultStepSize: PenSize; // Uses PenSize from this file
  defaultTool: Tool; // Uses Tool from this file
  defaultBlurStrength: number; // Strength of the blur effect
  defaultBlurMode: "focus" | "spot"; // Uses BlurMode from this file (ensure BlurMode includes these)
  // Add hub menu settings
  hubMenu: HubMenuSettings;
  // Network mode settings - local/online toggle
  networkMode: NetworkModeSettings;
}

// --- NEW: WindowSource type (moved from preload.ts) ---
export interface WindowSource {
  id: string;
  name: string;
  thumbnailDataUrl: string;
  appIcon?: string;
}

// --- NEW: CapturerSourceWithPrimary for getScreenSources ---
// We need to import DesktopCapturerSource from Electron, or redefine its known properties
// For simplicity if direct import isn't feasible in this context, list common properties:
export interface CapturerSourceWithPrimary {
  id: string;
  name: string;
  thumbnail: Electron.NativeImage; // Or string if it's a data URL post-IPC
  display_id?: string;
  appIcon?: Electron.NativeImage; // Or string
  // Add other properties from Electron.DesktopCapturerSource if needed
  isPrimary: boolean; // The custom property
}
// --- Whiteboard/Drawing Tool Types ---

// Whiteboard tool types (extending existing Tool type)
export type WhiteboardTool =
  | "select"
  | "pen"
  | "rectangle"
  | "ellipse"
  | "arrow"
  | "line"
  | "text"
  | "image"
  | "eraser"
  | "hand";

// Eraser mode - delete whole object or erase area
export type EraserMode = "object" | "area";

// Whiteboard element base interface
export interface EraseMask {
  points: { x: number; y: number }[];
  radius: number;
}

export interface WhiteboardElement {
  id: string;
  type: WhiteboardTool;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  style: ElementStyle;
  createdAt: string; // UTC timestamp
  updatedAt: string; // UTC timestamp
  version: number;
  eraseMasks?: EraseMask[];
}

// Element style configuration
export interface ElementStyle {
  stroke: string; // color
  fill: string; // color or "transparent"
  strokeWidth: number;
  strokeDash: "solid" | "dashed" | "dotted";
  fontSize?: number | "s" | "m" | "l" | "xl"; // for text elements
  fontFamily?: "arial" | "times" | "courier" | "handwriting" | "comic"; // for text elements
  roughness?: number; // 0 = clean, 1+ = hand-drawn style (RoughJS)
}

// Specific element types
export interface PenElement extends WhiteboardElement {
  type: "pen";
  points: { x: number; y: number }[];
}

export interface RectangleElement extends WhiteboardElement {
  type: "rectangle";
  width: number;
  height: number;
}

export interface EllipseElement extends WhiteboardElement {
  type: "ellipse";
  width: number;
  height: number;
}

export interface ArrowElement extends WhiteboardElement {
  type: "arrow";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface LineElement extends WhiteboardElement {
  type: "line";
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export interface TextElement extends WhiteboardElement {
  type: "text";
  content: string;
  width: number;
  height: number;
}

export interface ImageElement extends WhiteboardElement {
  type: "image";
  src: string; // Base64 data URL or file path
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  aspectRatio: number;
}

// Union type for all drawable elements
export type DrawableElement = PenElement | RectangleElement | EllipseElement | ArrowElement | LineElement | TextElement | ImageElement;

// Whiteboard state interface
export interface WhiteboardState {
  elements: DrawableElement[];
  selectedIds: string[];
  currentTool: WhiteboardTool;
  history: {
    past: DrawableElement[][];
    present: DrawableElement[];
    future: DrawableElement[][];
  };
  canvasTransform: {
    x: number;
    y: number;
    zoom: number;
  };
  isDirty: boolean;
  lastSaved: string; // UTC timestamp
  sceneVersion: string; // revision ID
}

// Scene export/import format
export interface WhiteboardScene {
  version: string;
  elements: DrawableElement[];
  createdAt: string;
  updatedAt: string;
  metadata: {
    name?: string;
    description?: string;
  };
}

// --- End of type definitions ---
