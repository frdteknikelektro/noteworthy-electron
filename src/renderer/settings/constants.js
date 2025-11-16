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
  silenceSeconds: 5
};

export const MODEL_OPTIONS = ["whisper-1", "gpt-4o-transcribe", "gpt-4o-mini-transcribe"];

export const STATUS_VARIANTS = {
  microphone: {
    connected: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
    disconnected: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
  },
  speaker: {
    connected: "bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-200",
    disconnected: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
  },
  recording: {
    connected: "bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-200",
    disconnected: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
  }
};

export const SECTION_CARD =
  "rounded-2xl border border-slate-200 bg-white/80 shadow-sm shadow-slate-900/5 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-50";
export const INPUT_BASE =
  "w-full appearance-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50";

export const THEME_STORAGE_KEY = "mic-speaker-streamer.theme";
export const THEME_MODES = ["system", "light", "dark"];
export const THEME_ICONS = { system: "🌓", light: "☀️", dark: "🌙" };
export const THEME_LABELS = { system: "System", light: "Light", dark: "Dark" };
