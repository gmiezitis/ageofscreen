/**
 * Focus Activity Tracker
 * Tracks URLs and apps during focus sessions
 */

export interface ActivityLog {
  timestamp: string; // ISO timestamp
  type: 'url' | 'app' | 'session';
  url?: string;
  appName?: string;
  duration?: number; // seconds spent
}

export interface FocusSessionLog {
  sessionId: string;
  taskId?: string;
  taskTitle?: string;
  isAdHoc: boolean;
  startedAt: string; // ISO timestamp
  endedAt?: string; // ISO timestamp
  duration: number; // total seconds
  activities: ActivityLog[];
  blockedEvents: number; // count of blocked distractions
}

interface FocusActivityStorage {
  version: string;
  sessions: FocusSessionLog[];
  lastSyncAt: string | null;
}

const STORAGE_KEY = 'focusActivityData';
const STORAGE_VERSION = '1.0.0';
const TRACK_INTERVAL_MS = 5000; // Track every 5 seconds

class FocusActivityTracker {
  private static instance: FocusActivityTracker;
  private currentSession: FocusSessionLog | null = null;
  private trackingInterval: NodeJS.Timeout | null = null;
  private lastUrl: string | null = null;
  private lastApp: string | null = null;
  private urlTimeSpent: Map<string, number> = new Map();
  private appTimeSpent: Map<string, number> = new Map();
  private lastTrackTime: number = Date.now();

  private constructor() {
    this.loadSessions();
  }

  static getInstance(): FocusActivityTracker {
    if (!FocusActivityTracker.instance) {
      FocusActivityTracker.instance = new FocusActivityTracker();
    }
    return FocusActivityTracker.instance;
  }

  private loadSessions(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as FocusActivityStorage;
        if (parsed.version === STORAGE_VERSION && parsed.sessions) {
          // Sessions are loaded but not active
        }
      }
    } catch (error) {
      console.warn('Failed to load focus activity data:', error);
    }
  }

  private saveSessions(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      let sessions: FocusSessionLog[] = [];
      
      if (stored) {
        const parsed = JSON.parse(stored) as FocusActivityStorage;
        if (parsed.version === STORAGE_VERSION && parsed.sessions) {
          sessions = parsed.sessions;
        }
      }

      // Update current session if exists
      if (this.currentSession) {
        const index = sessions.findIndex((s) => s.sessionId === this.currentSession!.sessionId);
        if (index >= 0) {
          sessions[index] = this.currentSession;
        } else {
          sessions.push(this.currentSession);
        }
      }

      const payload: FocusActivityStorage = {
        version: STORAGE_VERSION,
        sessions,
        lastSyncAt: null,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error) {
      console.warn('Failed to save focus activity data:', error);
    }
  }

  startSession(config: {
    sessionId: string;
    taskId?: string;
    taskTitle?: string;
    isAdHoc: boolean;
  }): void {
    this.stopSession(); // End any existing session

    this.currentSession = {
      sessionId: config.sessionId,
      taskId: config.taskId,
      taskTitle: config.taskTitle,
      isAdHoc: config.isAdHoc,
      startedAt: new Date().toISOString(),
      duration: 0,
      activities: [],
      blockedEvents: 0,
    };

    this.urlTimeSpent.clear();
    this.appTimeSpent.clear();
    this.lastTrackTime = Date.now();
    this.lastUrl = null;
    this.lastApp = null;

    // Start tracking interval
    this.trackingInterval = setInterval(() => {
      this.trackActivity();
    }, TRACK_INTERVAL_MS);

    this.saveSessions();
  }

  stopSession(): void {
    if (this.trackingInterval) {
      clearInterval(this.trackingInterval);
      this.trackingInterval = null;
    }

    if (this.currentSession) {
      // Finalize time spent
      const now = Date.now();
      const elapsed = Math.floor((now - this.lastTrackTime) / 1000);
      
      if (this.lastUrl) {
        const current = this.urlTimeSpent.get(this.lastUrl) || 0;
        this.urlTimeSpent.set(this.lastUrl, current + elapsed);
      }
      
      if (this.lastApp) {
        const current = this.appTimeSpent.get(this.lastApp) || 0;
        this.appTimeSpent.set(this.lastApp, current + elapsed);
      }

      // Convert time spent maps to activity logs
      this.urlTimeSpent.forEach((seconds, url) => {
        this.currentSession!.activities.push({
          timestamp: this.currentSession!.startedAt,
          type: 'url',
          url,
          duration: seconds,
        });
      });

      this.appTimeSpent.forEach((seconds, appName) => {
        this.currentSession!.activities.push({
          timestamp: this.currentSession!.startedAt,
          type: 'app',
          appName,
          duration: seconds,
        });
      });

      this.currentSession.endedAt = new Date().toISOString();
      this.currentSession.duration = Math.floor(
        (new Date(this.currentSession.endedAt).getTime() - 
         new Date(this.currentSession.startedAt).getTime()) / 1000
      );

      this.saveSessions();
      this.currentSession = null;
    }
  }

  private trackActivity(): void {
    if (!this.currentSession) return;

    const now = Date.now();
    const elapsed = Math.floor((now - this.lastTrackTime) / 1000);

    // Track current URL (best effort - may not work in all contexts)
    const currentUrl = this.getCurrentUrl();
    if (currentUrl && currentUrl !== this.lastUrl) {
      // Save time for previous URL
      if (this.lastUrl && elapsed > 0) {
        const current = this.urlTimeSpent.get(this.lastUrl) || 0;
        this.urlTimeSpent.set(this.lastUrl, current + elapsed);
      }
      this.lastUrl = currentUrl;
      this.lastTrackTime = now;
    } else if (this.lastUrl && elapsed > 0) {
      // Continue tracking same URL
      const current = this.urlTimeSpent.get(this.lastUrl) || 0;
      this.urlTimeSpent.set(this.lastUrl, current + elapsed);
      this.lastTrackTime = now;
    }

    // Track current app (best effort)
    const currentApp = this.getCurrentApp();
    if (currentApp && currentApp !== this.lastApp) {
      if (this.lastApp && elapsed > 0) {
        const current = this.appTimeSpent.get(this.lastApp) || 0;
        this.appTimeSpent.set(this.lastApp, current + elapsed);
      }
      this.lastApp = currentApp;
    } else if (this.lastApp && elapsed > 0) {
      const current = this.appTimeSpent.get(this.lastApp) || 0;
      this.appTimeSpent.set(this.lastApp, current + elapsed);
    }
  }

  private getCurrentUrl(): string | null {
    // Best effort - in Electron, we'd need IPC to get active browser URL
    // For now, return window.location if available
    if (typeof window !== 'undefined' && window.location) {
      const url = window.location.href;
      if (url && !url.startsWith('file://') && !url.startsWith('about:')) {
        try {
          const urlObj = new URL(url);
          return urlObj.hostname;
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  private getCurrentApp(): string | null {
    // Best effort - would need Electron IPC to get active app
    // For now, return null (can be enhanced with IPC calls)
    return null;
  }

  recordBlockedEvent(): void {
    if (this.currentSession) {
      this.currentSession.blockedEvents++;
      this.saveSessions();
    }
  }

  getSessions(): FocusSessionLog[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as FocusActivityStorage;
        if (parsed.version === STORAGE_VERSION && parsed.sessions) {
          return parsed.sessions;
        }
      }
    } catch (error) {
      console.warn('Failed to load sessions:', error);
    }
    return [];
  }

  getTodayStats(): {
    totalMinutes: number;
    sessionCount: number;
    topUrls: Array<{ url: string; minutes: number }>;
    topApps: Array<{ app: string; minutes: number }>;
  } {
    const sessions = this.getSessions();
    const today = new Date().toISOString().split('T')[0];
    
    const todaySessions = sessions.filter((s) => s.startedAt.startsWith(today));
    const totalSeconds = todaySessions.reduce((sum, s) => sum + s.duration, 0);
    
    const urlMap = new Map<string, number>();
    const appMap = new Map<string, number>();
    
    todaySessions.forEach((session) => {
      session.activities.forEach((activity) => {
        if (activity.type === 'url' && activity.url && activity.duration) {
          const current = urlMap.get(activity.url) || 0;
          urlMap.set(activity.url, current + activity.duration);
        }
        if (activity.type === 'app' && activity.appName && activity.duration) {
          const current = appMap.get(activity.appName) || 0;
          appMap.set(activity.appName, current + activity.duration);
        }
      });
    });

    const topUrls = Array.from(urlMap.entries())
      .map(([url, seconds]) => ({ url, minutes: Math.floor(seconds / 60) }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);

    const topApps = Array.from(appMap.entries())
      .map(([app, seconds]) => ({ app, minutes: Math.floor(seconds / 60) }))
      .sort((a, b) => b.minutes - a.minutes)
      .slice(0, 5);

    return {
      totalMinutes: Math.floor(totalSeconds / 60),
      sessionCount: todaySessions.length,
      topUrls,
      topApps,
    };
  }
}

export default FocusActivityTracker;






