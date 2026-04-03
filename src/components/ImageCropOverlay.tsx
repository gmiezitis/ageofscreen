import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

type CropSelection = {
    x: number;
    y: number;
    width: number;
    height: number;
};

type CropHandle = "move" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

interface ImageCropOverlayProps {
    selection: CropSelection | null;
    imageWidth: number;
    imageHeight: number;
    displayWidth: number;
    displayHeight: number;
    onSelectionChange: (selection: CropSelection) => void;
}

const MIN_CROP_SIZE = 32;
const HANDLE_SIZE = 12;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const normalizeSelection = (
    selection: CropSelection,
    imageWidth: number,
    imageHeight: number,
): CropSelection => {
    const maxX = Math.max(0, imageWidth - MIN_CROP_SIZE);
    const maxY = Math.max(0, imageHeight - MIN_CROP_SIZE);
    const x = clamp(selection.x, 0, maxX);
    const y = clamp(selection.y, 0, maxY);
    const width = clamp(selection.width, MIN_CROP_SIZE, Math.max(MIN_CROP_SIZE, imageWidth - x));
    const height = clamp(selection.height, MIN_CROP_SIZE, Math.max(MIN_CROP_SIZE, imageHeight - y));
    return { x, y, width, height };
};

export const ImageCropOverlay: React.FC<ImageCropOverlayProps> = ({
    selection,
    imageWidth,
    imageHeight,
    displayWidth,
    displayHeight,
    onSelectionChange,
}) => {
    const [draftSelection, setDraftSelection] = useState<CropSelection | null>(selection);
    const draftSelectionRef = useRef<CropSelection | null>(selection);
    const dragStateRef = useRef<{
        handle: CropHandle;
        startClientX: number;
        startClientY: number;
        startSelection: CropSelection;
    } | null>(null);

    useEffect(() => {
        setDraftSelection(selection);
        draftSelectionRef.current = selection;
    }, [selection]);

    const scaleX = imageWidth > 0 ? displayWidth / imageWidth : 1;
    const scaleY = imageHeight > 0 ? displayHeight / imageHeight : 1;

    const box = useMemo(() => {
        if (!draftSelection) return null;

        return {
            left: draftSelection.x * scaleX,
            top: draftSelection.y * scaleY,
            width: draftSelection.width * scaleX,
            height: draftSelection.height * scaleY,
        };
    }, [draftSelection, scaleX, scaleY]);

    const updateDraftSelection = useCallback((nextSelection: CropSelection) => {
        const normalized = normalizeSelection(nextSelection, imageWidth, imageHeight);
        draftSelectionRef.current = normalized;
        setDraftSelection(normalized);
    }, [imageHeight, imageWidth]);

    const commitDraftSelection = useCallback((nextSelection: CropSelection | null) => {
        if (!nextSelection) return;
        const normalized = normalizeSelection(nextSelection, imageWidth, imageHeight);
        draftSelectionRef.current = normalized;
        setDraftSelection(normalized);
        onSelectionChange(normalized);
    }, [imageHeight, imageWidth, onSelectionChange]);

    const startDrag = useCallback((event: React.MouseEvent<HTMLDivElement>, handle: CropHandle) => {
        if (!draftSelectionRef.current || !displayWidth || !displayHeight || !imageWidth || !imageHeight) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        dragStateRef.current = {
            handle,
            startClientX: event.clientX,
            startClientY: event.clientY,
            startSelection: draftSelectionRef.current,
        };

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const dragState = dragStateRef.current;
            if (!dragState) return;

            const deltaX = (moveEvent.clientX - dragState.startClientX) / scaleX;
            const deltaY = (moveEvent.clientY - dragState.startClientY) / scaleY;
            const start = dragState.startSelection;
            let nextSelection = { ...start };

            if (dragState.handle === "move") {
                nextSelection.x = clamp(start.x + deltaX, 0, imageWidth - start.width);
                nextSelection.y = clamp(start.y + deltaY, 0, imageHeight - start.height);
            } else if (dragState.handle === "top-left") {
                nextSelection.x = clamp(start.x + deltaX, 0, start.x + start.width - MIN_CROP_SIZE);
                nextSelection.y = clamp(start.y + deltaY, 0, start.y + start.height - MIN_CROP_SIZE);
                nextSelection.width = start.width - (nextSelection.x - start.x);
                nextSelection.height = start.height - (nextSelection.y - start.y);
            } else if (dragState.handle === "top-right") {
                nextSelection.y = clamp(start.y + deltaY, 0, start.y + start.height - MIN_CROP_SIZE);
                nextSelection.width = clamp(start.width + deltaX, MIN_CROP_SIZE, imageWidth - start.x);
                nextSelection.height = start.height - (nextSelection.y - start.y);
            } else if (dragState.handle === "bottom-left") {
                nextSelection.x = clamp(start.x + deltaX, 0, start.x + start.width - MIN_CROP_SIZE);
                nextSelection.width = start.width - (nextSelection.x - start.x);
                nextSelection.height = clamp(start.height + deltaY, MIN_CROP_SIZE, imageHeight - start.y);
            } else if (dragState.handle === "bottom-right") {
                nextSelection.width = clamp(start.width + deltaX, MIN_CROP_SIZE, imageWidth - start.x);
                nextSelection.height = clamp(start.height + deltaY, MIN_CROP_SIZE, imageHeight - start.y);
            }

            updateDraftSelection(nextSelection);
        };

        const handleMouseUp = () => {
            commitDraftSelection(draftSelectionRef.current);
            dragStateRef.current = null;
            window.removeEventListener("mousemove", handleMouseMove);
            window.removeEventListener("mouseup", handleMouseUp);
        };

        window.addEventListener("mousemove", handleMouseMove);
        window.addEventListener("mouseup", handleMouseUp);
    }, [commitDraftSelection, displayHeight, displayWidth, imageHeight, imageWidth, scaleX, scaleY, updateDraftSelection]);

    if (!box || !displayWidth || !displayHeight) {
        return null;
    }

    const handleOffset = HANDLE_SIZE / 2;
    const overlayColor = "rgba(15, 23, 42, 0.46)";

    return (
        <div
            style={{
                position: "absolute",
                inset: 0,
                zIndex: 30,
                pointerEvents: "none",
            }}
        >
            <div style={{ position: "absolute", left: 0, top: 0, width: "100%", height: box.top, background: overlayColor }} />
            <div style={{ position: "absolute", left: 0, top: box.top + box.height, width: "100%", height: Math.max(0, displayHeight - box.top - box.height), background: overlayColor }} />
            <div style={{ position: "absolute", left: 0, top: box.top, width: box.left, height: box.height, background: overlayColor }} />
            <div style={{ position: "absolute", left: box.left + box.width, top: box.top, width: Math.max(0, displayWidth - box.left - box.width), height: box.height, background: overlayColor }} />

            <div
                style={{
                    position: "absolute",
                    left: box.left,
                    top: box.top,
                    width: box.width,
                    height: box.height,
                    border: "2px solid #ffffff",
                    boxSizing: "border-box",
                    cursor: "move",
                    pointerEvents: "auto",
                    boxShadow: "0 0 0 1px rgba(15, 23, 42, 0.12)",
                }}
                onMouseDown={(event) => startDrag(event, "move")}
            />

            {[
                { handle: "top-left" as const, left: box.left - handleOffset, top: box.top - handleOffset, cursor: "nwse-resize" },
                { handle: "top-right" as const, left: box.left + box.width - handleOffset, top: box.top - handleOffset, cursor: "nesw-resize" },
                { handle: "bottom-left" as const, left: box.left - handleOffset, top: box.top + box.height - handleOffset, cursor: "nesw-resize" },
                { handle: "bottom-right" as const, left: box.left + box.width - handleOffset, top: box.top + box.height - handleOffset, cursor: "nwse-resize" },
            ].map((handle) => (
                <div
                    key={handle.handle}
                    style={{
                        position: "absolute",
                        left: handle.left,
                        top: handle.top,
                        width: HANDLE_SIZE,
                        height: HANDLE_SIZE,
                        borderRadius: 2,
                        background: "#ffffff",
                        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.45)",
                        cursor: handle.cursor,
                        pointerEvents: "auto",
                    }}
                    onMouseDown={(event) => startDrag(event, handle.handle)}
                />
            ))}
        </div>
    );
};

export default ImageCropOverlay;
