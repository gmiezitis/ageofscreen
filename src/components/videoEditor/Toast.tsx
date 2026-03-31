import React from 'react';
import { Check, Zap, X, Loader2 } from 'lucide-react';

interface ToastProps {
    notification: {
        type: 'success' | 'warning' | 'error' | 'info';
        title: string;
        message: string;
    } | null;
    onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ notification, onClose }) => {
    if (!notification) return null;

    const getIconBg = () => {
        switch (notification.type) {
            case 'success': return 'rgba(122, 179, 128, 0.15)';
            case 'error': return 'rgba(201, 113, 113, 0.15)';
            case 'info': return 'rgba(100, 150, 200, 0.15)';
            default: return 'rgba(212, 165, 116, 0.15)';
        }
    };

    return (
        <div
            className={`toast-container toast-${notification.type}`}
            style={{
                position: 'fixed',
                bottom: 32,
                left: '50%',
                transform: 'translateX(-50%)',
                minWidth: 280,
                background: 'rgba(32, 32, 38, 0.85)',
                backdropFilter: 'blur(20px)',
                borderRadius: '12px',
                padding: '12px 16px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 10000,
                animation: 'toastAppear 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
                display: 'flex',
                alignItems: 'center',
                gap: 12
            }}
        >
            <div style={{
                width: 32,
                height: 32,
                borderRadius: '8px',
                background: getIconBg(),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
            }}>
                {notification.type === 'success' && <Check size={16} color="#7ab380" />}
                {notification.type === 'warning' && <Zap size={16} color="#d4a574" />}
                {notification.type === 'error' && <X size={16} color="#c97171" />}
                {notification.type === 'info' && <Loader2 size={16} color="#6496c8" style={{ animation: 'spin 1s linear infinite' }} />}
            </div>

            <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--text-primary)', fontSize: '12.5px', fontWeight: 500, letterSpacing: '-0.01em' }}>
                    {notification.message}
                </div>
            </div>

            <button
                onClick={onClose}
                style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: 4,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}
            >
                <X size={14} />
            </button>
        </div>
    );
};
