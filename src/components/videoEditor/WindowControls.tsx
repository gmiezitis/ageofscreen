import React from 'react';
import { X } from 'lucide-react';

interface WindowControlsProps {
    isMaximized: boolean;
    onMaximize: () => void;
    onMinimize: () => void;
    onClose: () => void;
}

const btnBase: React.CSSProperties = {
    background: 'transparent', border: 'none', color: 'var(--text-muted)',
    width: '40px', height: '32px', display: 'flex', alignItems: 'center',
    justifyContent: 'center', cursor: 'pointer', transition: 'background 0.15s, color 0.15s',
};

export const WindowControls: React.FC<WindowControlsProps> = ({ isMaximized, onMaximize, onMinimize, onClose }) => (
    <>
        <button onClick={onMinimize} title="Minimize"
            style={{ ...btnBase, WebkitAppRegion: 'no-drag' } as any}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="10" width="8" height="1.2" fill="currentColor" /></svg>
        </button>

        <button onClick={onMaximize} title={isMaximized ? 'Restore' : 'Maximize'}
            style={{ ...btnBase, WebkitAppRegion: 'no-drag' } as any}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
            {isMaximized ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="4" width="6" height="6" stroke="currentColor" strokeWidth="1.2" fill="none" /><path d="M4 4V2H10V8H8" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
            ) : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="1" width="10" height="10" stroke="currentColor" strokeWidth="1.2" fill="none" /></svg>
            )}
        </button>

        <button onClick={onClose} title="Close"
            style={{ ...btnBase, WebkitAppRegion: 'no-drag' } as any}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#e81123'; e.currentTarget.style.color = '#fff'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-muted)'; }}>
            <X size={16} />
        </button>
    </>
);
