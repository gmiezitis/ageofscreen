import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X, Target, BarChart3 } from 'lucide-react';
import FocusSetupPanel, { type FocusSessionConfig } from './FocusSetupPanel';
import FocusActivityTracker from '../services/focusActivityTracker';
import FocusAnalytics from './FocusAnalytics';
import type { TimerWidgetPayload } from '../focus/types';
import type { IMenuElectronAPI } from '../menu/menuPreload';
import styles from './FocusWidget.module.css';

interface FocusWidgetProps {
  isVisible: boolean;
  onClose?: () => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

type FocusView = 'setup' | 'analytics';

const FOCUS_WIDGET_WIDTH = 420;
const FOCUS_WIDGET_HEIGHT = 600;
const FOCUS_WIDGET_MARGIN = 12;
const FOCUS_WIDGET_HEXAGON_GAP = 340;
const FOCUS_WIDGET_TOP_OFFSET = 80;

interface Position {
  x: number;
  y: number;
}

const FocusWidget: React.FC<FocusWidgetProps> = ({
  isVisible,
  onClose,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [view, setView] = useState<FocusView>('setup');
  const [sessionConfig, setSessionConfig] = useState<FocusSessionConfig | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [position, setPosition] = useState<Position>(() => {
    if (typeof window !== 'undefined') {
      const centerX = window.innerWidth / 2;
      const desiredX = Math.max(FOCUS_WIDGET_MARGIN, centerX + FOCUS_WIDGET_HEXAGON_GAP);
      const maxX = window.innerWidth - (FOCUS_WIDGET_WIDTH + FOCUS_WIDGET_MARGIN);
      const defaultX = Math.min(desiredX, maxX);
      const maxY = window.innerHeight - (FOCUS_WIDGET_HEIGHT + FOCUS_WIDGET_MARGIN);
      const defaultY = Math.min(
        Math.max(FOCUS_WIDGET_TOP_OFFSET, FOCUS_WIDGET_MARGIN),
        maxY
      );
      return { x: defaultX, y: defaultY };
    }
    return { x: 800, y: 120 };
  });

  const activityTracker = FocusActivityTracker.getInstance();
  const widgetRef = useRef<HTMLDivElement>(null);
  const electronAPI = (window as any).electronAPI as IMenuElectronAPI | undefined;

  const handleStartSession = useCallback((config: FocusSessionConfig) => {
    const newSessionId = `focus-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    setSessionConfig(config);
    setSessionId(newSessionId);
    setIsSessionActive(true);

    if (config.enableBlocking) {
      // Start active window monitoring with blocked sites and apps
      const allBlocked = [
        ...(config.blockedSites || []),
        ...(config.blockedApps || []),
      ];
      electronAPI?.focusBlocking?.startMonitoring?.(allBlocked);
    } else {
      electronAPI?.focusBlocking?.stopMonitoring?.();
    }

    // Start activity tracking
    activityTracker.startSession({
      sessionId: newSessionId,
      taskId: config.taskId,
      taskTitle: config.taskTitle,
      isAdHoc: config.isAdHoc,
    });

    // Show timer widget window
    if (electronAPI?.timerWidget?.show) {
      const payload: TimerWidgetPayload = {
        taskId: config.taskId || newSessionId,
        taskName: config.taskTitle || config.adHocLabel || 'Focus Session',
        startedAt: Date.now(),
        breakIntervalMinutes: config.durationMinutes,
        breakDurationMinutes: config.breakMinutes,
      };
      try {
        electronAPI.timerWidget.show(payload);
      } catch (error) {
        console.error('[FocusWidget] Error showing timer widget:', error);
      }
    } else {
      console.warn('[FocusWidget] Timer widget API not available');
    }
  }, [activityTracker, electronAPI]);

  const handleStopSession = useCallback(() => {
    // Hide timer widget window
    if (electronAPI?.timerWidget?.hide) {
      electronAPI.timerWidget.hide();
    }

    electronAPI?.focusBlocking?.stopMonitoring?.();

    if (sessionId) {
      activityTracker.stopSession();
    }
    setSessionConfig(null);
    setSessionId(null);
    setIsSessionActive(false);
  }, [sessionId, activityTracker, electronAPI]);

  const clampPosition = useCallback((targetX: number, targetY: number): Position => {
    if (typeof window === 'undefined') {
      return { x: targetX, y: targetY };
    }
    const width = FOCUS_WIDGET_WIDTH;
    const height = FOCUS_WIDGET_HEIGHT;
    const minX = FOCUS_WIDGET_MARGIN;
    const minY = FOCUS_WIDGET_MARGIN;
    const maxX = Math.max(minX, window.innerWidth - width - FOCUS_WIDGET_MARGIN);
    const maxY = Math.max(minY, window.innerHeight - height - FOCUS_WIDGET_MARGIN);
    return {
      x: Math.min(Math.max(targetX, minX), maxX),
      y: Math.min(Math.max(targetY, minY), maxY),
    };
  }, []);

  // Handle timer widget stop request
  useEffect(() => {
    if (!electronAPI?.timerWidget?.onStopRequested) return;

    const cleanup = electronAPI.timerWidget.onStopRequested(() => {
      handleStopSession();
    });

    return cleanup;
  }, [electronAPI, handleStopSession]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }
    const handleResize = () => {
      setPosition((prev) => clampPosition(prev.x, prev.y));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [isVisible, clampPosition]);

  if (!isVisible) return null;

  return (
    <div
      ref={widgetRef}
      className={styles.widget}
      style={{
        position: 'fixed',
        top: `${position.y}px`,
        left: `${position.x}px`,
        width: `${FOCUS_WIDGET_WIDTH}px`,
        height: `${FOCUS_WIDGET_HEIGHT}px`,
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.title}>Focus</span>
        </div>
        {onClose && (
          <button className={styles.closeButton} onClick={onClose} title="Close">
            <X size={14} />
          </button>
        )}
      </div>

      {/* View Toggle */}
      <div className={styles.viewToggle}>
        <button
          className={`${styles.viewButton} ${view === 'setup' ? styles.viewButtonActive : ''}`}
          onClick={() => setView('setup')}
        >
          <Target size={12} />
          Setup
        </button>
        <button
          className={`${styles.viewButton} ${view === 'analytics' ? styles.viewButtonActive : ''}`}
          onClick={() => setView('analytics')}
        >
          <BarChart3 size={12} />
          Stats
        </button>
      </div>

      {/* Content Area */}
      <div className={styles.content}>
        {view === 'setup' && (
          <div className={styles.setupContainer}>
            <FocusSetupPanel
              onStart={handleStartSession}
              onClose={() => setView('analytics')}
              isSessionActive={isSessionActive}
              onStopSession={handleStopSession}
            />
          </div>
        )}

        {view === 'analytics' && (
          <FocusAnalytics />
        )}
      </div>
    </div>
  );
};

export default FocusWidget;
