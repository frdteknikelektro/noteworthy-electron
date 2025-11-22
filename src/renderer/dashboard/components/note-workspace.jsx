"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import {ArrowDown, ArrowUp, CircleDot, Mic, MicOff, StopCircle} from "lucide-react";

import { useApp } from "@/renderer/app-provider";
import { useAudio } from "@/renderer/audio-provider";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/renderer/components/ui/tabs";
import { Input } from "@/renderer/components/ui/input";
import { cn } from "@/renderer/lib/utils";
import { buildTranscriptSnippet } from "@/renderer/lib/transcript";

const SOURCE_LABELS = {
  microphone: "Microphone",
  speaker: "System audio",
  manual: "Manual context"
};

const SOURCE_BUBBLE_CLASSES = {
  microphone: "bg-sidebar-accent/10 text-sidebar-accent-foreground",
  speaker: "bg-secondary/15 text-secondary-foreground",
  manual: "bg-primary/10 text-secondary-foreground"
};

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function NoteWorkspace() {
  const { activeNote, updateNoteTitle, generateSummary, addManualEntry } = useApp();
  const { drafts, isCapturing, startCapture, stopCapture, micMuted, toggleMicMute } = useAudio();

  const titleRef = useRef(null);
  const previousNoteIdRef = useRef(null);
  const transcriptsRef = useRef(null);
  const [summaryPrompt, setSummaryPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryFeedback, setSummaryFeedback] = useState("");
  const [manualInput, setManualInput] = useState("");

  const draftEntries = useMemo(() => {
    return Object.values(drafts)
      .filter(Boolean)
      .map(draft => ({ ...draft, isDraft: true }));
  }, [drafts]);

  const noteEntries = useMemo(() => {
    return [...(activeNote?.transcript || [])];
  }, [activeNote?.transcript]);

  const transcriptEntries = useMemo(
    () => [...draftEntries, ...noteEntries],
    [draftEntries, noteEntries]
  );

  const updatedTimestamp = useMemo(() => formatTimestamp(activeNote?.updatedAt), [activeNote?.updatedAt]);

  const storedSummaries = activeNote?.summaries || [];

  const canGenerateSummary = transcriptEntries.some(entry => Boolean(entry.text));
  const manualInputLength = manualInput.trim().length;

  const chatMessages = useMemo(
    () =>
      transcriptEntries.map(entry => ({
        id: entry.id,
        text: entry.text || "Waiting for audio…",
        source: entry.source,
        sourceLabel: SOURCE_LABELS[entry.source] || entry.source,
        statusLabel: entry.statusLabel,
        timestamp: entry.timestamp,
        isManual: entry.source === "manual"
      })),
    [transcriptEntries]
  );

  useLayoutEffect(() => {
    const transcriptsElement = transcriptsRef.current;
    if (!transcriptsElement) return;

    transcriptsElement.scrollTop = transcriptsElement.scrollHeight;
  }, [chatMessages.length]);

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
      const snippet = buildTranscriptSnippet(activeNote, drafts);
      await generateSummary(activeNote.id, summaryPrompt, snippet);
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

  const showPlaceholder = chatMessages.length === 0;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 h-full">
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

      <div className="flex flex-1 flex-col gap-4 min-h-0">
        <Tabs defaultValue="transcription" className="flex flex-1 flex-col min-h-0">
          <TabsList className="self-start">
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

          <div className="h-px w-full bg-border/70 mt-4" aria-hidden="true" />

          <TabsContent value="transcription" className="flex flex-1 flex-col gap-6 pb-0 mt-0 overflow-hidden">
            <div className="flex flex-col gap-2 flex-1 min-h-0 overflow-hidden">
              <div className="flex flex-1 min-h-0 flex-col gap-4 overflow-hidden">
                <div
                  ref={transcriptsRef}
                  className="flex flex-1 min-h-0 flex-col gap-3 overflow-y-auto pt-3 pb-16"
                >
                  {showPlaceholder && (
                    <div className="bg-background/80 p-5 text-center text-sm text-muted-foreground">
                      Start capture to see live transcription entries.
                    </div>
                  )}
                  {[
                    ...chatMessages.map(message => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex flex-col gap-2 text-xs",
                          message.isManual ? "items-end" : "items-start"
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[92%] px-4 py-3 text-sm leading-relaxed whitespace-pre-line break-words rounded-sm border border-border/50",
                            SOURCE_BUBBLE_CLASSES[message.source] || "bg-muted/20 text-foreground",
                            message.isManual && "ml-auto border-border/40"
                          )}
                        >
                          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                            <span className="text-[11px] tracking-[0.28em] font-semibold">{message.sourceLabel}</span>
                            <span aria-hidden="true">·</span>
                            <span className="text-[10px] tracking-[0.18em]">{formatTimestamp(message.timestamp)}</span>
                          </div>
                          <p className="mt-2 text-inherit">{message.text}</p>
                        </div>
                      </div>
                    )),
                    isCapturing && chatMessages.length > 0 ? (
                      <div key="manual-context-form" className="flex flex-col gap-2 text-xs items-end">
                        <div
                          className={cn(
                            "max-w-[60%] w-full rounded-sm border border-border/50 px-4 py-3 text-sm leading-relaxed text-foreground",
                            SOURCE_BUBBLE_CLASSES.manual,
                            "ml-auto border-border/40"
                          )}
                        >
                          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                            <span className="text-[11px] tracking-[0.28em] font-semibold">Manual Context</span>
                          </div>
                          <form
                            className="mt-2 flex items-center gap-2"
                            onSubmit={event => {
                              event.preventDefault();
                              const trimmed = manualInput.trim();
                              if (trimmed.length === 0) return;
                              addManualEntry(trimmed);
                              setManualInput("");
                            }}
                          >
                            <Input
                              placeholder="Type manual context..."
                              className="flex-1 border-0 bg-transparent shadow-none px-0 py-0 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-0"
                              autoComplete="off"
                              value={manualInput}
                              onChange={event => setManualInput(event.target.value)}
                            />
                            <Button
                              type="submit"
                              size="icon"
                              variant="ghost"
                              className="rounded-full border border-border/50 bg-muted/70 p-1"
                              disabled={manualInputLength === 0}
                            >
                              <ArrowUp className="h-3 w-3" />
                              <span className="sr-only">Send manual context</span>
                            </Button>
                          </form>
                        </div>
                      </div>
                    ) : null
                  ]}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 absolute bottom-4 left-0 right-0">
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
          </TabsContent>

          <TabsContent value="summary" className="flex flex-1 flex-col gap-5 mt-0 overflow-hidden">
            <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-1 py-4">
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
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
