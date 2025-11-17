"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { Session, WavRecorder } from "./lib/audio";
import {
  NOTES_STORAGE_KEY,
  ACTIVE_NOTE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY
} from "./storage-keys";
import { DEFAULT_PREFERENCES, THEME_MODES, THEME_STORAGE_KEY } from "./settings/constants";

const AppContext = createContext(null);

export function generateId(prefix = "entry") {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function createFreshNote() {
  const now = new Date().toISOString();
  return {
    id: generateId("note"),
    title: `Live note — ${new Date().toLocaleDateString()}`,
    createdAt: now,
    updatedAt: now,
    highlightsHtml: "",
    transcript: [],
    archived: false,
    summaries: []
  };
}

function normalizeStoredNote(note) {
  const now = new Date().toISOString();
  return {
    ...note,
    transcript: note.transcript || [],
    highlightsHtml: note.highlightsHtml || "",
    archived: Boolean(note.archived),
    summaries: note.summaries || [],
    createdAt: note.createdAt || now,
    updatedAt: note.updatedAt || note.createdAt || now
  };
}

function buildTranscriptSnippet(note, drafts) {
  if (!note) return "";
  const entries = [
    ...(note.transcript || []),
    ...Object.values(drafts).filter(Boolean)
  ];
  const textParts = entries
    .map(entry => entry.text?.trim())
    .filter(Boolean)
    .slice(-12);
  return textParts.join("\n");
}

function initNotesState() {
  if (typeof window === "undefined") {
    const note = createFreshNote();
    return { notes: [note], activeId: note.id };
  }

  try {
    const storedRaw = localStorage.getItem(NOTES_STORAGE_KEY);
    const parsed = storedRaw ? JSON.parse(storedRaw) : [];
    const notes = Array.isArray(parsed) && parsed.length ? parsed.map(normalizeStoredNote) : [createFreshNote()];
    const storedActive = localStorage.getItem(ACTIVE_NOTE_STORAGE_KEY);
    const activeId = storedActive && notes.some(note => note.id === storedActive) ? storedActive : notes[0]?.id || null;
    return { notes, activeId };
  } catch (error) {
    console.warn("Unable to hydrate notes:", error);
    const note = createFreshNote();
    return { notes: [note], activeId: note.id };
  }
}

export const DEFAULT_MIC_SELECTION_VALUE = "__default-mic__";

const STREAM_META = {
  microphone: { statusId: "microphone", messageSource: "microphone", errorLabel: "microphone" },
  system_audio: { statusId: "speaker", messageSource: "speaker", errorLabel: "system audio" }
};

function sanitizeSilenceSeconds(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return DEFAULT_PREFERENCES.silenceSeconds;
  }
  return Math.min(30, Math.max(1, Number(numeric.toFixed(2))));
}

function loadPreferencesState() {
  if (typeof window === "undefined") {
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    const storedRaw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (storedRaw) {
      const parsed = JSON.parse(storedRaw);
      return {
        ...DEFAULT_PREFERENCES,
        ...parsed,
        silenceSeconds: sanitizeSilenceSeconds(parsed?.silenceSeconds ?? DEFAULT_PREFERENCES.silenceSeconds)
      };
    }
  } catch (error) {
    console.warn("Failed to load preferences:", error);
  }

  return { ...DEFAULT_PREFERENCES };
}

function loadStoredThemeMode() {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (THEME_MODES.includes(stored)) {
      return stored;
    }
  } catch (error) {
    console.warn("Unable to read theme preference:", error);
  }
  return "system";
}

function getSystemPrefersDark() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function resolveThemeTone(mode, prefersDark) {
  if (mode === "system") {
    return prefersDark ? "dark" : "light";
  }
  return mode;
}

function stripVideoTracks(stream) {
  stream.getVideoTracks().forEach(track => {
    try {
      track.stop();
      stream.removeTrack(track);
    } catch (error) {
      console.warn("Unable to remove video track:", error);
    }
  });
}

export function AppProvider({ children }) {
  const initial = useMemo(() => initNotesState(), []);
  const [notes, setNotes] = useState(initial.notes);
  const [activeNoteId, setActiveNoteId] = useState(initial.activeId);
  const [searchTerm, setSearchTerm] = useState("");
  const [preferences, setPreferences] = useState(() => loadPreferencesState());
  const [model, setModel] = useState("gpt-4o-mini-transcribe");
  const [micDeviceId, setMicDeviceId] = useState("");
  const [micDevices, setMicDevices] = useState([]);
  const [micMuted, setMicMuted] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [drafts, setDrafts] = useState({ microphone: null, speaker: null });
  const [streamStatus, setStreamStatus] = useState({ microphone: false, speaker: false });
  const [isRecording, setIsRecording] = useState(false);
  const [systemAudioEnabled, setSystemAudioEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeMode, setThemeMode] = useState(() => loadStoredThemeMode());
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark());

  const microphoneSessionRef = useRef(null);
  const systemAudioSessionRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const systemAudioStreamRef = useRef(null);
  const wavRecorderRef = useRef(new WavRecorder());
  const prevMicDeviceRef = useRef(micDeviceId);
  const prevSystemAudioRef = useRef(systemAudioEnabled);

  const activeNote = useMemo(
    () => notes.find(note => note.id === activeNoteId) || notes[0] || null,
    [activeNoteId, notes]
  );

  useEffect(() => {
    if (notes.length === 0) {
      const note = createFreshNote();
      setNotes([note]);
      setActiveNoteId(note.id);
      return;
    }
    if (activeNoteId && notes.some(note => note.id === activeNoteId)) {
      return;
    }
    setActiveNoteId(notes[0]?.id || null);
  }, [notes, activeNoteId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeNoteId) {
      localStorage.setItem(ACTIVE_NOTE_STORAGE_KEY, activeNoteId);
    } else {
      localStorage.removeItem(ACTIVE_NOTE_STORAGE_KEY);
    }
  }, [activeNoteId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const tone = resolveThemeTone(themeMode, systemPrefersDark);
    const root = document.documentElement;
    root.dataset.theme = tone;
    root.classList.toggle("dark", tone === "dark");
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch (error) {
      console.warn("Unable to persist theme preference:", error);
    }
  }, [themeMode, systemPrefersDark]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    const handleChange = event => {
      setSystemPrefersDark(event.matches);
    };

    if ("addEventListener" in mediaQuery) {
      mediaQuery.addEventListener("change", handleChange);
    } else if ("addListener" in mediaQuery) {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if ("removeEventListener" in mediaQuery) {
        mediaQuery.removeEventListener("change", handleChange);
      } else if ("removeListener" in mediaQuery) {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  const refreshMicrophones = useCallback(() => {
    if (!navigator?.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then(devices => {
        const audioInputs = devices.filter(device => device.kind === "audioinput");
        setMicDevices(audioInputs);
      })
      .catch(error => console.warn("Unable to enumerate microphones", error));
  }, []);

  useEffect(() => {
    refreshMicrophones();
    if (!navigator?.mediaDevices?.addEventListener) return;
    const handler = () => refreshMicrophones();
    navigator.mediaDevices.addEventListener("devicechange", handler);
    return () => navigator.mediaDevices.removeEventListener("devicechange", handler);
  }, [refreshMicrophones]);

  const appendTranscriptEntry = useCallback(
    ({ source, text }) => {
      if (!activeNoteId) return;
      const timestamp = new Date().toISOString();
      const entry = { id: generateId("entry"), source, text, timestamp };
      setNotes(prev =>
        prev.map(note =>
          note.id === activeNoteId
            ? { ...note, transcript: [...(note.transcript || []), entry], updatedAt: timestamp }
            : note
        )
      );
    },
    [activeNoteId]
  );

  const appendFinalTranscript = useCallback(
    (source, text) => {
      appendTranscriptEntry({ source, text });
    },
    [appendTranscriptEntry]
  );

  const beginDraft = useCallback((source, initialText, statusLabel) => {
    setDrafts(prev => ({
      ...prev,
      [source]: {
        id: generateId("draft"),
        source,
        text: initialText,
        timestamp: new Date().toISOString(),
        statusLabel
      }
    }));
  }, []);

  const updateDraft = useCallback((source, text, statusLabel) => {
    setDrafts(prev => {
      const current = prev[source];
      if (!current) return prev;
      return {
        ...prev,
        [source]: {
          ...current,
          text,
          timestamp: new Date().toISOString(),
          statusLabel
        }
      };
    });
  }, []);

  const finalizeDraft = useCallback(
    (source, text) => {
      setDrafts(prev => ({ ...prev, [source]: null }));
      appendFinalTranscript(source, text);
    },
    [appendFinalTranscript]
  );

  const handleStreamMessage = useCallback(
    (source, message) => {
      switch (message.type) {
        case "transcription_session.created":
          console.log(`${source} session created:`, message.session?.id);
          break;
        case "input_audio_buffer.speech_started":
          beginDraft(source, "Listening…", "Listening…");
          break;
        case "input_audio_buffer.speech_stopped":
          updateDraft(source, "Processing…", "Processing…");
          break;
        case "conversation.item.input_audio_transcription.completed":
          finalizeDraft(source, message.transcript || "");
          break;
        default:
          break;
      }
    },
    [beginDraft, finalizeDraft, updateDraft]
  );

  const updateStatus = useCallback((statusId, connected) => {
    setStreamStatus(prev => ({ ...prev, [statusId]: connected }));
  }, []);

  const stopCapture = useCallback(() => {
    microphoneSessionRef.current?.stop();
    systemAudioSessionRef.current?.stop();
    microphoneSessionRef.current = null;
    systemAudioSessionRef.current = null;

    microphoneStreamRef.current?.getTracks().forEach(track => track.stop());
    systemAudioStreamRef.current?.getTracks().forEach(track => track.stop());
    microphoneStreamRef.current = null;
    systemAudioStreamRef.current = null;

    setStreamStatus({ microphone: false, speaker: false });
    setDrafts({ microphone: null, speaker: null });

    if (wavRecorderRef.current?.isRecording) {
      wavRecorderRef.current.stopRecording();
      setIsRecording(false);
    }

    setIsCapturing(false);
  }, []);

  useEffect(() => {
    const handler = () => {
      if (isCapturing) {
        stopCapture();
      }
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isCapturing, stopCapture]);

  const handleCaptureError = useCallback(
    (error, label) => {
      console.error(`${label} session error:`, error);
      alert(`Error (${label}): ${error.message}`);
      stopCapture();
    },
    [stopCapture]
  );

  const createRealtimeSession = useCallback(
    type => {
      const meta = STREAM_META[type];
      const session = new Session(window.electronAPI?.apiKey, type);
      session.onconnectionstatechange = stateValue => updateStatus(meta.statusId, stateValue === "connected");
      session.onmessage = message => handleStreamMessage(meta.messageSource, message);
      session.onerror = error => handleCaptureError(error, meta.errorLabel);
      return session;
    },
    [handleCaptureError, handleStreamMessage, updateStatus]
  );

  const setupRealtimeSessions = useCallback(
    async (sessionConfig, includeSystemAudio) => {
      microphoneSessionRef.current = createRealtimeSession("microphone");
      const sessionPromises = [
        microphoneSessionRef.current.startTranscription(microphoneStreamRef.current, sessionConfig)
      ];

      if (includeSystemAudio && systemAudioStreamRef.current) {
        systemAudioSessionRef.current = createRealtimeSession("system_audio");
        sessionPromises.push(
          systemAudioSessionRef.current.startTranscription(systemAudioStreamRef.current, sessionConfig)
        );
      } else {
        systemAudioSessionRef.current = null;
      }

      await Promise.all(sessionPromises);
    },
    [createRealtimeSession]
  );

  const captureMediaStreams = useCallback(
    async () => {
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
        video: false
      });

      let displayStream = null;
      let loopbackEnabled = false;

      if (systemAudioEnabled) {
        if (window.electronAPI?.enableLoopbackAudio) {
          await window.electronAPI.enableLoopbackAudio();
          loopbackEnabled = true;
        }

        try {
          displayStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
        } finally {
          if (loopbackEnabled && window.electronAPI?.disableLoopbackAudio) {
            await window.electronAPI.disableLoopbackAudio();
          }
        }

        if (displayStream) {
          stripVideoTracks(displayStream);
        }
      }

      return { microphone, systemAudio: displayStream };
    },
    [micDeviceId, systemAudioEnabled]
  );

  const applyMicMute = useCallback(muted => {
    const stream = microphoneStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach(track => {
      track.enabled = !muted;
    });
  }, []);

  useEffect(() => {
    applyMicMute(micMuted);
  }, [applyMicMute, micMuted]);

  const buildSessionConfig = useCallback(() => {
    const transcription = {
      model,
      prompt: preferences.prompt?.trim(),
      language: preferences.language
    };
    const config = {
      input_audio_transcription: {
        model: transcription.model
      },
      turn_detection: {
        type: "server_vad",
        silence_duration_ms: Math.round(preferences.silenceSeconds * 1000)
      }
    };
    if (transcription.prompt) {
      config.input_audio_transcription.prompt = transcription.prompt;
    }
    if (transcription.language) {
      config.input_audio_transcription.language = transcription.language;
    }
    return config;
  }, [model, preferences]);

  const ensureCapturePreconditions = useCallback(() => {
    if (!activeNote) {
      alert("Create or select a note before starting capture.");
      return false;
    }
    if (activeNote.archived) {
      alert("Unarchive the note before resuming capture.");
      return false;
    }
    if (!window.electronAPI?.apiKey) {
      alert("Missing OpenAI API key. Add it to your .env file as OPENAI_KEY.");
      return false;
    }
    return true;
  }, [activeNote]);

  const startCapture = useCallback(
    async () => {
      if (!ensureCapturePreconditions()) return;
      setIsCapturing(true);
      try {
        const streams = await captureMediaStreams();
        microphoneStreamRef.current = streams.microphone;
        applyMicMute(micMuted);
        const includeSystemAudio = systemAudioEnabled && Boolean(streams.systemAudio);
        systemAudioStreamRef.current = includeSystemAudio ? streams.systemAudio : null;
        const sessionConfig = buildSessionConfig();
        await setupRealtimeSessions(sessionConfig, includeSystemAudio);
        updateStatus("microphone", true);
        updateStatus("speaker", includeSystemAudio);
      } catch (error) {
        console.error("Error starting capture:", error);
        alert(`Error starting capture: ${error.message}`);
        stopCapture();
      }
    },
    [applyMicMute, buildSessionConfig, captureMediaStreams, ensureCapturePreconditions, micMuted, setupRealtimeSessions, stopCapture, systemAudioEnabled, updateStatus]
  );

  useEffect(() => {
    if (!isCapturing) {
      prevMicDeviceRef.current = micDeviceId;
      return;
    }
    if (prevMicDeviceRef.current === micDeviceId) return;
    prevMicDeviceRef.current = micDeviceId;
    stopCapture();
    void startCapture();
  }, [isCapturing, micDeviceId, startCapture, stopCapture]);

  useEffect(() => {
    if (!isCapturing) {
      prevSystemAudioRef.current = systemAudioEnabled;
      return;
    }
    if (prevSystemAudioRef.current === systemAudioEnabled) return;
    prevSystemAudioRef.current = systemAudioEnabled;
    stopCapture();
    void startCapture();
  }, [isCapturing, systemAudioEnabled, startCapture, stopCapture]);

  const toggleRecording = useCallback(async () => {
    try {
      if (!wavRecorderRef.current.isRecording) {
        await wavRecorderRef.current.startRecording(microphoneStreamRef.current, systemAudioStreamRef.current);
        setIsRecording(true);
      } else {
        wavRecorderRef.current.stopRecording();
        setIsRecording(false);
      }
    } catch (error) {
      console.error("Error controlling recording:", error);
      alert(error.message);
    }
  }, []);

  const handleLanguageChange = useCallback(event => {
    const next = event.target.value || DEFAULT_PREFERENCES.language;
    setPreferences(prev => ({ ...prev, language: next }));
  }, []);

  const handlePromptChange = useCallback(event => {
    setPreferences(prev => ({ ...prev, prompt: event.target.value }));
  }, []);

  const handleSilenceChange = useCallback(event => {
    const sanitized = sanitizeSilenceSeconds(event.target.value);
    setPreferences(prev => ({ ...prev, silenceSeconds: sanitized }));
  }, []);

  const handleModelChange = useCallback(event => {
    setModel(event.target.value);
  }, []);

  const handleMicChange = useCallback(valueOrEvent => {
    const rawValue = typeof valueOrEvent === "string" ? valueOrEvent : valueOrEvent?.target?.value;
    if (rawValue === DEFAULT_MIC_SELECTION_VALUE) {
      setMicDeviceId("");
      return;
    }
    setMicDeviceId(rawValue || "");
  }, []);

  const toggleMicMute = useCallback(() => {
    setMicMuted(prev => !prev);
  }, []);

  const toggleSystemAudio = useCallback(() => {
    setSystemAudioEnabled(prev => !prev);
  }, []);

  const handleThemeModeChange = useCallback(mode => {
    if (!THEME_MODES.includes(mode)) return;
    setThemeMode(mode);
  }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const filteredNotes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const sorted = [...notes].sort(
      (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
    );
    if (!term) return sorted;
    return sorted.filter(note => {
      const haystack = [
        note.title || "",
        note.highlightsHtml || "",
        ...(note.transcript || []).map(entry => entry.text || "")
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [notes, searchTerm]);

  const createNote = useCallback(() => {
    if (isCapturing) {
      alert("Stop capture before creating a new note.");
      return;
    }
    const note = createFreshNote();
    setNotes(prev => [note, ...prev]);
    setActiveNoteId(note.id);
    setMicMuted(false);
    setSystemAudioEnabled(true);
  }, [isCapturing]);

  const selectNote = useCallback(
    noteId => {
      if (isCapturing) {
        alert("Stop capture before switching notes.");
        return;
      }
      setActiveNoteId(noteId);
    },
    [isCapturing]
  );

  const updateNote = useCallback((noteId, updates) => {
    if (!noteId) return;
    setNotes(prev =>
      prev.map(note => (note.id === noteId ? { ...note, ...updates, updatedAt: updates.updatedAt || new Date().toISOString() } : note))
    );
  }, []);

  const updateNoteTitle = useCallback(
    (noteId, title) => {
      updateNote(noteId, { title: title || "Untitled note" });
    },
    [updateNote]
  );

  const updateNoteHighlights = useCallback(
    (noteId, highlightsHtml) => {
      updateNote(noteId, { highlightsHtml });
    },
    [updateNote]
  );

  const archiveNote = useCallback(noteId => {
    if (!noteId) return;
    const timestamp = new Date().toISOString();
    setNotes(prev =>
      prev.map(note =>
        note.id === noteId ? { ...note, archived: !note.archived, updatedAt: timestamp } : note
      )
    );
  }, []);

  const deleteArchivedNotes = useCallback(() => {
    setNotes(prev => prev.filter(note => !note.archived));
  }, []);

  const deleteNote = useCallback(noteId => {
    if (!noteId) return;
    setNotes(prev => prev.filter(note => note.id !== noteId));
    setActiveNoteId(active => (active === noteId ? null : active));
  }, []);


  const generateSummary = useCallback(
    async (noteId, promptText) => {
      if (!noteId) {
        throw new Error("Select or create a note before generating a summary.");
      }
      const note = notes.find(n => n.id === noteId);
      if (!note) {
        throw new Error("Unable to locate the selected note.");
      }
      const snippet = buildTranscriptSnippet(note, drafts);
      if (!snippet) {
        throw new Error("No transcript content is available yet. Capture audio first.");
      }
      const normalizedPrompt = promptText?.trim() || "Meeting summary";
      const apiKey = window.electronAPI?.apiKey;
      if (!apiKey) {
        throw new Error("Missing OpenAI API key. Add OPENAI_KEY to your .env file.");
      }

      const payload = {
        model: "gpt-4o-mini",
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a concise meeting summarizer. Turn the transcript into a well-organized summary that highlights decisions, action items, and follow-ups. Be factual and keep the tone professional."
          },
          {
            role: "user",
            content: `Prompt: ${normalizedPrompt}\n\nTranscript:\n${snippet}`
          }
        ]
      };

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Failed to generate summary (${response.status}): ${text || response.statusText}`);
      }

      const data = await response.json();
      const choice = data?.choices?.[0];
      const messageContent = choice?.message?.content;
      const summaryText =
        typeof messageContent === "string"
          ? messageContent
          : Array.isArray(messageContent)
          ? messageContent.map(part => part?.text || "").join(" ")
          : "";

      if (!summaryText.trim()) {
        throw new Error("The summary response was empty.");
      }

      const summary = {
        id: generateId("summary"),
        prompt: normalizedPrompt,
        body: summaryText.trim(),
        createdAt: new Date().toISOString()
      };

      updateNote(noteId, {
        summaries: [summary, ...(note.summaries || [])]
      });

      return summary;
    },
    [drafts, notes, updateNote]
  );

  const value = useMemo(
    () => ({
      notes,
      filteredNotes,
      searchTerm,
      setSearchTerm,
      activeNote,
      activeNoteId,
      selectNote,
      createNote,
      updateNoteTitle,
      updateNoteHighlights,
      appendTranscriptEntry,
      archiveNote,
      deleteArchivedNotes,
      deleteNote,
      preferences,
      handleLanguageChange,
      handlePromptChange,
      handleSilenceChange,
      model,
      handleModelChange,
      micDeviceId,
      handleMicChange,
      micDevices,
      micMuted,
      toggleMicMute,
      systemAudioEnabled,
      toggleSystemAudio,
      isCapturing,
      startCapture,
      stopCapture,
      toggleRecording,
      generateSummary,
      drafts,
      streamStatus,
      isRecording,
      settingsOpen,
      openSettings,
      closeSettings,
      setSettingsOpen,
      themeMode,
      handleThemeModeChange,
      systemPrefersDark
    }),
    [
      notes,
      filteredNotes,
      searchTerm,
      activeNote,
      activeNoteId,
      selectNote,
      createNote,
      updateNoteTitle,
      updateNoteHighlights,
      appendTranscriptEntry,
      archiveNote,
      deleteArchivedNotes,
      deleteNote,
      preferences,
      handleLanguageChange,
      handlePromptChange,
      handleSilenceChange,
      model,
      handleModelChange,
      micDeviceId,
      handleMicChange,
      micDevices,
      micMuted,
      toggleMicMute,
      systemAudioEnabled,
      toggleSystemAudio,
      isCapturing,
      startCapture,
      stopCapture,
      toggleRecording,
      generateSummary,
      drafts,
      streamStatus,
      isRecording,
      settingsOpen,
      openSettings,
      closeSettings,
      setSettingsOpen,
      themeMode,
      handleThemeModeChange,
      systemPrefersDark
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("useApp must be used within AppProvider");
  }
  return value;
}
