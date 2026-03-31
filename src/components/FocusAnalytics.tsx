import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { 
  Clock, Target, TrendingUp, Calendar, Shield, Trash2, 
  Download, Eye, EyeOff, ChevronDown, AlertTriangle, Check
} from 'lucide-react';
import FocusActivityTracker, { FocusSessionLog } from '../services/focusActivityTracker';
import styles from './FocusAnalytics.module.css';

type TimeRange = 'today' | 'week' | 'month' | 'all';

interface PrivacySettings {
  trackUrls: boolean;
  trackApps: boolean;
  retentionDays: number; // 0 = forever, otherwise delete after X days
}

const DEFAULT_PRIVACY: PrivacySettings = {
  trackUrls: true,
  trackApps: true,
  retentionDays: 30,
};

const PRIVACY_KEY = 'focusPrivacySettings';

const FocusAnalytics: React.FC = () => {
  const activityTracker = FocusActivityTracker.getInstance();
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [privacy, setPrivacy] = useState<PrivacySettings>(() => {
    try {
      const stored = localStorage.getItem(PRIVACY_KEY);
      return stored ? JSON.parse(stored) : DEFAULT_PRIVACY;
    } catch {
      return DEFAULT_PRIVACY;
    }
  });
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [sessions, setSessions] = useState<FocusSessionLog[]>([]);

  // Load sessions
  useEffect(() => {
    const loadSessions = () => {
      setSessions(activityTracker.getSessions());
    };
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, [activityTracker]);

  // Save privacy settings
  useEffect(() => {
    localStorage.setItem(PRIVACY_KEY, JSON.stringify(privacy));
  }, [privacy]);

  // Filter sessions by time range
  const filteredSessions = useMemo(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return sessions.filter((s) => {
      const sessionDate = new Date(s.startedAt);
      switch (timeRange) {
        case 'today':
          return sessionDate >= today;
        case 'week':
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          return sessionDate >= weekAgo;
        case 'month':
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          return sessionDate >= monthAgo;
        case 'all':
        default:
          return true;
      }
    });
  }, [sessions, timeRange]);

  // Calculate stats
  const stats = useMemo(() => {
    const totalSeconds = filteredSessions.reduce((sum, s) => sum + s.duration, 0);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    // Calculate daily streak
    let streak = 0;
    if (sessions.length > 0) {
      const sessionsByDay = new Map<string, number>();
      sessions.forEach((s) => {
        const day = s.startedAt.split('T')[0];
        sessionsByDay.set(day, (sessionsByDay.get(day) || 0) + s.duration);
      });
      
      const today = new Date().toISOString().split('T')[0];
      let checkDate = today;
      while (sessionsByDay.has(checkDate) && sessionsByDay.get(checkDate)! > 0) {
        streak++;
        const d = new Date(checkDate);
        d.setDate(d.getDate() - 1);
        checkDate = d.toISOString().split('T')[0];
      }
    }

    // Best day
    let bestDay = { date: '', minutes: 0 };
    const dailyMinutes = new Map<string, number>();
    filteredSessions.forEach((s) => {
      const day = s.startedAt.split('T')[0];
      dailyMinutes.set(day, (dailyMinutes.get(day) || 0) + Math.floor(s.duration / 60));
    });
    dailyMinutes.forEach((mins, date) => {
      if (mins > bestDay.minutes) {
        bestDay = { date, minutes: mins };
      }
    });

    // Daily series (top performing days)
    const dailySeries = Array.from(dailyMinutes.entries())
      .map(([date, minutes]) => ({ date, minutes }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 10);

    // Blocked events
    const blockedEvents = filteredSessions.reduce((sum, s) => sum + s.blockedEvents, 0);

    // Average session length
    const avgMinutes = filteredSessions.length > 0 
      ? Math.floor(totalMinutes / filteredSessions.length) 
      : 0;

    // Top URLs and Apps (respecting privacy settings)
    const urlMap = new Map<string, number>();
    const appMap = new Map<string, number>();
    
    if (privacy.trackUrls) {
      filteredSessions.forEach((session) => {
        session.activities
          .filter((a) => a.type === 'url' && a.url && a.duration)
          .forEach((a) => {
            urlMap.set(a.url!, (urlMap.get(a.url!) || 0) + a.duration!);
          });
      });
    }

    if (privacy.trackApps) {
      filteredSessions.forEach((session) => {
        session.activities
          .filter((a) => a.type === 'app' && a.appName && a.duration)
          .forEach((a) => {
            appMap.set(a.appName!, (appMap.get(a.appName!) || 0) + a.duration!);
          });
      });
    }

    const topUrls = Array.from(urlMap.entries())
      .map(([url, seconds]) => ({ url, minutes: Math.floor(seconds / 60) }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);

    const topApps = Array.from(appMap.entries())
      .map(([app, seconds]) => ({ app, minutes: Math.floor(seconds / 60) }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);

    return {
      totalHours: hours,
      totalMins: mins,
      totalMinutes,
      sessionCount: filteredSessions.length,
      streak,
      bestDay,
      blockedEvents,
      avgMinutes,
      topUrls,
      topApps,
      dailySeries,
    };
  }, [filteredSessions, privacy, sessions.length]);

  const handleClearData = useCallback(() => {
    localStorage.removeItem('focusActivityData');
    setSessions([]);
    setShowConfirmClear(false);
  }, []);

  const handleExportData = useCallback(() => {
    const data = {
      exportedAt: new Date().toISOString(),
      settings: privacy,
      sessions: filteredSessions.map((s) => ({
        ...s,
        // Optionally anonymize based on privacy settings
        activities: s.activities.filter((a) => {
          if (a.type === 'url' && !privacy.trackUrls) return false;
          if (a.type === 'app' && !privacy.trackApps) return false;
          return true;
        }),
      })),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `focus-data-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filteredSessions, privacy]);

  const progressRatio = Math.min(stats.totalMinutes / 120, 1);
  const circumference = 2 * Math.PI * 50;
  const dashOffset = circumference * (1 - progressRatio);

  const timeRangeLabel = {
    today: 'Today',
    week: 'Week',
    month: 'Month',
    all: 'All Time',
  }[timeRange];

  return (
    <div className={styles.analytics}>
      {/* Header with Time Range Selector */}
      <div className={styles.header}>
        <Target size={16} />
        <span className={styles.title}>Focus Stats</span>
        <div className={styles.headerActions}>
          <button 
            className={styles.privacyButton}
            onClick={() => setShowPrivacy(!showPrivacy)}
            title="Privacy Settings"
          >
            <Shield size={14} />
          </button>
        </div>
      </div>

      {/* Time Range Selector */}
      <div className={styles.timeRangeSelector}>
        {(['today', 'week', 'month', 'all'] as TimeRange[]).map((range) => (
          <button
            key={range}
            className={`${styles.rangeButton} ${timeRange === range ? styles.rangeButtonActive : ''}`}
            onClick={() => setTimeRange(range)}
          >
            {range === 'today' ? 'Today' : range === 'week' ? '7D' : range === 'month' ? '30D' : 'All'}
          </button>
        ))}
      </div>

      {/* Privacy Settings Panel */}
      {showPrivacy && (
        <div className={styles.privacyPanel}>
          <div className={styles.privacyHeader}>
            <Shield size={14} />
            <span>Privacy & Data</span>
          </div>
          
          <div className={styles.privacyInfo}>
            <AlertTriangle size={12} />
            <span>All data stored locally on your device only. Never sent to any server.</span>
          </div>

          <div className={styles.privacyOption}>
            <div className={styles.privacyOptionText}>
              <Eye size={12} />
              <span>Track visited sites</span>
            </div>
            <button 
              className={`${styles.toggle} ${privacy.trackUrls ? styles.toggleActive : ''}`}
              onClick={() => setPrivacy({ ...privacy, trackUrls: !privacy.trackUrls })}
            >
              <div className={styles.toggleThumb} />
            </button>
          </div>

          <div className={styles.privacyOption}>
            <div className={styles.privacyOptionText}>
              <Eye size={12} />
              <span>Track app usage</span>
            </div>
            <button 
              className={`${styles.toggle} ${privacy.trackApps ? styles.toggleActive : ''}`}
              onClick={() => setPrivacy({ ...privacy, trackApps: !privacy.trackApps })}
            >
              <div className={styles.toggleThumb} />
            </button>
          </div>

          <div className={styles.privacyOption}>
            <div className={styles.privacyOptionText}>
              <Calendar size={12} />
              <span>Keep data for</span>
            </div>
            <select
              className={styles.retentionSelect}
              value={privacy.retentionDays}
              onChange={(e) => setPrivacy({ ...privacy, retentionDays: Number(e.target.value) })}
            >
              <option value={7}>7 days</option>
            <option value={14}>14 days</option>
              <option value={30}>30 days</option>
            <option value={60}>60 days</option>
              <option value={90}>90 days</option>
            <option value={180}>180 days</option>
            <option value={365}>1 year</option>
              <option value={0}>Forever</option>
            </select>
          </div>

          <div className={styles.privacyActions}>
            <button className={styles.exportButton} onClick={handleExportData}>
              <Download size={12} />
              Export Data
            </button>
            {!showConfirmClear ? (
              <button 
                className={styles.clearButton} 
                onClick={() => setShowConfirmClear(true)}
              >
                <Trash2 size={12} />
                Clear All
              </button>
            ) : (
              <button 
                className={styles.confirmClearButton} 
                onClick={handleClearData}
              >
                <Check size={12} />
                Confirm Delete
              </button>
            )}
          </div>
        </div>
      )}

      <div className={styles.content}>
        {/* Main Stats Circle */}
        <div className={styles.mainStat}>
          <div className={styles.progressRing}>
            <svg viewBox="0 0 120 120" className={styles.ringSvg}>
              <circle
                className={styles.ringTrack}
                cx="60"
                cy="60"
                r="50"
                fill="none"
                strokeWidth="8"
              />
              <circle
                className={styles.ringProgress}
                cx="60"
                cy="60"
                r="50"
                fill="none"
                strokeWidth="8"
                stroke="#2de2ff"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
              />
            </svg>
            <div className={styles.ringCenter}>
              <span className={styles.timeValue}>
                {stats.totalHours > 0 ? `${stats.totalHours}h ` : ''}{stats.totalMins}m
              </span>
              <span className={styles.timeLabel}>{timeRangeLabel}</span>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className={styles.statsGrid}>
          <div className={styles.miniStat}>
            <span className={styles.miniStatValue}>{stats.sessionCount}</span>
            <span className={styles.miniStatLabel}>Sessions</span>
          </div>
          <div className={styles.miniStat}>
            <span className={styles.miniStatValue}>{stats.avgMinutes}m</span>
            <span className={styles.miniStatLabel}>Avg Length</span>
          </div>
          <div className={styles.miniStat}>
            <span className={styles.miniStatValue}>{stats.streak}</span>
            <span className={styles.miniStatLabel}>Day Streak</span>
          </div>
          <div className={styles.miniStat}>
            <span className={styles.miniStatValue}>{stats.blockedEvents}</span>
            <span className={styles.miniStatLabel}>Distractions</span>
          </div>
        </div>

        {/* Best Day */}
        {stats.bestDay.minutes > 0 && (
          <div className={styles.bestDay}>
            <TrendingUp size={12} />
            <span>Best day: {stats.bestDay.date} ({stats.bestDay.minutes}m)</span>
          </div>
        )}

        {/* Daily chart - best performing days */}
        {stats.dailySeries && stats.dailySeries.length > 0 && (
          <div className={styles.dailySection}>
            <div className={styles.sectionHeader}>
              <Calendar size={12} />
              <span className={styles.sectionTitle}>Best Days</span>
            </div>
            <div className={styles.dailyChart}>
              {(() => {
                const maxMinutes = Math.max(...stats.dailySeries.map((d) => d.minutes));
                return stats.dailySeries.map((d) => {
                  const heightPct = maxMinutes ? Math.max(8, (d.minutes / maxMinutes) * 100) : 0;
                  const label = new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                  return (
                    <div key={d.date} className={styles.dailyBarItem}>
                      <div className={styles.dailyValue}>{d.minutes}m</div>
                      <div
                        className={styles.dailyBar}
                        style={{ height: `${heightPct}%` }}
                        title={`${label}: ${d.minutes}m`}
                      />
                      <span className={styles.dailyBarLabel}>{label}</span>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        )}

        {/* Top Sites */}
        {privacy.trackUrls && stats.topUrls.length > 0 && (
          <div className={styles.distractionsSection}>
            <div className={styles.sectionHeader}>
              <TrendingUp size={12} />
              <span className={styles.sectionTitle}>Top Sites</span>
            </div>
            <div className={styles.distractionList}>
              {stats.topUrls.map((item, index) => (
                <div key={index} className={styles.distractionItem}>
                  <span className={styles.distractionName}>{item.url}</span>
                  <span className={styles.distractionTime}>{(item.minutes / 60).toFixed(1)}h</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Apps */}
        {privacy.trackApps && stats.topApps.length > 0 && (
          <div className={styles.distractionsSection}>
            <div className={styles.sectionHeader}>
              <TrendingUp size={12} />
              <span className={styles.sectionTitle}>Top Apps</span>
            </div>
            <div className={styles.distractionList}>
              {stats.topApps.map((item, index) => (
                <div key={index} className={styles.distractionItem}>
                  <span className={styles.distractionName}>{item.app}</span>
                  <span className={styles.distractionTime}>{(item.minutes / 60).toFixed(1)}h</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {stats.sessionCount === 0 && (
          <div className={styles.emptyState}>
            <p>No focus data for {timeRangeLabel.toLowerCase()}</p>
            <p className={styles.emptyHint}>Start a focus session to track your productivity</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FocusAnalytics;
