import React, { useCallback, useState, useMemo } from 'react';
import { Target, X, Play, Shield, Square } from 'lucide-react';
import { useTaskTreeStore } from '../stores/taskTreeStore';
import styles from './FocusSetupPanel.module.css';

export interface FocusSessionConfig {
  taskId?: string;
  taskTitle?: string;
  isAdHoc: boolean;
  adHocLabel?: string;
  durationMinutes: number;
  breakMinutes: number;
  blockedSites: string[];
  blockedApps: string[];
  enableBlocking: boolean;
  enableAlerts: boolean;
}

interface FocusSetupPanelProps {
  onStart: (config: FocusSessionConfig) => void;
  onClose: () => void;
  isSessionActive?: boolean;
  onStopSession?: () => void;
}

const POMODORO_PRESETS = [
  { label: 'Pomodoro', focus: 25, break: 5 },
  { label: 'Short', focus: 15, break: 3 },
  { label: 'Long', focus: 45, break: 10 },
  { label: 'Custom', focus: 0, break: 0 },
];

const FocusSetupPanel: React.FC<FocusSetupPanelProps> = ({ 
  onStart, 
  onClose,
  isSessionActive = false,
  onStopSession 
}) => {
  const { tasks } = useTaskTreeStore();
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isAdHoc, setIsAdHoc] = useState(false);
  const [adHocLabel, setAdHocLabel] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(0);
  const [customMinutes, setCustomMinutes] = useState(25);
  const [blockedSites, setBlockedSites] = useState<string[]>([]);
  const [blockedApps, setBlockedApps] = useState<string[]>([]);
  const [newSite, setNewSite] = useState('');
  const [newApp, setNewApp] = useState('');
  const [enableAlerts, setEnableAlerts] = useState(true);
  const [recentSites, setRecentSites] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('focusRecentAlarmSites');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [recentApps, setRecentApps] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('focusRecentAlarmApps');
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const selectedTask = useMemo(
    () => tasks.find((t) => t.id === selectedTaskId) || null,
    [tasks, selectedTaskId]
  );
  const siteSuggestions = useMemo<string[]>(() => ['facebook.com', 'youtube.com', 'x.com'], []);
  const appSuggestions = useMemo<string[]>(() => ['Discord', 'Slack', 'Steam'], []);

  const handlePresetChange = useCallback((index: number) => {
    setSelectedPreset(index);
    if (index < 3) {
      const preset = POMODORO_PRESETS[index];
      setCustomMinutes(preset.focus);
    }
  }, []);

  const handleAddSite = useCallback(() => {
    const site = newSite.trim().toLowerCase();
    if (!site) return;
    if (blockedSites.length >= 3) return;
    if (!blockedSites.includes(site)) {
      setBlockedSites([...blockedSites, site]);
      setNewSite('');
    }
  }, [newSite, blockedSites]);

  const handleRemoveSite = useCallback((site: string) => {
    setBlockedSites(blockedSites.filter((s) => s !== site));
  }, [blockedSites]);

  const handleAddApp = useCallback(() => {
    const app = newApp.trim();
    if (!app) return;
    if (blockedApps.length >= 3) return;
    if (!blockedApps.includes(app)) {
      setBlockedApps([...blockedApps, app]);
      setNewApp('');
    }
  }, [newApp, blockedApps]);

  const handleRemoveApp = useCallback((app: string) => {
    setBlockedApps(blockedApps.filter((a) => a !== app));
  }, [blockedApps]);

  const handleStart = useCallback(() => {
    const duration = selectedPreset === 3 ? customMinutes : POMODORO_PRESETS[selectedPreset].focus;
    const breakMins = selectedPreset === 3 ? 5 : POMODORO_PRESETS[selectedPreset].break;

    const config: FocusSessionConfig = {
      taskId: isAdHoc ? undefined : selectedTaskId || undefined,
      taskTitle: isAdHoc ? adHocLabel : selectedTask?.title,
      isAdHoc,
      adHocLabel: isAdHoc ? adHocLabel : undefined,
      durationMinutes: duration,
      breakMinutes: breakMins,
      blockedSites,
      blockedApps,
      enableBlocking: true,
      enableAlerts,
    };

    // persist recent alarms for quicker reuse
    const mergeAndLimit = (existing: string[], incoming: string[], limit = 6) => {
      const merged = [...incoming, ...existing].map((v) => v.trim()).filter(Boolean);
      const deduped: string[] = [];
      merged.forEach((item) => {
        if (!deduped.includes(item)) deduped.push(item);
      });
      return deduped.slice(0, limit);
    };
    const nextRecentSites = mergeAndLimit(recentSites, blockedSites);
    const nextRecentApps = mergeAndLimit(recentApps, blockedApps);
    setRecentSites(nextRecentSites);
    setRecentApps(nextRecentApps);
    try {
      localStorage.setItem('focusRecentAlarmSites', JSON.stringify(nextRecentSites));
      localStorage.setItem('focusRecentAlarmApps', JSON.stringify(nextRecentApps));
    } catch {
      // ignore persistence errors
    }

    onStart(config);
  }, [
    selectedPreset,
    customMinutes,
    isAdHoc,
    selectedTaskId,
    selectedTask,
    adHocLabel,
    blockedSites,
    blockedApps,
    enableAlerts,
    onStart,
    recentSites,
    recentApps,
  ]);

  const canStart = useMemo(() => {
    if (isAdHoc) {
      return adHocLabel.trim().length > 0;
    }
    return selectedTaskId !== null || tasks.length === 0;
  }, [isAdHoc, adHocLabel, selectedTaskId, tasks.length]);

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <Target size={18} className={styles.headerIcon} />
        <span className={styles.headerTitle}>Focus Setup</span>
        <button className={styles.closeButton} onClick={onClose} title="Close">
          <X size={14} />
        </button>
      </div>

      <div className={styles.content}>
        {/* Task Selection */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>What to Focus On</label>
          <div className={styles.taskModeToggle}>
            <button
              className={`${styles.modeButton} ${!isAdHoc ? styles.modeButtonActive : ''}`}
              onClick={() => setIsAdHoc(false)}
            >
              Task
            </button>
            <button
              className={`${styles.modeButton} ${isAdHoc ? styles.modeButtonActive : ''}`}
              onClick={() => setIsAdHoc(true)}
            >
              Ad-Hoc
            </button>
          </div>

          {!isAdHoc ? (
            <div className={styles.taskList}>
              {tasks.length === 0 ? (
                <div className={styles.emptyState}>No tasks available. Create a task first.</div>
              ) : (
                tasks.map((task) => (
                  <button
                    key={task.id}
                    className={`${styles.taskOption} ${selectedTaskId === task.id ? styles.taskOptionActive : ''}`}
                    onClick={() => setSelectedTaskId(task.id)}
                  >
                    <div className={styles.taskColor} style={{ backgroundColor: `var(--task-${task.color})` }} />
                    <span className={styles.taskTitle}>{task.title}</span>
                  </button>
                ))
              )}
            </div>
          ) : (
            <input
              className={styles.adHocInput}
              type="text"
              placeholder="Enter focus goal..."
              value={adHocLabel}
              onChange={(e) => setAdHocLabel(e.target.value)}
            />
          )}
        </div>

        {/* Duration Preset */}
        <div className={styles.section}>
          <label className={styles.sectionLabel}>Duration</label>
          <div className={styles.presetSelector}>
            {POMODORO_PRESETS.map((preset, index) => (
              <button
                key={index}
                className={`${styles.presetButton} ${selectedPreset === index ? styles.presetButtonActive : ''}`}
                onClick={() => handlePresetChange(index)}
              >
                {preset.label}
                {index < 3 && <span className={styles.presetTime}>{preset.focus}min</span>}
              </button>
            ))}
          </div>
          {selectedPreset === 3 && (
            <input
              className={styles.customInput}
              type="number"
              min="1"
              max="120"
              value={customMinutes}
              onChange={(e) => setCustomMinutes(Math.max(1, Math.min(120, parseInt(e.target.value) || 1)))}
              placeholder="Minutes"
            />
          )}
        </div>

        {/* Alert Settings */}
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <Shield size={14} />
            <label className={styles.sectionLabel}>Alerts (Sites & Apps)</label>
          </div>

          <div className={styles.toggleRow}>
            <span className={styles.toggleLabel}>Show Alerts</span>
            <button
              className={`${styles.toggle} ${enableAlerts ? styles.toggleActive : ''}`}
              onClick={() => setEnableAlerts(!enableAlerts)}
            >
              <div className={styles.toggleThumb} />
            </button>
          </div>

          {enableAlerts && (
            <>
              <div className={styles.blocklistSection}>
                <label className={styles.blocklistLabel}>Alert Sites</label>
                <div className={styles.blocklistInput}>
                  <input
                    type="text"
                    placeholder="e.g., facebook.com"
                    value={newSite}
                    onChange={(e) => setNewSite(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddSite()}
                    maxLength={60}
                  />
                  <button className={styles.addButton} onClick={handleAddSite} disabled={blockedSites.length >= 3}>
                    Add
                  </button>
                </div>
                <div className={styles.suggestionRow}>
                  {siteSuggestions.map((s) => (
                    <button
                      key={s}
                      className={styles.suggestionChip}
                      onClick={() => {
                        if (blockedSites.length >= 3) return;
                        if (!blockedSites.includes(s)) setBlockedSites([...blockedSites, s]);
                      }}
                      disabled={blockedSites.length >= 3}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                {recentSites.length > 0 && (
                  <div className={styles.recentRow}>
                    <span className={styles.recentLabel}>Recent</span>
                    <div className={styles.recentChips}>
                      {recentSites.map((s) => (
                        <button
                          key={s}
                          className={styles.recentChip}
                          onClick={() => {
                            if (blockedSites.length >= 3) return;
                            if (!blockedSites.includes(s)) setBlockedSites([...blockedSites, s]);
                          }}
                          disabled={blockedSites.length >= 3}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className={styles.blocklistItems}>
                  {blockedSites.map((site) => (
                    <div key={site} className={styles.blocklistItem}>
                      <span>{site}</span>
                      <button className={styles.removeButton} onClick={() => handleRemoveSite(site)}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className={styles.blocklistSection}>
                <label className={styles.blocklistLabel}>Alert Apps</label>
                <div className={styles.blocklistInput}>
                  <input
                    type="text"
                    placeholder="e.g., Discord"
                    value={newApp}
                    onChange={(e) => setNewApp(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddApp()}
                    maxLength={60}
                  />
                  <button className={styles.addButton} onClick={handleAddApp} disabled={blockedApps.length >= 3}>
                    Add
                  </button>
                </div>
                <div className={styles.suggestionRow}>
                  {appSuggestions.map((a) => (
                    <button
                      key={a}
                      className={styles.suggestionChip}
                      onClick={() => {
                        if (blockedApps.length >= 3) return;
                        if (!blockedApps.includes(a)) setBlockedApps([...blockedApps, a]);
                      }}
                      disabled={blockedApps.length >= 3}
                    >
                      {a}
                    </button>
                  ))}
                </div>
                {recentApps.length > 0 && (
                  <div className={styles.recentRow}>
                    <span className={styles.recentLabel}>Recent</span>
                    <div className={styles.recentChips}>
                      {recentApps.map((a) => (
                        <button
                          key={a}
                          className={styles.recentChip}
                          onClick={() => {
                            if (blockedApps.length >= 3) return;
                            if (!blockedApps.includes(a)) setBlockedApps([...blockedApps, a]);
                          }}
                          disabled={blockedApps.length >= 3}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className={styles.blocklistItems}>
                  {blockedApps.map((app) => (
                    <div key={app} className={styles.blocklistItem}>
                      <span>{app}</span>
                      <button className={styles.removeButton} onClick={() => handleRemoveApp(app)}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        {isSessionActive ? (
          <button
            className={styles.stopButton}
            onClick={onStopSession}
          >
            <Square size={16} />
            Stop Focus Session
          </button>
        ) : (
          <button
            className={styles.startButton}
            onClick={handleStart}
            disabled={!canStart}
          >
            <Play size={16} />
            Start Focus
          </button>
        )}
      </div>
    </div>
  );
};

export default FocusSetupPanel;

