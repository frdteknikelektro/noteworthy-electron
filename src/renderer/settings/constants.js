"use client";

export const LANGUAGE_LABELS = {
  id: "Bahasa Indonesia",
  en: "English",
  ms: "Bahasa Melayu",
  ja: "Japanese",
  ko: "Korean",
  zh: "Chinese",
  es: "Spanish",
  fr: "French",
  de: "German"
};

export const DEFAULT_PREFERENCES = {
  language: "id",
  prompt: "",
};

export const API_TEMPERATURE = 0.1;
// export const MODEL_OPTIONS = ["whisper-1", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"];
export const MODEL_OPTIONS = ["gpt-4o-transcribe-diarize", "gpt-4o-transcribe"];
export const DEFAULT_MODEL = "gpt-4o-transcribe-diarize";

export const STATUS_VARIANTS = {
  microphone: {
    connected: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    disconnected: "bg-muted text-muted-foreground"
  },
  speaker: {
    connected: "bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-200",
    disconnected: "bg-muted text-muted-foreground"
  },
  recording: {
    connected: "bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-200",
    disconnected: "bg-muted text-muted-foreground"
  }
};

export const SECTION_CARD =
  "rounded-2xl border border-border bg-card/80 shadow-sm shadow-border/10 backdrop-blur-sm text-foreground";
export const INPUT_BASE =
  "w-full appearance-none rounded-2xl border border-input bg-background px-3 py-2 text-sm font-medium text-foreground transition focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-70";

export const THEME_STORAGE_KEY = "mic-speaker-streamer.theme";
export const THEME_MODES = ["system", "light", "dark"];
export const THEME_ICONS = { system: "🌓", light: "☀️", dark: "🌙" };
export const THEME_LABELS = { system: "System", light: "Light", dark: "Dark" };
