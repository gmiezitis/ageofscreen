import React from 'react';
import { Sparkles, Maximize2, Scan, RotateCcw, Wind, Focus } from 'lucide-react';
import { SmartEffect } from '../../../videoEditor/types';
import { getSmartEffectLabel } from '../../../videoEditor/utils';

const EFFECT_ICONS: Record<string, React.FC<{ size: number }>> = {
    zoom: Maximize2,
    blur_area: Scan,
    '3d_tilt': Sparkles,
    card_flip: RotateCcw,
    breathing: Wind,
    slow_zoom: Focus,
};

interface Props {
    effects: SmartEffect[];
}

const EffectBadges: React.FC<Props> = ({ effects }) => {
    if (effects.length === 0) return null;
    return (
        <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 4, zIndex: 50 }}>
            {effects.map(fx => {
                const Icon = EFFECT_ICONS[fx.type];
                return (
                    <div key={fx.id} style={{ background: 'rgba(0,0,0,0.6)', padding: '4px 8px', borderRadius: 4, fontSize: 10, color: 'white', display: 'flex', alignItems: 'center', gap: 4 }}>
                        {Icon && <Icon size={10} />}
                        {getSmartEffectLabel(fx.type, fx.label)}
                    </div>
                );
            })}
        </div>
    );
};

export default EffectBadges;
