"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CircleDot, Mic, MicOff, StopCircle } from "lucide-react";

import { useApp } from "@/renderer/app-provider";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
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

function compareTimestamps(valueA, valueB) {
  const timestampA = valueA || "";
  const timestampB = valueB || "";
  return timestampB.localeCompare(timestampA);
}

export function NoteWorkspace() {
  const {
    activeNote,
    drafts,
    isCapturing,
    startCapture,
    stopCapture,
    updateNoteTitle,
    generateSummary,
    micMuted,
    toggleMicMute
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

  const updatedTimestamp = useMemo(() => formatTimestamp(activeNote?.updatedAt), [activeNote?.updatedAt]);

  const storedSummaries = activeNote?.summaries || [];

  const canGenerateSummary = transcriptEntries.some(entry => Boolean(entry.text));

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

  const handleRecordToggle = useCallback(() => {
    if (isCapturing) {
      stopCapture();
      return;
    }
    void startCapture();
  }, [isCapturing, startCapture, stopCapture]);

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
            <TabsTrigger value="summary" className="gap-1">
              Summary{" "}
              <Badge
                variant="secondary"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-muted-foreground/30"
              >
                {storedSummaries.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="h-px w-full bg-border/70" aria-hidden="true" />

          <TabsContent value="transcription" className="space-y-6">
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap justify-center items-center gap-3">
                <Button
                  variant={isCapturing ? "destructive" : "secondary"}
                  onClick={handleRecordToggle}
                  aria-label={isCapturing ? "Stop recording session" : "Start recording session"}
                  className="flex items-center gap-2 px-4 py-2 text-sm"
                >
                  {isCapturing ? (
                    <StopCircle className="h-4 w-4 text-destructive-foreground" />
                  ) : (
                    <CircleDot className="h-4 w-4 text-foreground" />
                  )}
                  <span>Record Session</span>
                </Button>

                <Button
                  size="icon"
                  variant="secondary"
                  disabled={isCapturing}
                  onClick={toggleMicMute}
                  aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
                  className={"transition-colors duration-150 text-foreground"}
                >
                  {micMuted ? (
                    <MicOff className="h-4 w-4 text-foreground" />
                  ) : (
                    <Mic className="h-4 w-4 text-foreground" />
                  )}
                  <span className="sr-only">Microphone {micMuted ? "muted" : "active"}</span>
                </Button>
              </div>
            </div>

            <div ref={transcriptsRef} className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Showing every transcript entry, newest first.
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
