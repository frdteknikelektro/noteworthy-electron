"use client";

import {
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogContent
} from "@/renderer/components/ui/dialog";
import { Input } from "@/renderer/components/ui/input";
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
import { useApp } from "@/renderer/app-provider";
import { LANGUAGE_LABELS, MODEL_OPTIONS } from "@/renderer/settings/constants";

const PROVIDER_OPTIONS = [{ value: "openai", label: "OpenAI" }];

export default function SettingsModal() {
  const {
    preferences,
    isCapturing,
    model,
    settingsOpen,
    setSettingsOpen,
    handleModelChange,
    handleLanguageChange,
    handleSilenceChange
  } = useApp();

  const inputDisabled = isCapturing;
  const handleModelSelect = value => handleModelChange({ target: { value } });
  const handleLanguageSelect = value => handleLanguageChange({ target: { value } });

  return (
    <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Realtime capture settings</DialogTitle>
          <DialogDescription>
            Choose your provider, model, default transcription language, and idle detection threshold for live capture.
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

          <div className="grid gap-6 sm:grid-cols-2">
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
            <Field>
              <FieldLabel htmlFor="idle">Idle detection (seconds)</FieldLabel>
              <FieldContent>
                <Input
                  id="idle"
                  type="number"
                  min="1"
                  max="30"
                  step="0.5"
                  inputMode="decimal"
                  value={preferences.silenceSeconds}
                  onChange={handleSilenceChange}
                  disabled={inputDisabled}
                />
              </FieldContent>
            </Field>
          </div>
        </div>

      </DialogContent>
    </Dialog>
  );
}
