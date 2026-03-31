import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TimerWidgetPayload } from '../focus/types';

export type TaskColor = 'green' | 'yellow' | 'red';

export interface Task {
  id: string;
  title: string;
  plannedHours: number; // Integer 0-1000
  usedMinutes: number;
  color: TaskColor;
  createdAt: number;
  completedAt: number | null;
  showTimerWidget?: boolean; // Show floating timer when active
  breakIntervalMinutes?: number; // Break interval (default 60)
}

export interface HistoryEntry {
  id: string;
  title: string;
  minutes: number;
  finishedAt: number;
  category: TaskColor;
}

export interface TaskTreeState {
  // Tasks
  tasks: Task[];

  // Timer state
  activeTaskId: string | null;
  lastTickMs: number | null;
  isLocked: boolean;

  // Timer widget state
  showTimerWidget: boolean;
  timerWidgetStartedAt: number | null;

  // UI state
  animationsEnabled: boolean;

  // History
  history: HistoryEntry[];
  lastExportFilter?: HistoryExportFilter;

  // Actions
  addTask: (title: string, plannedHours: number, color: TaskColor) => void;
  updateTask: (id: string, updates: Partial<Omit<Task, 'id' | 'createdAt'>>) => void;
  deleteTask: (id: string) => void;
  completeTask: (id: string) => void;

  // Timer actions
  startTimer: (taskId: string) => void;
  pauseTimer: () => void;
  tick: () => void;
  adjustTime: (taskId: string, minutesDelta: number) => void;
  stopTimerWidget: () => void;

  // UI actions
  setAnimationsEnabled: (enabled: boolean) => void;

  // Lock actions
  setLocked: (locked: boolean) => void;

  // History export helpers
  setLastExportFilter: (filter: HistoryExportFilter | undefined) => void;
  removeHistoryEntry: (id: string) => void;
}

export interface HistoryExportFilter {
  fromUtc?: string;
  toUtc?: string;
  category?: TaskColor | 'all';
}

const getTimerWidgetControls = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  return (window as any).electronAPI?.timerWidget ?? null;
};

const syncTimerWidgetVisibility = (state: TaskTreeState) => {
  const timerControls = getTimerWidgetControls();
  if (!timerControls) {
    return;
  }

  if (
    state.activeTaskId &&
    state.showTimerWidget &&
    state.timerWidgetStartedAt
  ) {
    const activeTask = state.tasks.find((task) => task.id === state.activeTaskId);
    if (activeTask && activeTask.showTimerWidget) {
      const payload: TimerWidgetPayload = {
        taskId: activeTask.id,
        taskName: activeTask.title || 'Task',
        breakIntervalMinutes: activeTask.breakIntervalMinutes ?? 60,
        breakDurationMinutes: 10,
        startedAt: state.timerWidgetStartedAt,
      };
      timerControls.show?.(payload);
      return;
    }
  }

  timerControls.hide?.();
};

export const useTaskTreeStore = create<TaskTreeState>()(
  persist(
    (set, get) => {
      const ensureTimerSync = () => {
        const current = get();
        syncTimerWidgetVisibility(current);
        setTimeout(() => syncTimerWidgetVisibility(get()), 0);
      };

      return {
        // Initial state
        tasks: [] as Task[],
        activeTaskId: null as string | null,
        lastTickMs: null as number | null,
        isLocked: false,
        showTimerWidget: false,
        timerWidgetStartedAt: null as number | null,
        animationsEnabled: false, // Hidden by default
        history: [] as HistoryEntry[],
        lastExportFilter: undefined as string | undefined,

        // Add task
        addTask: (title, plannedHours, color) => {
          const state = get();
          if (state.tasks.length >= 3) {
            console.warn('Maximum 3 tasks allowed');
            return;
          }

          const newTask: Task = {
            id: `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title,
            plannedHours: Math.min(Math.max(0, Math.round(plannedHours)), 1000),
            usedMinutes: 0,
            color,
            createdAt: Date.now(),
            completedAt: null,
          };

          set({ tasks: [...state.tasks, newTask] });
        },

        // Update task
        updateTask: (id, updates) => {
          set((state) => {
            const updatedTasks = state.tasks.map((task) =>
              task.id === id
                ? {
                  ...task,
                  ...updates,
                  plannedHours:
                    updates.plannedHours !== undefined
                      ? Math.min(Math.max(0, Math.round(updates.plannedHours)), 1000)
                      : task.plannedHours,
                  usedMinutes:
                    updates.usedMinutes !== undefined
                      ? Math.max(0, updates.usedMinutes)
                      : task.usedMinutes,
                }
                : task
            );

            const nextState: Partial<TaskTreeState> = { tasks: updatedTasks };

            if (state.activeTaskId === id && updates.showTimerWidget !== undefined) {
              nextState.showTimerWidget = updates.showTimerWidget;
            }

            return nextState;
          });
          ensureTimerSync();
        },

        // Delete task
        deleteTask: (id) => {
          set((state) => {
            // If this task is active, pause it first
            const newState: Partial<TaskTreeState> = {
              tasks: state.tasks.filter((task) => task.id !== id),
            };

            if (state.activeTaskId === id) {
              newState.activeTaskId = null;
              newState.lastTickMs = null;
              newState.showTimerWidget = false;
              newState.timerWidgetStartedAt = null;
            }

            return newState;
          });
          ensureTimerSync();
        },

        // Complete task
        completeTask: (id) => {
          set((state) => {
            const task = state.tasks.find((t) => t.id === id);
            if (!task) return state;

            // Pause timer if this task is active
            const newState: Partial<TaskTreeState> = {};
            if (state.activeTaskId === id) {
              newState.activeTaskId = null;
              newState.lastTickMs = null;
              newState.showTimerWidget = false;
              newState.timerWidgetStartedAt = null;
            }

            // Add to history
            const historyEntry: HistoryEntry = {
              id: task.id,
              title: task.title,
              minutes: task.usedMinutes,
              finishedAt: Date.now(),
              category: task.color,
            };

            return {
              ...newState,
              tasks: state.tasks.filter((t) => t.id !== id),
              history: [historyEntry, ...state.history].slice(0, 50), // Keep last 50
            };
          });
          ensureTimerSync();
        },

        // Start timer
        startTimer: (taskId) => {
          const state = get();
          const task = state.tasks.find((t) => t.id === taskId);
          if (!task) return;

          const startedAt = Date.now();

          set({
            activeTaskId: taskId,
            lastTickMs: startedAt,
            showTimerWidget: task.showTimerWidget === true,
            timerWidgetStartedAt: startedAt,
          });
          ensureTimerSync();
        },

        // Pause timer
        pauseTimer: () => {
          set({
            activeTaskId: null,
            lastTickMs: null,
            showTimerWidget: false,
            timerWidgetStartedAt: null,
          });
          ensureTimerSync();
        },

        // Stop timer widget
        stopTimerWidget: () => {
          get().pauseTimer();
        },

        // Tick (called every second)
        tick: () => {
          const state = get();
          if (!state.activeTaskId || state.isLocked || !state.lastTickMs) return;

          const now = Date.now();
          const deltaMs = now - state.lastTickMs;
          const deltaMinutes = deltaMs / (1000 * 60);

          const task = state.tasks.find((t) => t.id === state.activeTaskId);
          if (!task) {
            set({ activeTaskId: null, lastTickMs: null });
            return;
          }

          const plannedMinutes = task.plannedHours * 60;
          const newUsedMinutes = Math.min(
            task.usedMinutes + deltaMinutes,
            plannedMinutes > 0 ? plannedMinutes : Number.MAX_SAFE_INTEGER
          );

          set((state) => ({
            tasks: state.tasks.map((t) =>
              t.id === state.activeTaskId
                ? { ...t, usedMinutes: newUsedMinutes }
                : t
            ),
            lastTickMs: now,
          }));
        },

        // Adjust time manually
        adjustTime: (taskId, minutesDelta) => {
          set((state) => ({
            tasks: state.tasks.map((task) =>
              task.id === taskId
                ? {
                  ...task,
                  usedMinutes: Math.max(0, task.usedMinutes + minutesDelta),
                }
                : task
            ),
          }));
        },

        // Toggle widget open/closed
        // Set animations enabled
        setAnimationsEnabled: (enabled) => {
          set({ animationsEnabled: enabled });
        },

        // Set locked (for screen lock detection)
        setLocked: (locked) => {
          set({ isLocked: locked });
          // Auto-pause when locked
          if (locked) {
            get().pauseTimer();
          }
        },

        setLastExportFilter: (filter) => {
          set({ lastExportFilter: filter });
        },

        removeHistoryEntry: (id) => {
          set((state) => ({ history: state.history.filter((entry) => entry.id !== id) }));
        },
      };
    },
    {
      name: 'task-tree-storage',
      partialize: (state) => ({
        tasks: state.tasks,
        animationsEnabled: state.animationsEnabled,
        history: state.history,
        lastExportFilter: state.lastExportFilter,
        // Don't persist activeTaskId or lastTickMs
      }),
    }
  )
);

