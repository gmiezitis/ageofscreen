import rainSound from "../assets/sounds/rain.mp3";
import jazzSound from "../assets/sounds/jazz.mp3";
import classicalSound from "../assets/sounds/classical.mp3";
import whiteNoiseSound from "../assets/sounds/white noise.mp3";
import type { BuiltInFocusTimerSound } from "./focusTimerSounds";

export const BUILTIN_FOCUS_TIMER_SOUNDS: BuiltInFocusTimerSound[] = [
    { id: "rain", label: "Rain", icon: "rain", file: rainSound },
    { id: "jazz", label: "Jazz", icon: "jazz", file: jazzSound },
    { id: "classical", label: "Classical", icon: "classical", file: classicalSound },
    { id: "white", label: "White Noise", icon: "white", file: whiteNoiseSound },
];
