export const CAMERA_SHAPES = ['circle', 'pill', 'square', 'heart', 'hexagon', 'romb'] as const;

export type CameraShape = (typeof CAMERA_SHAPES)[number];

type CameraShapePoint = readonly [number, number];

const CAMERA_SHAPE_POLYGONS: Partial<Record<CameraShape, readonly CameraShapePoint[]>> = {
    heart: [
        [0.50, 0.95],
        [0.39, 0.87],
        [0.29, 0.79],
        [0.19, 0.69],
        [0.10, 0.56],
        [0.06, 0.40],
        [0.09, 0.24],
        [0.18, 0.12],
        [0.30, 0.06],
        [0.43, 0.10],
        [0.50, 0.20],
        [0.57, 0.10],
        [0.70, 0.06],
        [0.82, 0.12],
        [0.91, 0.24],
        [0.94, 0.40],
        [0.90, 0.56],
        [0.81, 0.69],
        [0.71, 0.79],
        [0.61, 0.87],
    ],
    hexagon: [
        [0.50, 0.04],
        [0.90, 0.27],
        [0.90, 0.73],
        [0.50, 0.96],
        [0.10, 0.73],
        [0.10, 0.27],
    ],
    romb: [
        [0.50, 0.00],
        [1.00, 0.50],
        [0.50, 1.00],
        [0.00, 0.50],
    ],
};

const roundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
) => {
    const safeRadius = Math.max(0, Math.min(radius, Math.min(width, height) / 2));
    if ((ctx as any).roundRect) {
        (ctx as any).roundRect(x, y, width, height, safeRadius);
        return;
    }

    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.arcTo(x + width, y, x + width, y + safeRadius, safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.arcTo(x + width, y + height, x + width - safeRadius, y + height, safeRadius);
    ctx.lineTo(x + safeRadius, y + height);
    ctx.arcTo(x, y + height, x, y + height - safeRadius, safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.arcTo(x, y, x + safeRadius, y, safeRadius);
    ctx.closePath();
};

const tracePolygonPath = (
    ctx: CanvasRenderingContext2D,
    points: readonly CameraShapePoint[],
    x: number,
    y: number,
    width: number,
    height: number,
) => {
    if (points.length === 0) return;

    ctx.moveTo(x + points[0][0] * width, y + points[0][1] * height);
    for (let i = 1; i < points.length; i += 1) {
        ctx.lineTo(x + points[i][0] * width, y + points[i][1] * height);
    }
    ctx.closePath();
};

export const normalizeCameraShape = (shape: unknown): CameraShape => {
    switch (shape) {
        case 'pill':
        case 'square':
        case 'heart':
        case 'hexagon':
        case 'circle':
        case 'romb':
            return shape;
        case 'rounded':
            return 'square';
        case 'diamond':
            return 'romb';
        case 'arrow':
        case 'wand':
            return 'hexagon';
        default:
            return 'circle';
    }
};

export const getCameraAspectRatio = (shape: CameraShape): number => (
    normalizeCameraShape(shape) === 'pill' ? 1.7 : 1
);

export const getCameraDimensionsForWidth = (
    shape: CameraShape,
    width: number,
): { width: number; height: number } => {
    const safeWidth = Math.max(1, Math.round(width));
    return {
        width: safeWidth,
        height: Math.max(1, Math.round(safeWidth / getCameraAspectRatio(shape))),
    };
};

export const getCameraBorderRadius = (shape: CameraShape): string => {
    switch (normalizeCameraShape(shape)) {
        case 'circle':
            return '50%';
        case 'pill':
            return '9999px';
        case 'square':
            return '18px';
        default:
            return '0';
    }
};

export const getCameraClipPath = (shape: CameraShape): string | undefined => {
    const points = CAMERA_SHAPE_POLYGONS[normalizeCameraShape(shape)];
    if (!points) return undefined;
    return `polygon(${points.map(([px, py]) => `${px * 100}% ${py * 100}%`).join(', ')})`;
};

export const getCameraShapeStyle = (shape: CameraShape): Record<string, string> => {
    const normalizedShape = normalizeCameraShape(shape);
    const clipPath = getCameraClipPath(normalizedShape);
    return {
        borderRadius: getCameraBorderRadius(normalizedShape),
        ...(clipPath ? { clipPath, WebkitClipPath: clipPath } : {}),
    };
};

export const traceCameraShapePath = (
    ctx: CanvasRenderingContext2D,
    shape: CameraShape,
    x: number,
    y: number,
    width: number,
    height: number,
) => {
    const normalizedShape = normalizeCameraShape(shape);

    if (normalizedShape === 'circle') {
        ctx.ellipse(x + width / 2, y + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
        return;
    }

    if (normalizedShape === 'pill') {
        roundRect(ctx, x, y, width, height, height / 2);
        return;
    }

    if (normalizedShape === 'square') {
        roundRect(ctx, x, y, width, height, Math.min(width, height) * 0.18);
        return;
    }

    tracePolygonPath(
        ctx,
        CAMERA_SHAPE_POLYGONS[normalizedShape] || CAMERA_SHAPE_POLYGONS.heart || [],
        x,
        y,
        width,
        height,
    );
};
