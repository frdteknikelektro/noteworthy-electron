"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Mic2, MicOff, Volume2, VolumeX } from "lucide-react";

import { useApp, DEFAULT_MIC_SELECTION_VALUE } from "@/renderer/app-provider";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/renderer/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/renderer/components/ui/select";
import { cn } from "@/renderer/lib/utils";

const SOURCE_LABELS = {
  microphone: "Microphone",
  speaker: "System audio"
};

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function compareTimestamps(valueA, valueB) {
  const timestampA = valueA || "";
  const timestampB = valueB || "";
  return timestampB.localeCompare(timestampA);
}

function StreamIndicator({ label, active, accentClasses }) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-border/60 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      <span
        className={cn(
          "h-2.5 w-2.5 rounded-full border transition",
          active ? accentClasses : "bg-muted border-border/60"
        )}
        aria-hidden="true"
      />
      <span>{label}</span>
    </div>
  );
}

export function NoteWorkspace() {
  const {
    activeNote,
    drafts,
    isCapturing,
    startCapture,
    stopCapture,
    toggleRecording,
    isRecording,
    streamStatus,
    updateNoteTitle,
    generateSummary,
    micDevices,
    micDeviceId,
    handleMicChange,
    micMuted,
    toggleMicMute,
    systemAudioEnabled,
    toggleSystemAudio,
  } = useApp();

  const titleRef = useRef(null);
  const previousNoteIdRef = useRef(null);
  const transcriptsRef = useRef(null);
  const [summaryPrompt, setSummaryPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryFeedback, setSummaryFeedback] = useState("");

  const sortedDraftEntries = useMemo(() => {
    const entries = Object.values(drafts)
      .filter(Boolean)
      .map(draft => ({ ...draft, isDraft: true }));
    return entries.sort((a, b) => compareTimestamps(a.timestamp, b.timestamp));
  }, [drafts]);

  const sortedNoteEntries = useMemo(() => {
    const entries = [...(activeNote?.transcript || [])];
    return entries.sort((a, b) => compareTimestamps(a.timestamp, b.timestamp));
  }, [activeNote?.transcript]);

  const transcriptEntries = useMemo(
    () => [...sortedDraftEntries, ...sortedNoteEntries],
    [sortedDraftEntries, sortedNoteEntries]
  );

  const availableMicDevices = useMemo(
    () => micDevices.filter(device => Boolean(device.deviceId)),
    [micDevices]
  );

  const hasActiveDraft = sortedDraftEntries.length > 0;

  const updatedTimestamp = useMemo(() => formatTimestamp(activeNote?.updatedAt), [activeNote?.updatedAt]);

  const storedSummaries = activeNote?.summaries || [];

  const canGenerateSummary = transcriptEntries.some(entry => Boolean(entry.text));
  const isListening = hasActiveDraft;

  useLayoutEffect(() => {
    const titleElement = titleRef.current;
    if (!titleElement) return;

    const noteTitle = activeNote?.title || "";
    const currentNoteId = activeNote?.id;

    if (previousNoteIdRef.current !== currentNoteId) {
      titleElement.textContent = noteTitle;
      previousNoteIdRef.current = currentNoteId;
      return;
    }

    if (document.activeElement === titleElement) return;

    if (titleElement.textContent !== noteTitle) {
      titleElement.textContent = noteTitle;
    }
  }, [activeNote?.id, activeNote?.title]);

  const handleGenerateSummary = async () => {
    if (!canGenerateSummary || isGenerating || !activeNote?.id) return;
    setSummaryError("");
    setIsGenerating(true);
    setSummaryFeedback("");

    try {
      await generateSummary(activeNote.id, summaryPrompt);
      setSummaryPrompt("");
    } catch (error) {
      console.error(error);
      setSummaryError(error?.message || "Unable to generate summary.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopySummary = async summary => {
    setSummaryError("");
    setSummaryFeedback("");
    if (!navigator?.clipboard || !summary?.body) {
      setSummaryError("Clipboard is not available.");
      return;
    }

    try {
      await navigator.clipboard.writeText(summary.body);
      setSummaryFeedback("Copied to clipboard.");
    } catch (error) {
      console.error("Copy failed", error);
      setSummaryError("Unable to copy summary.");
    }
  };

  const handleDownloadSummary = summary => {
    setSummaryError("");
    setSummaryFeedback("");
    if (!summary?.body) {
      setSummaryError("Summary body is empty.");
      return;
    }

    try {
      const sanitized = summary.prompt
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const filename = `${sanitized || "summary"}-${summary.id}.txt`;
      const blob = new Blob([summary.body], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setSummaryFeedback("Download started.");
    } catch (error) {
      console.error("Download failed", error);
      setSummaryError("Unable to download summary.");
    }
  };

  const showPlaceholder = transcriptEntries.length === 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-2 flex-1">
          <div
            role="textbox"
            aria-label="Session title"
            tabIndex={0}
            className="session-title text-2xl font-semibold leading-snug text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            contentEditable
            suppressContentEditableWarning
            spellCheck={false}
            data-placeholder="Untitled session"
            ref={titleRef}
            onInput={event => {
              if (!activeNote?.id) return;
              const title = event.currentTarget.textContent || "";
              updateNoteTitle(activeNote.id, title);
            }}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          ></div>
          {updatedTimestamp && (
            <p className="text-xs text-muted-foreground">Last Updated {updatedTimestamp}</p>
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-4">
        <Tabs defaultValue="transcription" className="space-y-4">
          <TabsList>
            <TabsTrigger value="transcription">Transcription</TabsTrigger>
            <TabsTrigger value="summary">
              <div className="flex items-center gap-2">
                Summary
                <Badge variant="secondary" className="text-xs font-semibold uppercase">
                  {storedSummaries.length}
                </Badge>
              </div>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="transcription" className="space-y-6">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={isCapturing ? "destructive" : "default"}
                  onClick={isCapturing ? stopCapture : startCapture}
                >
                  {isCapturing ? "Stop" : "Start"}
                </Button>
                <Button
                  variant={isRecording ? "destructive" : "outline"}
                  onClick={toggleRecording}
                  disabled={!isCapturing}
                >
                  {isRecording ? "Stop recording" : "Record"}
                </Button>
                {isRecording && <Badge variant="destructive">Recording</Badge>}
              </div>
              <div className="flex flex-wrap items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1.5">
                <Button
                  size="sm"
                  variant={micMuted ? "outline" : "secondary"}
                  onClick={toggleMicMute}
                  className="gap-2"
                >
                  {micMuted ? <MicOff className="h-4 w-4" /> : <Mic2 className="h-4 w-4" />}
                  {micMuted ? "Mic muted" : "Mic live"}
                </Button>
                <Select value={micDeviceId || DEFAULT_MIC_SELECTION_VALUE} onValueChange={handleMicChange}>
                  <SelectTrigger className="min-w-[170px] text-sm font-medium">
                    <SelectValue placeholder="Default microphone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem key="default-mic" value={DEFAULT_MIC_SELECTION_VALUE}>Default microphone</SelectItem>
                    {availableMicDevices.map((device, index) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${index + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant={systemAudioEnabled ? "secondary" : "outline"}
                  onClick={toggleSystemAudio}
                  className="gap-2"
                >
                  {systemAudioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                  {systemAudioEnabled ? "System on" : "System off"}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <StreamIndicator
                  label="Mic"
                  active={isCapturing && streamStatus.microphone && !micMuted}
                  accentClasses="bg-emerald-400 border-emerald-600 shadow-[0_0_0_3px_rgba(16,185,129,0.45)]"
                />
                <StreamIndicator
                  label="System"
                  active={isCapturing && streamStatus.speaker}
                  accentClasses="bg-sky-400 border-sky-600 shadow-[0_0_0_3px_rgba(56,189,248,0.35)]"
                />
              </div>
            </div>

            <div ref={transcriptsRef} className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Showing every transcript entry, newest first, so you always see the full capture without a scroll trap.
              </p>
              {showPlaceholder ? (
                <div className="rounded-xl border border-dashed border-border/50 bg-background/80 p-5 text-sm text-muted-foreground">
                  Start capture to see live transcription entries.
                </div>
              ) : (
                transcriptEntries.map(entry => (
                  <article
                    key={entry.id}
                    className={cn(
                      "space-y-2 rounded-xl border border-border bg-background/80 p-4",
                      "shadow-sm"
                    )}
                  >
                    <header className="flex flex-wrap items-center gap-2 text-xs uppercase text-muted-foreground">
                      <Badge variant={entry.source === "microphone" ? "accent" : "secondary"}>
                        {SOURCE_LABELS[entry.source] || entry.source}
                      </Badge>
                      {entry.statusLabel && <span>{entry.statusLabel}</span>}
                      <span>{formatTimestamp(entry.timestamp)}</span>
                    </header>
                    <p className={cn("text-sm text-foreground", entry.isDraft ? "font-medium text-muted-foreground" : "text-foreground")}>
                      {entry.text || "Waiting for audio…"}
                    </p>
                  </article>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="summary" className="space-y-5">
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase text-muted-foreground">Summary prompt</div>
              <textarea
                value={summaryPrompt}
                onChange={event => setSummaryPrompt(event.target.value)}
                placeholder="E.g., highlight key decisions, action items, or next steps."
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                rows={4}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={handleGenerateSummary} disabled={!canGenerateSummary || isGenerating}>
                {isGenerating ? "Generating…" : "Generate summary"}
              </Button>
              <Badge variant="accent">{storedSummaries.length} document{storedSummaries.length === 1 ? "" : "s"}</Badge>
            </div>
            {summaryError && (
              <p className="text-xs text-destructive">{summaryError}</p>
            )}
            {summaryFeedback && (
              <p className="text-xs text-foreground">{summaryFeedback}</p>
            )}

            <div className="space-y-3">
              {storedSummaries.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Summaries based on the transcript will show up here.
                </p>
              ) : (
                storedSummaries.map((entry, index) => (
                  <article
                    key={entry.id}
                    className="space-y-2 rounded-xl border border-border bg-background/80 p-4 shadow-sm"
                  >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase text-muted-foreground">
                      <span>{formatTimestamp(entry.createdAt)}</span>
                      <Badge variant="secondary">Doc {storedSummaries.length - index}</Badge>
                    </div>
                    <p className="text-sm font-semibold text-foreground">{entry.prompt}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleCopySummary(entry)}>
                        Copy
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDownloadSummary(entry)}>
                        Download
                      </Button>
                    </div>
                    <p className="text-sm text-muted-foreground whitespace-pre-line">{entry.body}</p>
                  </article>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
