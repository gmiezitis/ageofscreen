import React from 'react';

interface UnsavedChangesDialogProps {
    open: boolean;
    title: string;
    message: string;
    saveLabel: string;
    onSave: () => void;
    onDiscard: () => void;
    onCancel: () => void;
    isSaving?: boolean;
}

export const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
    open,
    title,
    message,
    saveLabel,
    onSave,
    onDiscard,
    onCancel,
    isSaving = false,
}) => {
    if (!open) {
        return null;
    }

    return (
        <div
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 12000,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(2, 6, 23, 0.58)',
                backdropFilter: 'blur(10px)',
                padding: 24,
            }}
        >
            <div
                style={{
                    width: 'min(460px, 100%)',
                    borderRadius: 20,
                    background: 'rgba(15, 23, 42, 0.96)',
                    border: '1px solid rgba(148, 163, 184, 0.18)',
                    boxShadow: '0 28px 90px rgba(2, 6, 23, 0.5)',
                    padding: 24,
                    color: '#f8fafc',
                }}
            >
                <div style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em', marginBottom: 10 }}>
                    {title}
                </div>
                <div style={{ fontSize: 14, lineHeight: 1.6, color: 'rgba(226, 232, 240, 0.9)', marginBottom: 22 }}>
                    {message}
                </div>

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isSaving}
                        style={{
                            borderRadius: 999,
                            border: '1px solid rgba(148, 163, 184, 0.24)',
                            background: 'transparent',
                            color: '#cbd5e1',
                            padding: '10px 16px',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: isSaving ? 'not-allowed' : 'pointer',
                        }}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onDiscard}
                        disabled={isSaving}
                        style={{
                            borderRadius: 999,
                            border: '1px solid rgba(248, 113, 113, 0.25)',
                            background: 'rgba(127, 29, 29, 0.2)',
                            color: '#fecaca',
                            padding: '10px 16px',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: isSaving ? 'not-allowed' : 'pointer',
                        }}
                    >
                        Don't Save
                    </button>
                    <button
                        type="button"
                        onClick={onSave}
                        disabled={isSaving}
                        style={{
                            borderRadius: 999,
                            border: '1px solid rgba(96, 165, 250, 0.28)',
                            background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.95), rgba(59, 130, 246, 0.95))',
                            color: '#eff6ff',
                            padding: '10px 16px',
                            fontSize: 13,
                            fontWeight: 700,
                            cursor: isSaving ? 'wait' : 'pointer',
                            boxShadow: '0 12px 26px rgba(37, 99, 235, 0.25)',
                        }}
                    >
                        {isSaving ? 'Saving...' : saveLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
