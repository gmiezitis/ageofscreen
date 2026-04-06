import type { TextOverlay } from './types';
import { isNoOpCrop } from './useCrop';

type FrameSize = {
    width: number;
    height: number;
};

type CropRect = {
    x: number;
    y: number;
    width: number;
    height: number;
} | null | undefined;

type ExportFrameStyleInput = {
    selectedPlatform?: string | null;
    backgroundColor?: string | null;
    videoPadding?: number | null;
};

type ExportFrameStyleOutput = {
    backgroundColor: string;
    videoPadding: number;
};

type ContainerFrameSize = {
    width: number;
    height: number;
} | null | undefined;

const clampDimension = (value: number, fallback: number) => {
    const rounded = Math.round(value);
    return Number.isFinite(rounded) && rounded > 0 ? rounded : fallback;
};

const normalizeHexLikeBackground = (value: string | null | undefined): string => (
    (value || '').trim().toLowerCase()
);

const isNeutralEdgeToEdgeBackground = (value: string | null | undefined): boolean => {
    const normalized = normalizeHexLikeBackground(value);
    return (
        !normalized
        || normalized === 'transparent'
        || normalized === '#000'
        || normalized === '#000000'
        || normalized === '#00000000'
        || normalized === '#020617'
        || normalized === '#0f172a'
        || normalized === '#111827'
    );
};

export const getRenderedVideoFrameSize = (
    sourceFrameSize: FrameSize | null | undefined,
    cropRect?: CropRect,
): FrameSize | null => {
    if (!sourceFrameSize || sourceFrameSize.width <= 0 || sourceFrameSize.height <= 0) {
        return null;
    }

    if (!cropRect || isNoOpCrop(cropRect)) {
        return {
            width: clampDimension(sourceFrameSize.width, 1),
            height: clampDimension(sourceFrameSize.height, 1),
        };
    }

    return {
        width: clampDimension(sourceFrameSize.width * (cropRect.width / 100), 1),
        height: clampDimension(sourceFrameSize.height * (cropRect.height / 100), 1),
    };
};

export const resolveExportFrameStyle = ({
    selectedPlatform,
    backgroundColor,
    videoPadding,
}: ExportFrameStyleInput): ExportFrameStyleOutput => {
    const isOriginalPlatform = selectedPlatform === 'original';
    const isNeutralBackground = isNeutralEdgeToEdgeBackground(backgroundColor);

    if (isOriginalPlatform && isNeutralBackground) {
        return {
            backgroundColor: 'transparent',
            videoPadding: 0,
        };
    }

    const safePadding = Math.max(0, Math.round(videoPadding || 0));
    const safeBackgroundColor = backgroundColor?.trim() || '#000000';

    return {
        backgroundColor: safeBackgroundColor,
        videoPadding: safePadding,
    };
};

export const getPreviewOverlayFrameSize = (
    displayedSourceFrameSize: FrameSize | null | undefined,
    containerFrameSize: ContainerFrameSize,
    cropRect?: CropRect,
): FrameSize | null => {
    if (
        !displayedSourceFrameSize
        || displayedSourceFrameSize.width <= 0
        || displayedSourceFrameSize.height <= 0
    ) {
        return null;
    }

    if (!cropRect || isNoOpCrop(cropRect)) {
        return {
            width: clampDimension(displayedSourceFrameSize.width, 1),
            height: clampDimension(displayedSourceFrameSize.height, 1),
        };
    }

    const cropWidth = displayedSourceFrameSize.width * (cropRect.width / 100);
    const cropHeight = displayedSourceFrameSize.height * (cropRect.height / 100);
    if (cropWidth <= 0 || cropHeight <= 0) {
        return {
            width: clampDimension(displayedSourceFrameSize.width, 1),
            height: clampDimension(displayedSourceFrameSize.height, 1),
        };
    }

    if (
        !containerFrameSize
        || containerFrameSize.width <= 0
        || containerFrameSize.height <= 0
    ) {
        return {
            width: clampDimension(cropWidth, 1),
            height: clampDimension(cropHeight, 1),
        };
    }

    const scale = Math.min(
        containerFrameSize.width / cropWidth,
        containerFrameSize.height / cropHeight,
    );

    return {
        width: clampDimension(cropWidth * scale, 1),
        height: clampDimension(cropHeight * scale, 1),
    };
};

export const scaleTextOverlayForExport = (
    overlay: TextOverlay,
    editorFrameSize: FrameSize | null | undefined,
    renderFrameSize: FrameSize | null | undefined,
): TextOverlay => {
    if (
        !editorFrameSize
        || !renderFrameSize
        || editorFrameSize.width <= 0
        || editorFrameSize.height <= 0
        || renderFrameSize.width <= 0
        || renderFrameSize.height <= 0
    ) {
        return { ...overlay };
    }

    const widthScale = renderFrameSize.width / editorFrameSize.width;
    const heightScale = renderFrameSize.height / editorFrameSize.height;
    const scalarScale = Math.min(widthScale, heightScale);
    const scaleScalarValue = (value: number | undefined, minValue = 0) => (
        value == null
            ? value
            : Math.max(minValue, Math.round(value * scalarScale))
    );
    const scaleXValue = (value: number | undefined) => (
        value == null
            ? value
            : Math.round(value * widthScale)
    );
    const scaleYValue = (value: number | undefined) => (
        value == null
            ? value
            : Math.round(value * heightScale)
    );

    return {
        ...overlay,
        fontSize: Math.max(10, Math.round(overlay.fontSize * scalarScale)),
        padding: scaleScalarValue(overlay.padding, 0),
        borderWidth: scaleScalarValue(overlay.borderWidth, 0),
        shadowOffsetX: scaleXValue(overlay.shadowOffsetX),
        shadowOffsetY: scaleYValue(overlay.shadowOffsetY),
        shadowBlur: scaleScalarValue(overlay.shadowBlur, 0),
    };
};
