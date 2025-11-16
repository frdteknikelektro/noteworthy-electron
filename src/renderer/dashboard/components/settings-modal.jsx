"use client";

import { Button } from "@/renderer/components/ui/button";
import {
  Dialog,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogClose
} from "@/renderer/components/ui/dialog";
import { useApp } from "@/renderer/app-provider";
import {
  INPUT_BASE,
  LANGUAGE_LABELS,
  MODEL_OPTIONS,
  SECTION_CARD,
  STATUS_VARIANTS
} from "@/renderer/settings/constants";

export default function SettingsModal() {
  const {
    activeNote,
    preferences,
    isCapturing,
    streamStatus,
    isRecording,
    micDevices,
    micDeviceId,
    model,
    settingsOpen,
    setSettingsOpen,
    startCapture,
    stopCapture,
    toggleRecording,
    handleMicChange,
    handleModelChange,
    handleLanguageChange,
    handlePromptChange,
    handleSilenceChange
  } = useApp();

  const canCapture = Boolean(activeNote && !activeNote.archived);
  const startDisabled = isCapturing || !canCapture;
  const stopDisabled = !isCapturing;
  const recordDisabled = !isCapturing;
  const micSelectDisabled = isCapturing;
  const modelSelectDisabled = isCapturing;
  const languageSelectDisabled = isCapturing;
  const silenceInputDisabled = isCapturing;
  const recordButtonLabel = isRecording ? "Stop backup recording" : "Start backup recording";
  const micStatusLabel = streamStatus.microphone ? "Microphone live" : "Microphone offline";
  const speakerStatusLabel = streamStatus.speaker ? "System audio live" : "System audio offline";
  const recordStatusLabel = isRecording ? "Backup recording active" : "Backup recording idle";

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Capture settings</DialogTitle>
          <DialogDescription>
            Start and stop capture sessions, select the desired realtime model, and tune transcription preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${SECTION_CARD} p-6`}>
            <div>
              <span className="text-[0.6rem] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">
                Capture controls
              </span>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Start microphone and system audio sessions.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="default" type="button" onClick={startCapture} disabled={startDisabled}>
                Start capture
              </Button>
              <Button variant="secondary" type="button" onClick={stopCapture} disabled={stopDisabled}>
                Stop capture
              </Button>
              <Button variant="secondary" type="button" onClick={toggleRecording} disabled={recordDisabled}>
                {recordButtonLabel}
              </Button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                Microphone
                <select value={micDeviceId} onChange={handleMicChange} disabled={micSelectDisabled} className={INPUT_BASE}>
                  <option value="">Default microphone</option>
                  {micDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${device.deviceId.slice(-4)}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                RT model
                <select value={model} onChange={handleModelChange} disabled={modelSelectDisabled} className={INPUT_BASE}>
                  {MODEL_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <span
                className={`rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] ${
                  STATUS_VARIANTS.microphone[streamStatus.microphone ? "connected" : "disconnected"]
                }`}
              >
                {micStatusLabel}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] ${
                  STATUS_VARIANTS.speaker[streamStatus.speaker ? "connected" : "disconnected"]
                }`}
              >
                {speakerStatusLabel}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] ${
                  STATUS_VARIANTS.recording[isRecording ? "connected" : "disconnected"]
                }`}
              >
                {recordStatusLabel}
              </span>
            </div>
          </section>
          <section className={`${SECTION_CARD} p-6`}>
            <div className="space-y-1">
              <span className="text-[0.6rem] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">
                Preferences
              </span>
              <p className="text-sm text-slate-600 dark:text-slate-300">Adjust transcription context and VAD timing.</p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Transcription language</span>
                <select value={preferences.language} onChange={handleLanguageChange} disabled={languageSelectDisabled} className={INPUT_BASE}>
                  {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Context prompt</span>
                <input
                  className={INPUT_BASE}
                  type="text"
                  placeholder="e.g., team names or glossary"
                  value={preferences.prompt}
                  onChange={handlePromptChange}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Idle detection (seconds)</span>
                <input
                  className={INPUT_BASE}
                  type="number"
                  min="1"
                  max="30"
                  step="0.5"
                  inputMode="decimal"
                  value={preferences.silenceSeconds}
                  onChange={handleSilenceChange}
                  disabled={silenceInputDisabled}
                />
              </label>
            </div>
          </section>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
