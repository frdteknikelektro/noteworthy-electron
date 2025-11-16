"use client";

import { useMemo, useState } from "react";

import { useApp } from "@/renderer/app-provider";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Input } from "@/renderer/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/renderer/components/ui/tabs";
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
    generateSummary
  } = useApp();

  const [summaryPrompt, setSummaryPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryFeedback, setSummaryFeedback] = useState("");

  const transcriptEntries = useMemo(() => {
    const noteEntries = activeNote?.transcript || [];
    const draftEntries = Object.values(drafts)
      .filter(Boolean)
      .map(draft => ({ ...draft, isDraft: true }));
    return [...noteEntries, ...draftEntries];
  }, [activeNote, drafts]);

  const noteTimestamp = useMemo(() => {
    if (!activeNote) return "";
    return formatTimestamp(activeNote.updatedAt || activeNote.createdAt);
  }, [activeNote]);

  const storedSummaries = activeNote?.summaries || [];

  const canGenerateSummary = transcriptEntries.some(entry => Boolean(entry.text));

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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6">
      <div className="space-y-2">
        <div className="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">Session title</div>
        <Input
          value={activeNote?.title || ""}
          onChange={event => updateNoteTitle(activeNote?.id, event.target.value)}
          placeholder="Untitled session"
        />
        {noteTimestamp && (
          <p className="text-xs text-muted-foreground">Updated {noteTimestamp}</p>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-4">
        <Tabs defaultValue="transcription" className="space-y-4">
            <TabsList>
              <TabsTrigger value="transcription">Transcription</TabsTrigger>
              <TabsTrigger value="summary">
                <div className="flex items-center gap-2">
                  Summary
                  <Badge variant="secondary" className="text-[0.5rem] font-semibold uppercase tracking-[0.2em]">
                    {storedSummaries.length}
                  </Badge>
                </div>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="transcription" className="space-y-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  variant={isCapturing ? "destructive" : "default"}
                  onClick={isCapturing ? stopCapture : startCapture}
                >
                  {isCapturing ? "Mic (Mute)" : "Mic (Start)"}
                </Button>
                <Button
                  variant={isRecording ? "destructive" : "outline"}
                  onClick={toggleRecording}
                  disabled={!isCapturing}
                >
                  {isRecording ? "Stop recording" : "Record"}
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={streamStatus.microphone ? "accent" : "secondary"}>
                    {streamStatus.microphone ? "Mic active" : "Mic idle"}
                  </Badge>
                  <Badge variant={streamStatus.speaker ? "accent" : "secondary"}>
                    {streamStatus.speaker ? "System audio" : "System pending"}
                  </Badge>
                  {isRecording && <Badge variant="destructive">Recording</Badge>}
                </div>
              </div>

              <div className="max-h-[320px] overflow-y-auto space-y-3">
                {transcriptEntries.length === 0 ? (
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
                      <header className="flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
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
                <div className="text-xs font-semibold uppercase tracking-[0.4em] text-muted-foreground">Summary prompt</div>
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
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[0.65rem] uppercase tracking-[0.3em] text-muted-foreground">
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
