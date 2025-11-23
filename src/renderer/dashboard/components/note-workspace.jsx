"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {ArrowUp, CalendarDays, CircleDot, Folder, Mic, MicOff, StopCircle} from "lucide-react";
import { LiveAudioVisualizer } from "react-audio-visualize";

import { useApp } from "@/renderer/app-provider";
import { useAudio } from "@/renderer/audio-provider";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/renderer/components/ui/tabs";
import { Input } from "@/renderer/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/renderer/components/ui/select";
import { cn } from "@/renderer/lib/utils";
import { buildTranscriptSnippet } from "@/renderer/lib/transcript";

const SOURCE_LABELS = {
  microphone: "Microphone",
  speaker: "System audio",
  manual: "Manual context",
  initial: "Initial context"
};

const SOURCE_BUBBLE_CLASSES = {
  microphone: "bg-sidebar-accent/10 text-sidebar-accent-foreground",
  speaker: "bg-secondary/15 text-secondary-foreground",
  manual: "bg-primary/10 text-secondary-foreground",
  initial: "bg-secondary/10 text-secondary-foreground"
};

const UNASSIGNED_FOLDER_VALUE = "__unassigned";

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

export function NoteWorkspace() {
  const {
    activeNote,
    updateNoteTitle,
    generateSummary,
    addManualEntry,
    addInitialEntry,
    updateTranscriptEntry,
    updateNoteInitialContext,
    assignNoteFolder,
    folders,
    themeMode,
    systemPrefersDark
  } = useApp();
  const { drafts, isCapturing, startCapture, stopCapture, micMuted, toggleMicMute, isRecording, mediaRecorder } = useAudio();

  const titleRef = useRef(null);
  const previousNoteIdRef = useRef(null);
  const transcriptsRef = useRef(null);
  const [summaryPrompt, setSummaryPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [summaryError, setSummaryError] = useState("");
  const [summaryFeedback, setSummaryFeedback] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [initialContextInput, setInitialContextInput] = useState("");

  const folderSummaryPrompt = useMemo(() => {
    if (!activeNote?.folderId) return "";
    const folder = folders.find(folder => folder.id === activeNote.folderId);
    return folder?.defaultSummaryPrompt?.trim() || "";
  }, [folders, activeNote?.folderId]);

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

  const createdTimestamp = useMemo(() => formatTimestamp(activeNote?.createdAt), [activeNote?.createdAt]);
  const folderSelectionValue = activeNote?.folderId ?? UNASSIGNED_FOLDER_VALUE;

  const storedSummaries = activeNote?.summaries || [];

  const canGenerateSummary = transcriptEntries.some(entry => Boolean(entry.text));
  const manualInputLength = manualInput.trim().length;
  const hasInitialEntry = noteEntries.some(entry => entry.source === "initial");
  const showInitialForm = !hasInitialEntry;
  const isLiveVisualizerActive = isRecording && mediaRecorder;
  const themeTone = themeMode === "system" ? (systemPrefersDark ? "dark" : "light") : themeMode;
  const visualizerColors =
    themeTone === "dark"
      ? {
          barColor: "rgba(255,255,255,0.65)",
          barPlayedColor: "rgba(255,255,255,0.95)"
        }
      : {
          barColor: "rgba(0,0,0,0.65)",
          barPlayedColor: "rgba(0,0,0,0.95)"
        };

  useEffect(() => {
    setInitialContextInput(activeNote?.initialContext || "");
  }, [activeNote?.id, activeNote?.initialContext]);

  const handleFolderChange = useCallback(
    value => {
      if (!activeNote?.id) return;
      assignNoteFolder(activeNote.id, value === UNASSIGNED_FOLDER_VALUE ? null : value);
    },
    [activeNote?.id, assignNoteFolder]
  );

  const chatMessages = useMemo(
    () =>
      transcriptEntries.map(entry => {
        const textValue = entry.text ?? "";
        return {
          id: entry.id,
          text: textValue || "Waiting for audio…",
          hasText: Boolean(textValue),
          source: entry.source,
          sourceLabel: SOURCE_LABELS[entry.source] || entry.source,
          statusLabel: entry.statusLabel,
          timestamp: entry.timestamp,
          isManual: entry.source === "manual",
          isInitial: entry.source === "initial",
          isDraft: Boolean(entry.isDraft)
        };
      }),
    [transcriptEntries]
  );

  useLayoutEffect(() => {
    const transcriptsElement = transcriptsRef.current;
    if (!transcriptsElement) return;

    transcriptsElement.scrollTop = transcriptsElement.scrollHeight;
  }, [chatMessages.length, isCapturing]);

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

  const handleTranscriptCommit = useCallback(
    (message, event) => {
      if (!activeNote?.id) return;
      const text = event.currentTarget.textContent || "";
      if (text === message.text) return;
      updateTranscriptEntry(activeNote.id, message.id, text);
    },
    [activeNote?.id, updateTranscriptEntry]
  );

  const handleInitialContextChange = useCallback(
    event => {
      const value = event.currentTarget.value;
      setInitialContextInput(value);
      if (activeNote?.id) {
        updateNoteInitialContext(activeNote.id, value);
      }
    },
    [activeNote?.id, updateNoteInitialContext]
  );

  const submitInitialContextEntry = useCallback(() => {
    if (!activeNote?.id || hasInitialEntry) return;
    const trimmed = initialContextInput.trim();
    const normalized = trimmed;
    setInitialContextInput(normalized);
    updateNoteInitialContext(activeNote.id, normalized);
    const entryText = trimmed.length ? trimmed : "-";
    addInitialEntry(entryText);
  }, [activeNote?.id, hasInitialEntry, initialContextInput, updateNoteInitialContext, addInitialEntry]);

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
    submitInitialContextEntry();
    void startCapture();
  }, [isCapturing, startCapture, stopCapture, submitInitialContextEntry]);

  if (!activeNote) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-2 bg-background/80 px-6 py-8 text-center">
        <p className="text-lg font-semibold text-foreground">No note selected</p>
        <p className="text-sm text-muted-foreground">
          Choose a note from the sidebar or create a new one to begin capturing.
        </p>
      </section>
    );
  }

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
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {createdTimestamp && (
                <p className="flex items-center gap-1">
                  <CalendarDays className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                  <span>Created {createdTimestamp}</span>
                </p>
              )}
              <div>·</div>
              <div className="flex items-center gap-1">
                <Folder className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                <Select
                  value={folderSelectionValue}
                  onValueChange={handleFolderChange}
                  aria-label="Assign folder"
                >
                  <SelectTrigger className="inline-flex h-auto border-0 shadow-none items-center gap-1 px-1 py-0 text-xs font-semibold text-muted-foreground transition hover:text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED_FOLDER_VALUE}>
                      <div className="flex items-center gap-2">
                        <span>Unassigned</span>
                      </div>
                    </SelectItem>
                    {folders.map(folder => (
                      <SelectItem
                        key={folder.id}
                        value={folder.id}
                      >
                        <div className="flex items-center gap-2">
                          <span>{folder.name}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
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
                  {showInitialForm && (
                    <div className="flex flex-col gap-2 text-xs items-end w-full">
                      <div
                        className={cn(
                          "w-full rounded-sm border px-4 py-3 text-sm leading-relaxed text-foreground border-border/40",
                          SOURCE_BUBBLE_CLASSES.initial
                        )}
                      >
                        <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                          <span className="text-xs tracking-wide font-semibold">Initial context</span>
                        </div>
                        <div className="mt-3">
                          <Input
                            placeholder="Type initial context..."
                            className="w-full border-0 bg-transparent shadow-none px-0 py-0 text-sm text-foreground placeholder:text-muted-foreground/50 focus-visible:outline-none focus-visible:ring-0"
                            autoComplete="off"
                            value={initialContextInput}
                            onChange={handleInitialContextChange}
                            aria-label="Initial context"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                  {[
                    ...chatMessages.map(message => {
                      const canEdit = message.hasText && !message.isDraft;
                      const alignRight = message.isManual || message.isInitial;
                      return (
                        <div
                          key={message.id}
                          className={cn(
                            "flex flex-col gap-2 text-xs",
                            alignRight ? "items-end" : "items-start"
                          )}
                        >
                          <div
                            className={cn(
                              "max-w-[92%] px-3 py-2 text-sm leading-relaxed whitespace-pre-line break-words rounded-sm border border-border/50",
                              SOURCE_BUBBLE_CLASSES[message.source] || "bg-muted/20 text-foreground",
                              alignRight && "ml-auto border-border/40"
                            )}
                          >
                            <div className="flex items-center gap-2 text-xs uppercase text-muted-foreground">
                              <span className="text-xs tracking-wide font-semibold">{message.sourceLabel}</span>
                              <span className="text-xs" aria-hidden="true">·</span>
                              <span className="text-xs">{formatTimestamp(message.timestamp)}</span>
                            </div>
                            <div
                              className={cn(
                                "mt-1 text-inherit focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                canEdit ? "cursor-text" : "cursor-default"
                              )}
                              tabIndex={canEdit ? 0 : undefined}
                              contentEditable={canEdit}
                              suppressContentEditableWarning
                              spellCheck={false}
                              aria-label={`Transcript entry from ${message.sourceLabel}${message.isManual ? " (manual context)" : ""}`}
                              onBlur={event => handleTranscriptCommit(message, event)}
                            >
                              {message.text}
                            </div>
                          </div>
                        </div>
                      );
                    }),
                    isCapturing && chatMessages.length > 0 && isLiveVisualizerActive ? (
                      <div key="manual-context-visualizer" className="flex flex-col gap-2 text-xs items-start">
                        <div
                          className={cn(
                            "max-w-fit w-full rounded-sm border border-border/50 px-4 py-3 text-sm leading-relaxed text-foreground",
                            SOURCE_BUBBLE_CLASSES.manual,
                            "border-border/40"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <LiveAudioVisualizer
                              mediaRecorder={mediaRecorder}
                              width={130}
                              height={24}
                              barWidth={3}
                              gap={1.5}
                              backgroundColor="transparent"
                              barColor={visualizerColors.barColor}
                              barPlayedColor={visualizerColors.barPlayedColor}
                            />
                            <span className="sr-only">Still listening</span>
                          </div>
                        </div>
                      </div>
                    ) : null,
                    isCapturing && chatMessages.length > 0 ? (
                      <div key="manual-context-form" className="flex flex-col gap-2 text-xs items-end">
                        <div
                          className={cn(
                            "max-w-[60%] w-full rounded-sm border border-border/50 px-4 py-3 text-sm leading-relaxed text-foreground",
                            SOURCE_BUBBLE_CLASSES.manual,
                            "ml-auto border-border/40"
                          )}
                        >
                          <form
                            className="flex items-center gap-2"
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
                  placeholder={folderSummaryPrompt || "E.g., highlight key decisions, action items, or next steps."}
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
