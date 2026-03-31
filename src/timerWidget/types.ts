export interface TimerWidgetPayload {
  taskId: string;
  taskName: string;
  startedAt: number;
  breakIntervalMinutes: number;
  breakDurationMinutes: number;
}

export interface TimerWidgetAlert {
  title: string;
  message: string;
  timestamp?: number;
}


