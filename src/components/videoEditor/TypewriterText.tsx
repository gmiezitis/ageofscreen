import React, { useState, useEffect } from 'react';

interface TypewriterTextProps {
    text: string;
    speed?: number;
    delay?: number;
    className?: string;
    style?: React.CSSProperties;
}

export const TypewriterText: React.FC<TypewriterTextProps> = ({
    text,
    speed = 50,
    delay = 0,
    className,
    style
}) => {
    const [displayText, setDisplayText] = useState('');
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        setDisplayText('');
        setCurrentIndex(0);

        const timeout = setTimeout(() => {
            const interval = setInterval(() => {
                setCurrentIndex(prev => {
                    if (prev >= text.length) {
                        clearInterval(interval);
                        return prev;
                    }
                    return prev + 1;
                });
            }, speed);
            return () => clearInterval(interval);
        }, delay);

        return () => clearTimeout(timeout);
    }, [text, speed, delay]);

    useEffect(() => {
        setDisplayText(text.substring(0, currentIndex));
    }, [currentIndex, text]);

    return (
        <div className={className} style={{ ...style, fontFamily: "'Courier New', Courier, monospace" }}>
            {displayText}
            <span className="cursor" style={{ opacity: currentIndex < text.length ? 1 : 0, transition: 'opacity 0.2s' }}>|</span>
        </div>
    );
};
