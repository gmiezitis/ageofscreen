import React from 'react';

import bgFluidContours from '../../assets/backgrounds/bg_fluid_contours.png';
import bgGeometricFolds from '../../assets/backgrounds/bg_geometric_folds.png';
import bgObsidianTerrain from '../../assets/backgrounds/bg_obsidian_terrain.png';
import bgWavyGrid from '../../assets/backgrounds/bg_wavy_grid.png';
import bgNeonPulse from '../../assets/backgrounds/bg_neon_pulse.png';
import bgGraphiteDunes from '../../assets/backgrounds/bg_graphite_dunes.png';
import bgTitaniumCurves from '../../assets/backgrounds/bg_titanium_curves.png';
import bgEtherealSmoke from '../../assets/backgrounds/bg_ethereal_smoke.png';
import bgAuroraDark from '../../assets/backgrounds/bg_aurora_dark.png';
import bgVelvetShadow from '../../assets/backgrounds/bg_velvet_shadow.png';
import bgAbyssalWaves from '../../assets/backgrounds/bg_abyssal_waves.png';
import bgLunarDust from '../../assets/backgrounds/bg_lunar_dust.png';
import bgCosmicWeb from '../../assets/backgrounds/bg_cosmic_web.png';
import bgSilentVoid from '../../assets/backgrounds/bg_silent_void.png';
import bgMetallicMesh from '../../assets/backgrounds/bg_metallic_mesh.png';
import bgStarlightBlur from '../../assets/backgrounds/bg_starlight_blur.png';
import bgDeepOceanGlow from '../../assets/backgrounds/bg_deep_ocean_glow.png';

const SOLID_COLORS = [
    { name: 'Dark', value: '#000000' },
    { name: 'Charcoal', value: '#1a1a1f' },
    { name: 'Slate', value: '#2d3748' },
    { name: 'Ocean', value: '#1e3a5f' },
    { name: 'Forest', value: '#1a3d2e' },
    { name: 'Wine', value: '#4a1c2e' },
    { name: 'Warm Gray', value: '#44403c' },
    { name: 'Cream', value: '#f5f5f0' },
    { name: 'White', value: '#ffffff' },
    { name: 'Midnight', value: '#0f0c29' },
];

const GRADIENTS = [
    { name: 'Midnight', value: 'gradient_midnight', colors: ['#0a0f1e', '#162140'] },
    { name: 'Obsidian', value: 'gradient_obsidian', colors: ['#0d1117', '#1c2432'] },
    { name: 'Indigo', value: 'gradient_indigo', colors: ['#0f0a2a', '#1e1258'] },
    { name: 'Violet', value: 'gradient_violet', colors: ['#13111f', '#221a3a'] },
    { name: 'Oxide', value: 'gradient_oxide', colors: ['#180a0a', '#2d1010'] },
    { name: 'Forest', value: 'gradient_forest', colors: ['#091812', '#122d1a'] },
    { name: 'Carbon', value: 'gradient_carbon', colors: ['#18181b', '#27272a'] },
    { name: 'Space', value: 'gradient_space', colors: ['#0d0d0d', '#0d0d1a', '#16213e'] },
];

const CINEMATIC = [
    { name: 'Geometric Folds', value: 'bg_geometric_folds', image: bgGeometricFolds },
    { name: 'Wavy Grid', value: 'bg_wavy_grid', image: bgWavyGrid },
    { name: 'Fluid Contours', value: 'bg_fluid_contours', image: bgFluidContours },
    { name: 'Abyssal Waves', value: 'bg_abyssal_waves', image: bgAbyssalWaves },
    { name: 'Obsidian Terrain', value: 'bg_obsidian_terrain', image: bgObsidianTerrain },
    { name: 'Neon Pulse', value: 'bg_neon_pulse', image: bgNeonPulse },
    { name: 'Graphite Dunes', value: 'bg_graphite_dunes', image: bgGraphiteDunes },
    { name: 'Titanium Curves', value: 'bg_titanium_curves', image: bgTitaniumCurves },
    { name: 'Ethereal Smoke', value: 'bg_ethereal_smoke', image: bgEtherealSmoke },
    { name: 'Aurora Dark', value: 'bg_aurora_dark', image: bgAuroraDark },
    { name: 'Velvet Shadow', value: 'bg_velvet_shadow', image: bgVelvetShadow },
    { name: 'Lunar Dust', value: 'bg_lunar_dust', image: bgLunarDust },
    { name: 'Cosmic Web', value: 'bg_cosmic_web', image: bgCosmicWeb },
    { name: 'Silent Void', value: 'bg_silent_void', image: bgSilentVoid },
    { name: 'Metallic Mesh', value: 'bg_metallic_mesh', image: bgMetallicMesh },
    { name: 'Starlight Blur', value: 'bg_starlight_blur', image: bgStarlightBlur },
    { name: 'Deep Ocean Glow', value: 'bg_deep_ocean_glow', image: bgDeepOceanGlow },
];

interface BackgroundPickerProps {
    backgroundColor: string;
    setBackgroundColor: (c: string) => void;
    videoPadding: number;
    setVideoPadding?: (v: number) => void;
}

const sectionLabel: React.CSSProperties = { fontSize: '10px', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' };

export const BackgroundPicker: React.FC<BackgroundPickerProps> = ({
    backgroundColor, setBackgroundColor, videoPadding, setVideoPadding,
}) => (
    <div style={{
        position: 'absolute', top: '100%', right: 0, marginTop: '8px',
        background: 'rgba(26, 26, 31, 0.98)', backdropFilter: 'blur(30px)',
        borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: 'var(--shadow-lg)', padding: '16px', zIndex: 2147483647,
        width: '260px', WebkitAppRegion: 'no-drag',
    } as any}>
        <div style={sectionLabel}>Colors</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '12px' }}>
            {SOLID_COLORS.map(bg => (
                <button key={bg.value} onClick={() => setBackgroundColor(bg.value)} title={bg.name}
                    style={{ width: 32, height: 32, borderRadius: '50%', background: bg.value, border: backgroundColor === bg.value ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.15)', cursor: 'pointer', transition: 'transform 0.15s' }} />
            ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
            <input type="color" value={backgroundColor?.startsWith('#') ? backgroundColor : '#000000'} onChange={(e) => setBackgroundColor(e.target.value)}
                style={{ width: 32, height: 32, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '8px', padding: 0, background: 'none' }} title="Pick any color" />
            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                {backgroundColor?.startsWith('#') ? backgroundColor : 'Custom'}
            </span>
        </div>

        <div style={sectionLabel}>Gradients</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '14px' }}>
            {GRADIENTS.map(g => (
                <button key={g.value} onClick={() => setBackgroundColor(g.value)} title={g.name}
                    style={{ height: 28, borderRadius: '6px', background: `linear-gradient(135deg, ${g.colors.join(', ')})`, border: backgroundColor === g.value ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'all 0.15s' }} />
            ))}
        </div>

        <div style={sectionLabel}>Cinematic</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '14px' }}>
            {CINEMATIC.map(cb => (
                <button key={cb.value} onClick={() => setBackgroundColor(cb.value)} title={cb.name}
                    style={{ height: 28, borderRadius: '6px', backgroundImage: `url(${cb.image})`, backgroundSize: 'cover', backgroundPosition: 'center', border: backgroundColor === cb.value ? '2px solid var(--accent)' : '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'all 0.15s' }} />
            ))}
        </div>

        <div style={{ marginTop: '16px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Frame Size</span>
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{videoPadding}%</span>
            </div>
            <input type="range" min="0" max="40" step="1" value={videoPadding} onChange={(e) => setVideoPadding?.(parseInt(e.target.value))}
                style={{ width: '100%', WebkitAppRegion: 'no-drag', accentColor: 'var(--accent)' } as any} />
        </div>
    </div>
);
