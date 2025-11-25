"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {ArrowUp, CalendarDays, CircleDot, Folder, Mic, MicOff, StopCircle, Trash, Upload} from "lucide-react";
import { LiveAudioVisualizer } from "react-audio-visualize";

import { useApp } from "@/renderer/app-provider";
import { useAudio } from "@/renderer/audio-provider";
import { Badge } from "@/renderer/components/ui/badge";
import { Button } from "@/renderer/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/renderer/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@/renderer/components/ui/dialog";
import { Progress } from "@/renderer/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/renderer/components/ui/tabs";
import { Input } from "@/renderer/components/ui/input";
import { Textarea } from "@/renderer/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/renderer/components/ui/select";
import { cn } from "@/renderer/lib/utils";
import {
  buildTranscriptSnippet,
  transcribeSingleRequest,
  transcribeWithSlidingWindow,
  AUDIO_UPLOAD_CHUNK_THRESHOLD_BYTES
} from "@/renderer/lib/transcript";

const SOURCE_LABELS = {
  microphone: "Microphone",
  speaker: "System audio",
  upload: "Uploaded audio",
  manual: "Manual context",
  initial: "Initial context"
};

const SUPPORTED_UPLOAD_EXTENSIONS = [".wav", ".mp3"];
const SUPPORTED_UPLOAD_MIME_TYPES = new Set([
  "audio/wav",
  "audio/x-wav",
  "audio/vnd.wave",
  "audio/mpeg",
  "audio/mp3"
]);
const SUPPORTED_AUDIO_UPLOAD_MESSAGE = "Only WAV or MP3 audio files are supported for upload.";

function getFileExtension(fileName = "") {
  if (!fileName) return "";
  const normalized = fileName.trim();
  const dotIndex = normalized.lastIndexOf(".");
  if (dotIndex === -1 || dotIndex === normalized.length - 1) {
    return "";
  }
  return normalized.slice(dotIndex).toLowerCase();
}

function isSupportedAudioFile(file) {
  if (!file) return false;
  const mime = (file.type || "").toLowerCase();
  if (SUPPORTED_UPLOAD_MIME_TYPES.has(mime)) {
    return true;
  }
  const extension = getFileExtension(file.name);
  return SUPPORTED_UPLOAD_EXTENSIONS.includes(extension);
}

const UNASSIGNED_FOLDER_VALUE = "__unassigned";

function formatTimestamp(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return "";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) {
    return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  }
  return `${seconds}s`;
}

function buildFileUrl(filePath) {
  if (!filePath) return "";
  const normalized = filePath.replace(/\\/g, "/");
  return encodeURI(`file://${normalized}`);
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
    appendTranscriptEntry,
    preferences,
    folders,
    recordings,
    activeFolderId,
    activeFolder,
    updateRecording,
    deleteRecording,
    themeMode,
    systemPrefersDark
  } = useApp();
  const { drafts, isCapturing, startCapture, stopCapture, micMuted, toggleMicMute, isRecording, mediaRecorder } = useAudio();

  const titleRef = useRef(null);
  const previousNoteIdRef = useRef(null);
  const transcriptsRef = useRef(null);
  const uploadInputRef = useRef(null);
  const uploadTotalSecondsRef = useRef(0);
  const isEditingRef = useRef(false);
  const [summaryPrompt, setSummaryPrompt] = useState("");
  const [isUploadInProgress, setIsUploadInProgress] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(null);
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

  const showUploadButton = noteEntries.length === 0 && !isCapturing;

  const transcriptEntries = useMemo(
    () => [...draftEntries, ...noteEntries],
    [draftEntries, noteEntries]
  );

  const filteredRecordings = useMemo(() => {
    if (!recordings?.length) return [];
    if (activeNote?.id) {
      return recordings.filter(recording => recording.noteId === activeNote.id);
    }
    if (activeFolderId) {
      return recordings.filter(recording => recording.folderId === activeFolderId);
    }
    return recordings;
  }, [recordings, activeNote?.id, activeFolderId]);

  const sortedRecordings = useMemo(() => {
    return [...filteredRecordings].sort((a, b) => {
      const aTime = new Date(a.createdAt).getTime() || 0;
      const bTime = new Date(b.createdAt).getTime() || 0;
      return bTime - aTime;
    });
  }, [filteredRecordings]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const checker = window?.electronAPI?.checkRecordingFile;
    if (typeof checker !== "function") return;
    const pending = sortedRecordings.filter(
      recording =>
        recording.filePath &&
        !recording.processing &&
        !recording.fileVerifiedAt
    );
    if (pending.length === 0) return;
    let cancelled = false;
    pending.forEach(recording => {
      checker(recording.filePath).then(exists => {
        if (cancelled) return;
        updateRecording(recording.id, {
          fileMissing: !exists,
          fileVerifiedAt: new Date().toISOString()
        });
      });
    });
    return () => {
      cancelled = true;
    };
  }, [sortedRecordings, updateRecording]);

  const recordingsScopeLabel = useMemo(() => {
    if (activeNote) {
      return `Recordings for ${activeNote.title || "this note"}`;
    }
    if (activeFolder) {
      return `Recordings for folder ${activeFolder.name}`;
    }
    return "All recordings";
  }, [activeNote, activeFolder]);

  const createdTimestamp = useMemo(() => formatTimestamp(activeNote?.createdAt), [activeNote?.createdAt]);
  const folderSelectionValue = activeNote?.folderId ?? UNASSIGNED_FOLDER_VALUE;

  const storedSummaries = activeNote?.summaries || [];

  const canGenerateSummary = transcriptEntries.some(entry => Boolean(entry.text));
  const effectiveSummaryPrompt = summaryPrompt || folderSummaryPrompt;
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

  useEffect(() => {
    setUploadError("");
    setUploadProgress(null);
  }, [activeNote?.id]);

  useEffect(() => {
    if (noteEntries.length > 0 && uploadError) {
      setUploadError("");
    }
  }, [noteEntries.length, uploadError]);

  const handleFolderChange = useCallback(
    value => {
      if (!activeNote?.id) return;
      assignNoteFolder(activeNote.id, value === UNASSIGNED_FOLDER_VALUE ? null : value);
    },
    [activeNote?.id, assignNoteFolder]
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

  const handleUploadClick = useCallback(() => {
    uploadInputRef.current?.click();
  }, []);

  const handleUploadFileChange = useCallback(
    async event => {
      const fileInput = uploadInputRef.current;
      const file = event.currentTarget.files?.[0];
      if (fileInput) {
        fileInput.value = "";
      }
      if (!file) return;

      if (!isSupportedAudioFile(file)) {
        setUploadError(SUPPORTED_AUDIO_UPLOAD_MESSAGE);
        setUploadProgress(null);
        setIsUploadInProgress(false);
        return;
      }

      submitInitialContextEntry();

      setUploadError("");
      uploadTotalSecondsRef.current = 0;
      setUploadProgress({
        percent: 0,
        label: "Preparing audio…",
        rangeLabel: "",
        totalChunks: 0,
        processedChunks: 0
      });
      setIsUploadInProgress(true);

      let appendedChunkCount = 0;

      try {
        const shouldChunkUpload = file.size >= AUDIO_UPLOAD_CHUNK_THRESHOLD_BYTES;
        const transcribeFn = shouldChunkUpload ? transcribeWithSlidingWindow : transcribeSingleRequest;
        const result = await transcribeFn(file, {
          language: preferences?.language,
          onProgress: progress => {
            if (
              progress?.chunkIndex === -1 &&
              typeof progress?.durationSeconds === "number" &&
              progress.durationSeconds > 0
            ) {
              uploadTotalSecondsRef.current = progress.durationSeconds;
            }

            const percent = Math.min(100, Math.max(0, progress?.percent ?? 0));
            const label =
              progress.chunkIndex >= 0
                ? `Transcribing chunk ${progress.chunkIndex + 1} / ${progress.totalChunks}`
                : "Preparing audio…";
            const rangeLabel =
              typeof progress.startSeconds === "number" && typeof progress.endSeconds === "number"
                ? `${progress.startSeconds.toFixed(1)}s — ${progress.endSeconds.toFixed(1)}s`
                : "";
            const totalSeconds = uploadTotalSecondsRef.current;
            const endSeconds =
              typeof progress?.endSeconds === "number" ? progress.endSeconds : undefined;
            const streamingPercent =
              totalSeconds > 0 && typeof endSeconds === "number"
                ? Math.round((endSeconds / totalSeconds) * 100)
                : percent;
            setUploadProgress({
              ...progress,
              percent: Math.min(100, Math.max(0, streamingPercent)),
              label,
              rangeLabel
            });
          },
          onChunk: chunk => {
            const trimmed = (chunk.trimmedText || "").trim();
            if (!trimmed) return;
            appendTranscriptEntry({ source: "upload", text: trimmed });
            appendedChunkCount += 1;
          }
        });
        if (appendedChunkCount === 0) {
          const [firstChunk] = Array.isArray(result?.chunks) ? result.chunks : [];
          const fallbackText = (firstChunk?.trimmedText || firstChunk?.text || "").trim();
          if (!fallbackText) {
            setUploadError("Uploaded audio did not return any transcript text.");
            return;
          }
          appendTranscriptEntry({ source: "upload", text: fallbackText });
          appendedChunkCount = 1;
        }
      } catch (error) {
        console.error("Upload transcription failed:", error);
        setUploadError(error?.message || "Unable to transcribe the uploaded file.");
      } finally {
        setIsUploadInProgress(false);
        setUploadProgress(null);
        uploadTotalSecondsRef.current = 0;
      }
    },
    [appendTranscriptEntry, preferences?.language, submitInitialContextEntry]
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
    const scrollElement = transcriptsRef.current;
    if (!scrollElement) return;
    if (isEditingRef.current) return;

    scrollElement.scrollTop = scrollElement.scrollHeight;
  }, [chatMessages.length, chatMessages, isCapturing, isLiveVisualizerActive]);

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

  const handleGenerateSummary = async () => {
    if (!canGenerateSummary || isGenerating || !activeNote?.id) return;
    setSummaryError("");
    setIsGenerating(true);
    setSummaryFeedback("");

    try {
      const snippet = buildTranscriptSnippet(activeNote, drafts);
      await generateSummary(activeNote.id, effectiveSummaryPrompt, snippet);
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

  const revealRecordingDirectory = useCallback(directory => {
    if (!directory) return;
    window?.electronAPI?.revealRecordingDirectory?.(directory);
  }, []);

  const handleDeleteRecording = useCallback(
    recording => {
      if (!recording?.id) return;
      if (typeof window === "undefined") return;
      const titleLabel = recording.title || "recording";
      const timestampLabel = formatTimestamp(recording.createdAt) || "this file";
      const confirmed = window.confirm(
        `Delete "${titleLabel}" (${timestampLabel})? This will remove the MP3 export permanently.`
      );
      if (!confirmed) return;
      deleteRecording(recording);
    },
    [deleteRecording]
  );

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
            <TabsTrigger value="files" className="gap-1">
              Files{" "}
              <Badge
                variant="secondary"
                className="flex h-5 w-5 items-center justify-center rounded-full bg-muted-foreground/30 text-[0.6rem]"
              >
                {filteredRecordings.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="h-px w-full bg-border/70 mt-4" aria-hidden="true" />

          <TabsContent value="transcription" className="flex flex-1 flex-col gap-4 mt-0 overflow-hidden">
            <div ref={transcriptsRef} className="flex flex-1 flex-col gap-4 overflow-y-auto py-4 pb-20">
              {showInitialForm && (
                <Card>
                  <CardHeader className="p-3 pb-1">
                    <CardTitle className="text-sm">Initial Context</CardTitle>
                    <CardDescription className="text-xs">
                      Add context before starting your recording
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-3 pt-2">
                    <Textarea
                      placeholder="Type initial context..."
                      className="min-h-[80px]"
                      autoComplete="off"
                      value={initialContextInput}
                      onChange={handleInitialContextChange}
                      aria-label="Initial context"
                    />
                  </CardContent>
                </Card>
              )}

              {chatMessages.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-foreground">Transcript</h4>
                    <Badge variant="secondary">{chatMessages.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {chatMessages.map(message => {
                      const canEdit = message.hasText && !message.isDraft;
                      const isUserEntry = message.isManual || message.isInitial;
                      return (
                        <div
                          key={message.id}
                          className={cn(
                            "flex",
                            isUserEntry ? "justify-end" : "justify-start"
                          )}
                        >
                          <Card className={cn(
                            "max-w-[85%]",
                            isUserEntry && "border-primary/20"
                          )}>
                            <CardHeader className="p-3 pb-1">
                              <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2">
                                  <CardTitle className="text-xs font-medium">{message.sourceLabel}</CardTitle>
                                  {message.isDraft && (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Live</Badge>
                                  )}
                                </div>
                                <CardDescription className="text-[11px]">{formatTimestamp(message.timestamp)}</CardDescription>
                              </div>
                            </CardHeader>
                            <CardContent className="p-3 pt-0">
                              <p
                                className={cn(
                                  "text-sm text-muted-foreground whitespace-pre-line",
                                  canEdit && "cursor-text focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm"
                                )}
                                tabIndex={canEdit ? 0 : undefined}
                                contentEditable={canEdit}
                                suppressContentEditableWarning
                                spellCheck={false}
                                aria-label={`Transcript entry from ${message.sourceLabel}${message.isManual ? " (manual context)" : ""}`}
                                onFocus={() => { isEditingRef.current = true; }}
                                onBlur={event => {
                                  isEditingRef.current = false;
                                  handleTranscriptCommit(message, event);
                                }}
                              >
                                {message.text}
                              </p>
                            </CardContent>
                          </Card>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {isCapturing && isLiveVisualizerActive && (
                <div className="flex justify-start">
                  <Card className="max-w-[85%]">
                    <CardContent className="p-3">
                      <div className="flex items-center gap-3">
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
                        <span className="text-sm text-muted-foreground">Listening...</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {isCapturing && (
                <div className="flex justify-end">
                  <Card className="w-full max-w-[92%] border-primary/20">
                    <CardHeader className="p-3 pb-1">
                      <CardTitle className="text-xs font-medium">Add Manual Context</CardTitle>
                      <CardDescription className="text-[11px]">
                        Type additional notes while recording
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-3 pt-2">
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
                          autoComplete="off"
                          value={manualInput}
                          onChange={event => setManualInput(event.target.value)}
                          className="flex-1"
                        />
                        <Button
                          type="submit"
                          size="icon"
                          variant="outline"
                          disabled={manualInputLength === 0}
                        >
                          <ArrowUp className="h-4 w-4" />
                          <span className="sr-only">Send manual context</span>
                        </Button>
                      </form>
                    </CardContent>
                  </Card>
                </div>
              )}

              {chatMessages.length === 0 && !showInitialForm && !isCapturing && (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Start recording or upload audio to see transcripts here
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="absolute bottom-4 left-0 right-0 flex flex-col items-center gap-2 px-4">
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant={isCapturing ? "destructive" : "default"}
                  onClick={handleRecordToggle}
                  aria-label={isCapturing ? "Stop recording session" : "Start recording session"}
                >
                  {isCapturing ? (
                    <StopCircle className="h-4 w-4" />
                  ) : (
                    <CircleDot className="h-4 w-4" />
                  )}
                  <span>{isCapturing ? "Stop" : "Record"}</span>
                </Button>

                <Button
                  size="icon"
                  variant={micMuted ? "outline" : "secondary"}
                  onClick={toggleMicMute}
                  aria-label={micMuted ? "Unmute microphone" : "Mute microphone"}
                >
                  {micMuted ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>

                {showUploadButton && (
                  <>
                    <Button
                      variant="secondary"
                      onClick={handleUploadClick}
                      disabled={isUploadInProgress}
                      aria-label="Upload audio file"
                    >
                      <Upload className="h-4 w-4" />
                      <span>{isUploadInProgress ? "Uploading…" : "Upload"}</span>
                    </Button>
                    <input
                      ref={uploadInputRef}
                      type="file"
                      accept=".wav,.mp3,audio/wav,audio/x-wav,audio/vnd.wave,audio/mpeg,audio/mp3"
                      className="hidden"
                      onChange={handleUploadFileChange}
                    />
                  </>
                )}
              </div>
              {showUploadButton && uploadError && (
                <p className="text-xs text-destructive">{uploadError}</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="summary" className="flex flex-1 flex-col gap-4 mt-0 overflow-hidden">
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
              <Card>
                <CardHeader className="p-3 pb-1">
                  <CardTitle className="text-sm">Generate Summary</CardTitle>
                  <CardDescription className="text-xs">
                    Create AI-powered summaries from your transcript
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-3 pt-2 space-y-2">
                  <textarea
                    value={effectiveSummaryPrompt}
                    onChange={event => setSummaryPrompt(event.target.value)}
                    placeholder="E.g., highlight key decisions, action items, or next steps."
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    rows={3}
                  />
                  {summaryError && (
                    <p className="text-xs text-destructive">{summaryError}</p>
                  )}
                  {summaryFeedback && (
                    <p className="text-xs text-muted-foreground">{summaryFeedback}</p>
                  )}
                </CardContent>
                <CardFooter className="p-3 pt-0">
                  <Button size="sm" onClick={handleGenerateSummary} disabled={!canGenerateSummary || isGenerating}>
                    {isGenerating ? "Generating…" : "Generate"}
                  </Button>
                </CardFooter>
              </Card>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium text-foreground">Documents</h4>
                  <Badge variant="secondary">{storedSummaries.length}</Badge>
                </div>
                {storedSummaries.length === 0 ? (
                  <Card>
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground text-center">
                        Generated summaries will appear here
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  storedSummaries.map((entry, index) => (
                    <Card key={entry.id}>
                      <CardHeader className="p-3 pb-1">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">{entry.prompt}</CardTitle>
                          <Badge variant="outline" className="text-xs">
                            #{storedSummaries.length - index}
                          </Badge>
                        </div>
                        <CardDescription className="text-xs">{formatTimestamp(entry.createdAt)}</CardDescription>
                      </CardHeader>
                      <CardContent className="p-3 pt-2">
                        <p className="text-sm text-muted-foreground whitespace-pre-line">{entry.body}</p>
                      </CardContent>
                      <CardFooter className="p-3 pt-0 gap-2">
                        <Button size="sm" variant="outline" onClick={() => handleCopySummary(entry)}>
                          Copy
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDownloadSummary(entry)}>
                          Download
                        </Button>
                      </CardFooter>
                    </Card>
                  ))
                )}
              </div>
            </div>
          </TabsContent>
          <TabsContent value="files" className="flex flex-1 flex-col gap-4 mt-0 overflow-hidden">
            <div className="flex flex-col gap-4 overflow-y-auto py-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-foreground">{recordingsScopeLabel}</h4>
                <Badge variant="secondary">{sortedRecordings.length}</Badge>
              </div>
              {sortedRecordings.length === 0 ? (
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground text-center">
                      Record a session to see MP3 exports here
                    </p>
                  </CardContent>
                </Card>
              ) : (
                <div className="flex flex-col gap-3">
                  {sortedRecordings.map(recording => {
                    const folder = folders.find(folderItem => folderItem.id === recording.folderId);
                    const audioSrc = buildFileUrl(recording.filePath);
                    return (
                      <Card key={recording.id}>
                        <CardHeader className="p-3 pb-1">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <CardTitle className="text-sm truncate">{recording.title}</CardTitle>
                              <CardDescription className="text-xs">
                                {formatTimestamp(recording.createdAt)}
                                {recording.durationMs ? ` · ${formatDuration(recording.durationMs)}` : ""}
                              </CardDescription>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {folder && (
                                <Badge variant="outline" className="text-xs">
                                  {folder.name}
                                </Badge>
                              )}
                              {recording.processing && (
                                <Badge variant="secondary" className="text-xs">
                                  Processing
                                </Badge>
                              )}
                              {recording.fileMissing && !recording.processing && (
                                <Badge variant="destructive" className="text-xs">
                                  Missing
                                </Badge>
                              )}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-3 pt-2 space-y-2">
                          {audioSrc && !recording.fileMissing ? (
                            <audio
                              controls
                              preload="metadata"
                              className="w-full h-10"
                              src={audioSrc}
                            />
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {recording.fileMissing
                                ? "The MP3 file is missing on disk."
                                : "Processing MP3 export…"}
                            </p>
                          )}
                          {recording.error && (
                            <p className="text-xs text-destructive">{recording.error}</p>
                          )}
                        </CardContent>
                        <CardFooter className="p-3 pt-0 gap-2">
                          {audioSrc && !recording.processing && !recording.fileMissing ? (
                            <Button size="sm" variant="outline" asChild>
                              <a href={audioSrc} download={`recording-${recording.id}.mp3`}>
                                Download
                              </a>
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" disabled>
                              Download
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => revealRecordingDirectory(recording.directoryPath)}
                            disabled={
                              !recording.directoryPath || recording.processing || recording.fileMissing
                            }
                          >
                            Reveal
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive ml-auto"
                            onClick={() => handleDeleteRecording(recording)}
                          >
                            <Trash className="h-3 w-3" aria-hidden="true" />
                          </Button>
                        </CardFooter>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={isUploadInProgress} onOpenChange={() => {}}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Transcribing upload</DialogTitle>
          </DialogHeader>
          <Progress value={uploadProgress?.percent ?? 0} className="mt-4" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
