"use client";

import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent
} from "@/renderer/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/renderer/components/ui/select";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel
} from "@/renderer/components/ui/field";
import { Button } from "@/renderer/components/ui/button";
import { useApp } from "@/renderer/app-provider";
import { useAudio } from "@/renderer/audio-provider";
import {
  LANGUAGE_LABELS,
  MODEL_OPTIONS
} from "@/renderer/settings/constants";

const PROVIDER_OPTIONS = [{ value: "openai", label: "OpenAI" }];

export default function SettingsModal() {
  const {
    preferences,
    model,
    settingsOpen,
    setSettingsOpen,
    handleModelChange,
    handleLanguageChange,
    resetAllData
  } = useApp();
  const { isCapturing, micDevices, micDeviceId, handleMicChange } = useAudio();

  const inputDisabled = isCapturing;
  const handleModelSelect = value => handleModelChange({ target: { value } });
  const handleLanguageSelect = value => handleLanguageChange({ target: { value } });
  const handleResetAll = () => {
    if (!window.confirm("Resetting will delete all notes, folders, and preferences. Continue?")) {
      return;
    }
    resetAllData();
  };

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Choose your provider, model, and default transcription language for live capture.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 px-0 pb-4 pt-2">
          <div className="grid gap-6 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="provider">Provider</FieldLabel>
              <FieldContent>
                <Select id="provider" value={PROVIDER_OPTIONS[0].value} disabled>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_OPTIONS.map(provider => (
                      <SelectItem key={provider.value} value={provider.value}>
                        {provider.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
              <FieldDescription>Only OpenAI is available right now.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="model">Model</FieldLabel>
              <FieldContent>
                <Select id="model" value={model} onValueChange={handleModelSelect} disabled={inputDisabled}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODEL_OPTIONS.map(option => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="microphone">Microphone</FieldLabel>
            <FieldContent>
              <Select
                id="microphone"
                value={micDeviceId || ""}
                onValueChange={handleMicChange}
                disabled={isCapturing}
              >
                <SelectTrigger>
                  <SelectValue placeholder={micDevices.length ? "Select microphone" : "No microphones detected"} />
                </SelectTrigger>
                <SelectContent>
                  {micDevices.length === 0 ? (
                    <SelectItem key="no-mic" value="no-mic" disabled>
                      No microphones detected
                    </SelectItem>
                  ) : (
                    micDevices
                      .filter(device => Boolean(device.deviceId))
                      .map((device, index) => (
                        <SelectItem key={device.deviceId || `mic-${index}`} value={device.deviceId}>
                          {device.label || `Microphone ${index + 1}`}
                        </SelectItem>
                      ))
                  )}
                  {!micDevices.some(device => Boolean(device.deviceId)) && micDevices.length > 0 && (
                    <SelectItem key="no-valid-mic" value="no-mic" disabled>
                      Microphone information pending permissions
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </FieldContent>
            <FieldDescription>
              Choose which microphone should be captured during the next session; changing it restarts the stream automatically.
            </FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="language">Default transcription language</FieldLabel>
            <FieldContent>
              <Select
                id="language"
                value={preferences.language}
                onValueChange={handleLanguageSelect}
                disabled={inputDisabled}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                    <SelectItem key={code} value={code}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldContent>
          </Field>
        </div>

        <div className="border border-border bg-card/80 p-4 text-sm text-muted-foreground">
          <p className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">Danger zone</p>
          <p className="mb-4 text-sm text-muted-foreground">
            Resetting the app returns it to a fresh install: it clears notes, folders, and all saved preferences.
          </p>
          <Button variant="destructive" size="sm" onClick={handleResetAll}>
            Reset All
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  );
}
