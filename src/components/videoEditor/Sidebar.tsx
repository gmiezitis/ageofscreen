import React from 'react';
import { Trash2, Video, Music, FolderOpen, Image } from 'lucide-react';

interface SidebarProps {
    isCollapsed: boolean;
    mediaLibrary: Array<{ id: string; name: string; thumbnail?: string; type: 'video' | 'audio' | 'image' }>;
    onImport: (type: 'video' | 'audio' | 'image') => void;
    onDeleteLibraryItem: (id: string) => void;
    onDragStart: (e: React.DragEvent, id: string) => void;
    onItemClick: (id: string) => void;
    onClearLibrary?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = React.memo(({
    isCollapsed,
    mediaLibrary,
    onImport,
    onDeleteLibraryItem,
    onDragStart,
    onItemClick,
    onClearLibrary,
}) => {
    const handleLibraryItemClick = (item: { id: string; type: 'video' | 'audio' | 'image' }) => {
        if (item.type === 'video') {
            onItemClick(item.id);
        }
    };

    return (
        <div className={`editor-sidebar ${isCollapsed ? 'collapsed' : ''}`}>
            <div className="sidebar-header">
                <span className="sidebar-title">My Media</span>
                {onClearLibrary && mediaLibrary.length > 0 && (
                    <button className="sidebar-action" onClick={onClearLibrary} title="Clear all library files">
                        <Trash2 size={12} />
                    </button>
                )}
            </div>

            <div className="import-actions">
                <button className="import-btn video" onClick={() => onImport('video')} title="Import Video">
                    <Video size={14} />
                    <span>Video</span>
                </button>
                <div style={{ display: 'flex', gap: '4px' }}>
                    <button className="import-btn-small" onClick={() => onImport('image')} title="Import Picture">
                        <Image size={14} />
                    </button>
                    <button className="import-btn-small" onClick={() => onImport('audio')} title="Import Music">
                        <Music size={14} />
                    </button>
                </div>
            </div>

            <div className="media-library">
                {mediaLibrary.length === 0 ? (
                    <div className="library-empty">
                        <FolderOpen size={32} />
                        <span>Library is empty</span>
                    </div>
                ) : (
                    mediaLibrary.map(item => (
                        <div
                            key={item.id}
                            className="library-item"
                            draggable
                            onDragStart={(e) => onDragStart(e, item.id)}
                            onClick={() => handleLibraryItemClick(item)}
                        >
                            {item.thumbnail ? (
                                <img src={item.thumbnail} className="library-item-thumb" alt={item.name} />
                            ) : (
                                <div className="library-item-thumb" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2a2a32' }}>
                                    {item.type === 'video' ? <Video size={16} /> : item.type === 'audio' ? <Music size={16} /> : <Image size={16} />}
                                </div>
                            )}
                            <div className="library-item-name" style={{ fontSize: '10px', fontWeight: 500 }}>{item.name}</div>
                            <button className="library-item-delete" onClick={(e) => { e.stopPropagation(); onDeleteLibraryItem(item.id); }}>
                                <Trash2 size={10} />
                            </button>
                        </div>
                    ))
                )}
            </div>

        </div>
    );
});
