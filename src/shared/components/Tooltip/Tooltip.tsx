import React, { useState, useRef, useEffect } from 'react';
import styles from './Tooltip.module.css';

export type TooltipPosition = 'top' | 'bottom' | 'left' | 'right';

export interface TooltipProps {
    content: React.ReactNode;
    position?: TooltipPosition;
    delay?: number;
    children: React.ReactElement;
    shortcut?: string;
}

export const Tooltip: React.FC<TooltipProps> = ({
    content,
    position = 'bottom',
    delay = 500,
    children,
    shortcut,
}) => {
    const [isVisible, setIsVisible] = useState(false);
    const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
    const triggerRef = useRef<HTMLDivElement>(null);

    const handleMouseEnter = () => {
        timeoutRef.current = setTimeout(() => {
            setIsVisible(true);
        }, delay);
    };

    const handleMouseLeave = () => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = undefined;
        }
        setIsVisible(false);
    };

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return (
        <div
            ref={triggerRef}
            className={styles.tooltipTrigger}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}
            {isVisible && (
                <div className={`${styles.tooltip} ${styles[position]}`}>
                    <div className={styles.tooltipContent}>
                        <div className={styles.tooltipText}>{content}</div>
                        {shortcut && (
                            <div className={styles.tooltipShortcut}>{shortcut}</div>
                        )}
                    </div>
                    <div className={styles.tooltipArrow} />
                </div>
            )}
        </div>
    );
};
