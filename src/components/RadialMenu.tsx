import React, { useMemo } from "react";
import {
    Maximize,
    Monitor,
    Target,
    Scissors,
    Camera,
    X,
    Video
} from "lucide-react";
import styles from "./RadialMenu.module.css";
import { HexagonColor } from "../types";
import { Simple3DHead } from "./Simple3DHead";

export interface RadialMenuTool {
    id: string;
    name: string;
    icon: React.ReactNode;
    color: HexagonColor | "orange";
    action: () => void;
}

interface RadialMenuProps {
    onHide: () => void;
    tools: RadialMenuTool[];
    centerAction?: () => void;
    centerIcon?: React.ReactNode;
}

const getHexagonPoints = (centerX: number, centerY: number, size: number): string => {
    let points = "";
    for (let i = 0; i < 6; i++) {
        const angle_deg = 60 * i - 30; // Pointy top
        const angle_rad = (Math.PI / 180) * angle_deg;
        const x = centerX + size * Math.cos(angle_rad);
        const y = centerY + size * Math.sin(angle_rad);
        points += `${x},${y} `;
    }
    return points.trim();
};

export const RadialMenu: React.FC<RadialMenuProps> = ({
    onHide,
    tools,
    centerAction,
    centerIcon = <Camera size={20} strokeWidth={1.5} />
}) => {
    // Canvas dimensions matching index.ts window size
    const centerX = 140;
    const centerY = 160;
    const hexSize = 40; // Reduced size to make the whole menu slightly smaller
    const spacing = hexSize * Math.sqrt(3); // Maintains seamless tiling
    const iconSize = 22; // Slightly smaller outer icons
    const centerIconSize = 20; // Re-added size for the middle icon

    const positions = useMemo(() => {
        const pos: { x: number, y: number }[] = [];
        for (let i = 0; i < 6; i++) {
            const angle = (360 / 6) * i;
            const angleRad = (Math.PI / 180) * angle;
            pos.push({
                x: centerX + spacing * Math.cos(angleRad),
                y: centerY + spacing * Math.sin(angleRad)
            });
        }
        return pos;
    }, [centerX, centerY, spacing]);

    return (
        <div className={styles.svgContainer} style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
            {/* 3D Head rendered OUTSIDE of SVG to prevent Chromium WebGL foreignObject event/repaint freezing */}
            <div style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                zIndex: 20,
                pointerEvents: 'none',
                filter: 'drop-shadow(0 4px 15px rgba(255,255,255,0.4))',
                display: 'flex', // prevents inline canvas 4px layout shift!
                justifyContent: 'center',
                alignItems: 'center'
            }}>
                <Simple3DHead size={52} />
            </div>

            <svg width="280" height="320" viewBox="0 0 280 320" style={{ filter: 'drop-shadow(0 10px 40px rgba(0,0,0,0.6))', display: 'block' }}>

                {/* Center Hexagon Group */}
                <g className={styles.hexGroup} onClick={centerAction}>
                    <polygon
                        points={getHexagonPoints(centerX, centerY, hexSize)}
                        className={`${styles.hexagon} ${styles.centerHexagon}`}
                    />

                    {/* Center point hover receptor */}
                    <circle cx={centerX} cy={centerY} r={32} fill="transparent" />
                    
                    {/* Center Hover Label */}
                    <text x={centerX} y={centerY + 26} textAnchor="middle" className={styles.hexLabel}>
                        Camera
                    </text>
                </g>

                {/* Surrounding Hexagons */}
                {tools.map((tool, i) => {
                    const pos = positions[i];
                    if (!pos) return null;

                    return (
                        <g key={tool.id} className={styles.hexGroup} onClick={tool.action}>
                            <polygon
                                points={getHexagonPoints(pos.x, pos.y, hexSize)}
                                className={styles.hexagon}
                                data-color={tool.color}
                            />
                            {/* Icon centered perfectly in hexagon with large bounds to prevent clipping on hover transform */}
                            <foreignObject
                                x={pos.x - 25}
                                y={pos.y - 25}
                                width={50}
                                height={50}
                            >
                                <div className={styles.hexIcon} style={{ width: '100%', height: '100%' }}>
                                    {tool.icon}
                                </div>
                            </foreignObject>
                            {/* Label inside hexagon */}
                            <text x={pos.x} y={pos.y + 18} textAnchor="middle" className={styles.hexLabel}>
                                {tool.name}
                            </text>
                        </g>
                    );
                })}

                {/* Close Button Slot */}
                {tools.length < 6 && (
                    <g className={styles.hexGroup} onClick={onHide}>
                        <polygon
                            points={getHexagonPoints(positions[5].x, positions[5].y, hexSize)}
                            className={styles.hexagon}
                            data-color="gray"
                        />
                        <foreignObject
                            x={positions[5].x - 25}
                            y={positions[5].y - 25}
                            width={50}
                            height={50}
                        >
                            <div className={styles.hexIcon} style={{ width: '100%', height: '100%', opacity: 0.5 }}>
                                <X size={iconSize} strokeWidth={1.5} />
                            </div>
                        </foreignObject>
                        <text x={positions[5].x} y={positions[5].y + 18} textAnchor="middle" className={styles.hexLabel}>
                            Close
                        </text>
                    </g>
                )}
            </svg>
        </div>
    );
};
