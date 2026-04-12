import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CloudRain,
  Music2,
  Radio,
  Wind,
  Volume2,
  VolumeX,
  Play,
  Pause,
  X,
  FolderOpen,
  AlertTriangle,
} from 'lucide-react';
import styles from './TaskTimerWidget.module.css';
import { BUILTIN_FOCUS_TIMER_SOUNDS, type BuiltInFocusTimerSound } from '@config/focusTimerSounds';
import type { TimerWidgetAlert } from '../timerWidget/types';

// Alert sound - create programmatically using Web Audio API
const playAlertSound = () => {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    // Create oscillator for beep sound
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // Alarm-like sound pattern
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime); // A5 note
    oscillator.type = 'sine';
    
    // Volume envelope
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.05);
    gainNode.gain.linearRampToValueAtTime(0.1, audioContext.currentTime + 0.15);
    gainNode.gain.linearRampToValueAtTime(0.3, audioContext.currentTime + 0.2);
    gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.4);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.4);
    
    // Second beep after short delay
    setTimeout(() => {
      const osc2 = audioContext.createOscillator();
      const gain2 = audioContext.createGain();
      osc2.connect(gain2);
      gain2.connect(audioContext.destination);
      osc2.frequency.setValueAtTime(1100, audioContext.currentTime); // Higher note
      osc2.type = 'sine';
      gain2.gain.setValueAtTime(0, audioContext.currentTime);
      gain2.gain.linearRampToValueAtTime(0.25, audioContext.currentTime + 0.05);
      gain2.gain.linearRampToValueAtTime(0, audioContext.currentTime + 0.3);
      osc2.start(audioContext.currentTime);
      osc2.stop(audioContext.currentTime + 0.3);
    }, 200);
  } catch (err) {
    console.log('[Alert] Could not play sound:', err);
  }
};

interface TaskTimerWidgetProps {
  taskName: string;
  onStop: () => void;
  breakIntervalMinutes?: number;
  breakDurationMinutes?: number;
  initialElapsedSeconds?: number;
  alert?: TimerWidgetAlert | null;
  onDismissAlert?: () => void;
  onBrowseCustomSound?: () => void;
  customSoundPath?: string | null;
}

interface BaseSoundOption {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface LocalSoundOption extends BaseSoundOption {
  type: 'local';
  file: string;
}

interface CustomSoundOption extends BaseSoundOption {
  type: 'custom';
}

type SoundOption = LocalSoundOption | CustomSoundOption;

const SOUND_ICONS: Record<BuiltInFocusTimerSound['icon'], BaseSoundOption['icon']> = {
  rain: CloudRain,
  jazz: Music2,
  classical: Radio,
  white: Wind,
};

const BUILTIN_SOUND_OPTIONS: LocalSoundOption[] = BUILTIN_FOCUS_TIMER_SOUNDS.map((option) => ({
  id: option.id,
  label: option.label,
  icon: SOUND_ICONS[option.icon],
  type: 'local',
  file: option.file,
}));

const CUSTOM_SOUND_OPTION: CustomSoundOption = { id: 'custom', label: 'Add File', icon: FolderOpen, type: 'custom' };

const FIVE_MINUTES = 5 * 60;

const TaskTimerWidget: React.FC<TaskTimerWidgetProps> = ({
  taskName,
  onStop,
  breakIntervalMinutes = 60,
  initialElapsedSeconds = 0,
  alert,
  onDismissAlert,
  onBrowseCustomSound,
  customSoundPath,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(initialElapsedSeconds);
  const [isPaused, setIsPaused] = useState(false);
  const [selectedSound, setSelectedSound] = useState<string | null>(null);
  const [showSoundOptions, setShowSoundOptions] = useState(false);
  const [alertPlacement, setAlertPlacement] = useState<'above' | 'below'>('above');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const alertRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setElapsedSeconds(initialElapsedSeconds);
  }, [initialElapsedSeconds]);

  useEffect(() => {
    if (!isPaused) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPaused]);

  const formatTime = useCallback((totalSeconds: number): string => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }, []);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
    }
    return audioRef.current;
  }, []);

  const stopAllAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
    }
    setSelectedSound(null);
  }, []);

  const handleLocalSound = useCallback(
    (option: LocalSoundOption) => {
      if (selectedSound === option.id) {
        stopAllAudio();
        return;
      }
      const audio = ensureAudio();
      audio.pause();
      audio.src = option.file;
      audio.currentTime = 0;
      audio.loop = true;
      audio.volume = 0.6;
      audio
        .play()
        .then(() => {
          setSelectedSound(option.id);
        })
        .catch((err) => {
          console.error('Failed to play audio:', err);
        });
    },
    [ensureAudio, selectedSound, stopAllAudio]
  );

  const playCustomSound = useCallback(
    (dataUrl: string) => {
      const audio = ensureAudio();
      audio.pause();
      
      console.log('[CustomSound] Playing data URL, length:', dataUrl.length);
      audio.src = dataUrl;
      audio.currentTime = 0;
      audio.loop = true;
      audio.volume = 0.6;
      audio
        .play()
        .then(() => {
          setSelectedSound('custom');
          console.log('[CustomSound] Playing successfully');
        })
        .catch((err) => {
          console.error('[CustomSound] Failed to play:', err);
        });
    },
    [ensureAudio]
  );

  // Auto-play custom sound when path changes
  useEffect(() => {
    if (customSoundPath) {
      playCustomSound(customSoundPath);
    }
  }, [customSoundPath, playCustomSound]);

  const handleSoundSelect = useCallback(
    (option: SoundOption) => {
      if (option.type === 'custom') {
        // Always browse for a new file when clicking custom
        onBrowseCustomSound?.();
        setShowSoundOptions(false);
        return;
      }
      handleLocalSound(option);
    },
    [handleLocalSound, onBrowseCustomSound]
  );

  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, [stopAllAudio]);

  // Play alert sound when new alert appears
  useEffect(() => {
    if (alert) {
      playAlertSound();
    }
  }, [alert?.timestamp]);

  // Decide whether to show alert above or below depending on available space
  useEffect(() => {
    if (!alert) return;
    const measure = () => {
      if (!widgetRef.current || !alertRef.current) return;
      const widgetRect = widgetRef.current.getBoundingClientRect();
      const alertHeight = alertRef.current.getBoundingClientRect().height || 0;
      const gap = 12;
      if (widgetRect.top - alertHeight - gap < 0) {
        setAlertPlacement('below');
      } else {
        setAlertPlacement('above');
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [alert]);

  const intervalSeconds = Math.max(breakIntervalMinutes * 60, 1);
  const secondsIntoInterval = elapsedSeconds % intervalSeconds;
  const secondsRemaining = intervalSeconds - secondsIntoInterval;
  const isClosingWindow = secondsRemaining <= FIVE_MINUTES;
  const progressRatio = secondsIntoInterval / intervalSeconds;

  const ringColor = isClosingWindow ? '#ff6b6b' : '#2de2ff';

  const circumference = 2 * Math.PI * 19;
  const dashOffset = circumference * (1 - progressRatio);

  const handleMusicButtonClick = useCallback(() => {
    if (selectedSound) {
      stopAllAudio();
    } else {
      setShowSoundOptions(true);
    }
  }, [selectedSound, stopAllAudio]);

  const handleSoundSelectAndClose = useCallback(
    (option: SoundOption) => {
      handleSoundSelect(option);
      if (option.type !== 'custom') {
        setShowSoundOptions(false);
      }
    },
    [handleSoundSelect]
  );

  const allSoundOptions: SoundOption[] = useMemo(() => {
    return [...BUILTIN_SOUND_OPTIONS, CUSTOM_SOUND_OPTION];
  }, []);

  const activeSoundOption = useMemo(
    () => allSoundOptions.find((opt) => opt.id === selectedSound) || null,
    [selectedSound, allSoundOptions]
  );
  const ActiveSoundIcon = activeSoundOption?.icon;

  return (
    <div ref={widgetRef} className={`${styles.widget} ${isClosingWindow ? styles.widgetWarning : ''}`}>
      {/* Top Bar */}
      <div className={styles.topBar}>
        <span className={styles.taskName}>{taskName || 'Task'}</span>
        
        {selectedSound && activeSoundOption && ActiveSoundIcon && (
          <div className={styles.miniPlayer}>
            <ActiveSoundIcon size={10} className={styles.miniPlayerIcon} />
            <span className={styles.miniPlayerLabel}>{activeSoundOption.label}</span>
            <button 
              className={styles.miniPlayerStop}
              onClick={stopAllAudio}
              title="Stop sound"
            >
              <X size={8} />
            </button>
          </div>
        )}
        
        <button 
          className={styles.closeButton} 
          onClick={onStop}
          title="Stop"
        >
          <X size={12} />
        </button>
      </div>
      
      {/* Content */}
      <div className={styles.content}>
        <span className={styles.timeValue}>{formatTime(elapsedSeconds)}</span>
        
        <div className={styles.progressRing}>
          <svg viewBox="0 0 44 44" className={styles.ringSvg}>
            <circle
              className={styles.ringTrack}
              cx="22"
              cy="22"
              r="19"
              fill="none"
              strokeWidth="3"
            />
            <circle
              className={styles.ringProgress}
              cx="22"
              cy="22"
              r="19"
              fill="none"
              strokeWidth="3"
              stroke={ringColor}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
          </svg>
          <div className={styles.ringCenter}>
            <span className={styles.remainingValue}>{Math.ceil(secondsRemaining / 60)}</span>
          </div>
        </div>
        
        <div className={styles.controls}>
          <button 
            className={styles.controlButton} 
            onClick={togglePause}
            title={isPaused ? 'Resume' : 'Pause'}
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
          </button>
          
          <div className={styles.musicButtonWrapper}>
            <button 
              className={`${styles.controlButton} ${selectedSound ? styles.controlButtonActive : ''}`}
              onClick={handleMusicButtonClick}
              title={selectedSound ? 'Stop sound' : 'Select sound'}
            >
              {selectedSound ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </button>
            
            {/* Compact Sound Menu */}
            {showSoundOptions && (
              <div
                className={styles.soundMenu}
                onMouseLeave={() => {
                  setShowSoundOptions(false);
                }}
              >
            <div className={styles.soundMenuButtons}>
              {allSoundOptions.map((option) => {
                const IconComponent = option.icon;
                const isActive = selectedSound === option.id;
                const label =
                  option.type === 'custom'
                    ? (customSoundPath ? 'Change custom sound' : 'Add custom sound')
                    : option.label;
                return (
                  <button
                    key={option.id}
                    className={`${styles.soundMenuItem} ${isActive ? styles.soundMenuItemActive : ''}`}
                    onClick={() => handleSoundSelectAndClose(option)}
                    title={label}
                  >
                    <IconComponent size={9} />
                  </button>
                );
              })}
            </div>
              </div>
            )}
          </div>
        </div>
      </div>
      {alert && (
        <div
          ref={alertRef}
          className={`${styles.alertCard} ${alertPlacement === 'above' ? styles.alertCardAbove : styles.alertCardBelow}`}
        >
          <div className={styles.alertIcon}>
            <AlertTriangle size={18} color="#fff" />
          </div>
          <div className={styles.alertBody}>
            <span className={styles.alertTitle}>{alert.title}</span>
            <span className={styles.alertMessage}>{alert.message}</span>
          </div>
          <button
            className={styles.alertClose}
            onClick={onDismissAlert}
            title="Dismiss alert"
          >
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

export default TaskTimerWidget;

