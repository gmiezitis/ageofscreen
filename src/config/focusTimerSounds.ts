export interface BuiltInFocusTimerSound {
    id: string;
    label: string;
    icon: "rain" | "jazz" | "classical" | "white";
    file: string;
}

export const BUILTIN_FOCUS_TIMER_SOUNDS: BuiltInFocusTimerSound[] = [];
