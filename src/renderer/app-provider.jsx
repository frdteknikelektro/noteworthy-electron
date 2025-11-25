"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AudioProvider } from "./audio-provider";
import {
  NOTES_STORAGE_KEY,
  ACTIVE_NOTE_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  MODEL_STORAGE_KEY,
  FOLDERS_STORAGE_KEY,
  ACTIVE_FOLDER_STORAGE_KEY,
  MIC_DEVICE_STORAGE_KEY,
  RECORDINGS_STORAGE_KEY
} from "./storage-keys";
import {
  API_TEMPERATURE,
  DEFAULT_PREFERENCES,
  DEFAULT_MODEL,
  MODEL_OPTIONS,
  THEME_MODES,
  THEME_STORAGE_KEY
} from "./settings/constants";
import { buildTranscriptSnippet } from "./lib/transcript";
import { generateId } from "./lib/id";

const AppContext = createContext(null);

function createFreshNote({ folderId = null, initialContext = "", title } = {}) {
  const now = new Date().toISOString();
  const defaultTitle = `Live note — ${new Date().toLocaleDateString()}`;
  return {
    id: generateId("note"),
    title: typeof title === "string" && title.trim().length ? title.trim() : defaultTitle,
    createdAt: now,
    updatedAt: now,
    highlightsHtml: "",
    transcript: [],
    initialContext: typeof initialContext === "string" ? initialContext : "",
    archived: false,
    summaries: [],
    folderId: typeof folderId === "string" ? folderId : null
  };
}

function normalizeStoredNote(note) {
  const now = new Date().toISOString();
  return {
    ...note,
    transcript: note.transcript || [],
    initialContext: note.initialContext || "",
    highlightsHtml: note.highlightsHtml || "",
    archived: Boolean(note.archived),
    summaries: note.summaries || [],
    createdAt: note.createdAt || now,
    updatedAt: note.updatedAt || note.createdAt || now,
    folderId: typeof note.folderId === "string" ? note.folderId : null
  };
}

function normalizeTags(value) {
  if (Array.isArray(value)) {
    return value.map(tag => (typeof tag === "string" ? tag.trim() : "")).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map(tag => tag.trim())
      .filter(Boolean);
  }
  return [];
}

function createFreshFolder({
  name = "New Folder",
  description = "",
  defaultInitialContext = "",
  defaultSummaryPrompt = "",
  defaultSummaryType = "highlights",
  tags = [],
  color = "#8b4513",
  icon = "folder"
} = {}) {
  const now = new Date().toISOString();
  const normalizedTags = normalizeTags(tags);
  return {
    id: generateId("folder"),
    name: typeof name === "string" && name.trim().length ? name.trim() : "New Folder",
    description: typeof description === "string" ? description.trim() : "",
    defaultInitialContext: typeof defaultInitialContext === "string" ? defaultInitialContext.trim() : "",
    defaultSummaryPrompt: typeof defaultSummaryPrompt === "string" ? defaultSummaryPrompt.trim() : "",
    defaultSummaryType: typeof defaultSummaryType === "string" && defaultSummaryType.trim() ? defaultSummaryType.trim() : "highlights",
    tags: normalizedTags,
    color,
    icon,
    createdAt: now
  };
}

function normalizeStoredFolder(folder) {
  const now = new Date().toISOString();
  return {
    id: folder.id || generateId("folder"),
    name: typeof folder.name === "string" && folder.name.trim().length ? folder.name.trim() : "New Folder",
    description: typeof folder.description === "string" ? folder.description.trim() : "",
    defaultInitialContext: folder.defaultInitialContext || "",
    defaultSummaryPrompt: folder.defaultSummaryPrompt || "",
    defaultSummaryType: typeof folder.defaultSummaryType === "string" && folder.defaultSummaryType.trim()
      ? folder.defaultSummaryType.trim()
      : "highlights",
    tags: normalizeTags(folder.tags),
    color: typeof folder.color === "string" && folder.color.trim() ? folder.color : "#8b4513",
    icon: typeof folder.icon === "string" && folder.icon.trim() ? folder.icon : "folder",
    createdAt: folder.createdAt || now
  };
}

function normalizeStoredRecording(recording) {
  const now = new Date().toISOString();
  const source = recording || {};
  return {
    id: source.id || generateId("recording"),
    noteId: typeof source.noteId === "string" ? source.noteId : null,
    title: typeof source.title === "string" && source.title.trim().length ? source.title.trim() : "Untitled recording",
    folderId: typeof source.folderId === "string" ? source.folderId : null,
    createdAt: source.createdAt || now,
    durationMs: typeof source.durationMs === "number" ? source.durationMs : 0,
    transcriptSnippet: typeof source.transcriptSnippet === "string" ? source.transcriptSnippet : "",
    filePath: typeof source.filePath === "string" ? source.filePath : "",
    directoryPath: typeof source.directoryPath === "string" ? source.directoryPath : "",
    processing: Boolean(source.processing),
    fileMissing: Boolean(source.fileMissing),
    fileVerifiedAt: typeof source.fileVerifiedAt === "string" ? source.fileVerifiedAt : "",
    error: typeof source.error === "string" ? source.error : ""
  };
}

function initRecordingsState() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const storedRaw = localStorage.getItem(RECORDINGS_STORAGE_KEY);
    const parsed = storedRaw ? JSON.parse(storedRaw) : [];
    return Array.isArray(parsed) ? parsed.map(normalizeStoredRecording) : [];
  } catch (error) {
    console.warn("Unable to hydrate recordings:", error);
    return [];
  }
}

function initNotesState() {
  if (typeof window === "undefined") {
    const note = createFreshNote();
    return { notes: [note], activeId: note.id };
  }

  try {
    const storedRaw = localStorage.getItem(NOTES_STORAGE_KEY);
    const parsed = storedRaw ? JSON.parse(storedRaw) : [];
    const notes = Array.isArray(parsed) ? parsed.map(normalizeStoredNote) : [];
    const storedActive = localStorage.getItem(ACTIVE_NOTE_STORAGE_KEY);
    const activeId = storedActive && notes.some(note => note.id === storedActive) ? storedActive : notes[0]?.id || null;
    return { notes, activeId };
  } catch (error) {
    console.warn("Unable to hydrate notes:", error);
    return { notes: [], activeId: null };
  }
}

function initFoldersState() {
  if (typeof window === "undefined") {
    return { folders: [], activeFolderId: null };
  }

  try {
    const storedRaw = localStorage.getItem(FOLDERS_STORAGE_KEY);
    const parsed = storedRaw ? JSON.parse(storedRaw) : [];
    const folders = Array.isArray(parsed) ? parsed.map(normalizeStoredFolder) : [];
    const storedActive = localStorage.getItem(ACTIVE_FOLDER_STORAGE_KEY);
    const activeFolderId = storedActive && folders.some(folder => folder.id === storedActive) ? storedActive : null;
    return { folders, activeFolderId };
  } catch (error) {
    console.warn("Unable to hydrate folders:", error);
    return { folders: [], activeFolderId: null };
  }
}

function loadPreferencesState() {
  if (typeof window === "undefined") {
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    const storedRaw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (storedRaw) {
      const parsed = JSON.parse(storedRaw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return {
          ...DEFAULT_PREFERENCES,
          ...parsed
        };
      }
    }
  } catch (error) {
    console.warn("Failed to load preferences:", error);
  }

  return { ...DEFAULT_PREFERENCES };
}

function loadStoredModel() {
  if (typeof window === "undefined") return DEFAULT_MODEL;
  try {
    const stored = localStorage.getItem(MODEL_STORAGE_KEY);
    if (stored && MODEL_OPTIONS.includes(stored)) {
      return stored;
    }
  } catch (error) {
    console.warn("Unable to load stored model:", error);
  }
  return DEFAULT_MODEL;
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

export function AppProvider({ children }) {
  const initial = useMemo(() => initNotesState(), []);
  const folderInitial = useMemo(() => initFoldersState(), []);
  const [notes, setNotes] = useState(initial.notes);
  const [activeNoteId, setActiveNoteId] = useState(initial.activeId);
  const [folders, setFolders] = useState(folderInitial.folders);
  const [activeFolderId, setActiveFolderId] = useState(folderInitial.activeFolderId);
  const [folderWorkspaceOpen, setFolderWorkspaceOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [preferences, setPreferences] = useState(() => loadPreferencesState());
  const [model, setModel] = useState(() => loadStoredModel());
  const [recordings, setRecordings] = useState(() => initRecordingsState());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themeMode, setThemeMode] = useState(() => loadStoredThemeMode());
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark());

  const activeNote = useMemo(
    () => notes.find(note => note.id === activeNoteId) || null,
    [activeNoteId, notes]
  );

  const activeFolder = useMemo(
    () => folders.find(folder => folder.id === activeFolderId) || null,
    [folders, activeFolderId]
  );

  const sortedNotes = useMemo(() => {
    return [...notes].sort((a, b) => {
      const aTimestamp = new Date(a.updatedAt || a.createdAt).getTime() || 0;
      const bTimestamp = new Date(b.updatedAt || b.createdAt).getTime() || 0;
      return bTimestamp - aTimestamp;
    });
  }, [notes]);

  const scopedNotes = useMemo(() => {
    if (!activeFolderId) return sortedNotes;
    return sortedNotes.filter(note => note.folderId === activeFolderId);
  }, [sortedNotes, activeFolderId]);

  useEffect(() => {
    if (folderWorkspaceOpen) {
      if (activeNoteId !== null) {
        setActiveNoteId(null);
      }
      return;
    }

    if (notes.length === 0) {
      if (activeNoteId !== null) {
        setActiveNoteId(null);
      }
      return;
    }

    if (activeFolderId) {
      if (scopedNotes.length === 0) {
        if (activeNoteId !== null) {
          setActiveNoteId(null);
        }
        return;
      }
      const activeIsScoped = scopedNotes.some(note => note.id === activeNoteId);
      if (!activeIsScoped) {
        setActiveNoteId(scopedNotes[0].id);
      }
      return;
    }

    const hasActive = notes.some(note => note.id === activeNoteId);
    if (!hasActive) {
      const fallbackId = sortedNotes[0]?.id ?? null;
      if (activeNoteId !== fallbackId) {
        setActiveNoteId(fallbackId);
      }
    }
  }, [notes, activeNoteId, activeFolderId, folderWorkspaceOpen, scopedNotes, sortedNotes]);

  useEffect(() => {
    if (!activeFolderId) return;
    if (!folders.some(folder => folder.id === activeFolderId)) {
      setActiveFolderId(null);
      setFolderWorkspaceOpen(false);
    }
  }, [activeFolderId, folders]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders));
  }, [folders]);

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
    if (activeFolderId) {
      localStorage.setItem(ACTIVE_FOLDER_STORAGE_KEY, activeFolderId);
    } else {
      localStorage.removeItem(ACTIVE_FOLDER_STORAGE_KEY);
    }
  }, [activeFolderId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(MODEL_STORAGE_KEY, model);
  }, [model]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(RECORDINGS_STORAGE_KEY, JSON.stringify(recordings));
  }, [recordings]);

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

  const addManualEntry = useCallback(
    text => {
      if (!activeNoteId) return;
      const timestamp = new Date().toISOString();
      const entry = {
        id: generateId("manual"),
        source: "manual",
        text,
        timestamp
      };
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

  const addInitialEntry = useCallback(
    text => {
      if (!activeNoteId) return;
      const timestamp = new Date().toISOString();
      const entry = {
        id: generateId("initial"),
        source: "initial",
        text,
        timestamp
      };
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

  const registerRecording = useCallback(recording => {
    if (!recording) return;
    setRecordings(prev => [recording, ...prev]);
  }, []);

  const updateRecording = useCallback((id, updates) => {
    if (!id || !updates) return;
    setRecordings(prev =>
      prev.map(recording => (recording.id === id ? { ...recording, ...updates } : recording))
    );
  }, []);

  const deleteRecording = useCallback(async recording => {
    if (!recording?.id) return;
    setRecordings(prev => prev.filter(item => item.id !== recording.id));
    if (!recording.filePath) return;
    if (typeof window === "undefined") return;
    const deleteFile = window?.electronAPI?.deleteRecordingFile;
    if (!deleteFile) return;
    try {
      await deleteFile(recording.filePath);
    } catch (error) {
      console.error("Failed to delete recording file:", error);
    }
  }, []);

  const updateTranscriptEntry = useCallback(
    (noteId, entryId, text) => {
      if (!noteId || !entryId) return;
      const timestamp = new Date().toISOString();
      setNotes(prev =>
        prev.map(note => {
          if (note.id !== noteId) return note;
          let updated = false;
          const transcript = (note.transcript || []).map(entry => {
            if (entry.id !== entryId) return entry;
            updated = true;
            return { ...entry, text: text ?? entry.text };
          });
          if (!updated) return note;
          const updatedEntry = transcript.find(entry => entry.id === entryId);
          const nextInitialContext =
            updatedEntry?.source === "initial" ? (updatedEntry.text || "").trim() : note.initialContext;
          return { ...note, transcript, updatedAt: timestamp, initialContext: nextInitialContext };
        })
      );
    },
    []
  );

  const openFolderWorkspace = useCallback(folderId => {
    if (!folderId) return;
    setActiveFolderId(folderId);
    setActiveNoteId(null);
    setFolderWorkspaceOpen(true);
  }, []);

  const closeFolderWorkspace = useCallback(() => {
    setFolderWorkspaceOpen(false);
  }, []);

  const createNote = useCallback(() => {
    const folderContext = activeFolder;
    const note = createFreshNote({
      folderId: folderContext?.id ?? null,
      initialContext: folderContext?.defaultInitialContext ?? ""
    });
    setNotes(prev => [note, ...prev]);
    setActiveNoteId(note.id);
    setActiveFolderId(folderContext?.id ?? null);
    setFolderWorkspaceOpen(false);
  }, [activeFolder]);

  const createFolder = useCallback(
    folderInput => {
      const folder = createFreshFolder(folderInput);
      setFolders(prev => [folder, ...prev]);
      openFolderWorkspace(folder.id);
    },
    [openFolderWorkspace]
  );

  const selectFolder = useCallback(
    folderId => {
      openFolderWorkspace(folderId);
    },
    [openFolderWorkspace]
  );

  const clearFolderSelection = useCallback(() => {
    setActiveFolderId(null);
    setFolderWorkspaceOpen(false);
  }, []);

  const updateFolder = useCallback((folderId, updates) => {
    if (!folderId || !updates) return;
    setFolders(prev =>
      prev.map(folder => {
        if (folder.id !== folderId) return folder;
        return {
          ...folder,
          name:
            typeof updates.name === "string" && updates.name.trim().length
              ? updates.name.trim()
              : folder.name,
          description: typeof updates.description === "string" ? updates.description.trim() : folder.description,
          defaultInitialContext:
            typeof updates.defaultInitialContext === "string" ? updates.defaultInitialContext.trim() : folder.defaultInitialContext,
          defaultSummaryPrompt:
            typeof updates.defaultSummaryPrompt === "string" ? updates.defaultSummaryPrompt.trim() : folder.defaultSummaryPrompt,
          defaultSummaryType:
            typeof updates.defaultSummaryType === "string" && updates.defaultSummaryType.trim()
              ? updates.defaultSummaryType.trim()
              : folder.defaultSummaryType,
          tags: updates.tags ? normalizeTags(updates.tags) : folder.tags,
          color: typeof updates.color === "string" && updates.color.trim() ? updates.color : folder.color,
          icon: typeof updates.icon === "string" && updates.icon.trim() ? updates.icon : folder.icon
        };
      })
    );
  }, []);

  const deleteFolder = useCallback(
    folderId => {
      if (!folderId) return;
      setFolders(prev => prev.filter(folder => folder.id !== folderId));
      setNotes(prev => prev.map(note => (note.folderId === folderId ? { ...note, folderId: null } : note)));
      setActiveFolderId(prev => (prev === folderId ? null : prev));
      setFolderWorkspaceOpen(false);
    },
    []
  );

  const selectNote = useCallback(
    noteId => {
      setActiveNoteId(noteId);
      const note = notes.find(n => n.id === noteId);
      if (activeFolderId) {
        if (note?.folderId && note.folderId !== activeFolderId) {
          setActiveFolderId(note.folderId);
        }
      } else {
        setActiveFolderId(null);
      }
      setFolderWorkspaceOpen(false);
    },
    [notes, activeFolderId]
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

  const updateNoteInitialContext = useCallback(
    (noteId, initialContext) => {
      const normalized = typeof initialContext === "string" ? initialContext.trim() : "";
      updateNote(noteId, { initialContext: normalized });
    },
    [updateNote]
  );

  const assignNoteFolder = useCallback(
    (noteId, folderId) => {
      if (!noteId) return;
      const normalizedFolderId = folderId || null;
      updateNote(noteId, { folderId: normalizedFolderId });
      setActiveFolderId(normalizedFolderId);
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

  const handleLanguageChange = useCallback(event => {
    const next = event.target.value || DEFAULT_PREFERENCES.language;
    setPreferences(prev => ({ ...prev, language: next }));
  }, []);

  const handleModelChange = useCallback(event => {
    setModel(event.target.value);
  }, []);

  const filteredNotes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return scopedNotes;
    return scopedNotes.filter(note => {
      const haystack = [
        note.title || "",
        note.highlightsHtml || "",
        ...(note.transcript || []).map(entry => entry.text || "")
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [scopedNotes, searchTerm]);

  const generateSummary = useCallback(
    async (noteId, promptText, transcriptSnippet) => {
      if (!noteId) {
        throw new Error("Select or create a note before generating a summary.");
      }
      const note = notes.find(n => n.id === noteId);
      if (!note) {
        throw new Error("Unable to locate the selected note.");
      }
      const snippet = (transcriptSnippet || buildTranscriptSnippet(note, {})).trim();
      if (!snippet) {
        throw new Error("No transcript content is available yet. Capture audio first.");
      }
      const folderContext = folders.find(folder => folder.id === note.folderId);
      const folderPrompt = folderContext?.defaultSummaryPrompt?.trim();
      const normalizedPrompt = promptText?.trim() || folderPrompt || "Meeting summary";
      const apiKey = window.electronAPI?.apiKey;
      if (!apiKey) {
        throw new Error("Missing OpenAI API key. Add OPENAI_KEY to your .env file.");
      }

      const payload = {
        model: "gpt-5-mini",
        temperature: API_TEMPERATURE,
        messages: [
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
    [notes, folders, updateNote]
  );

  const handleThemeModeChange = useCallback(mode => {
    if (!THEME_MODES.includes(mode)) return;
    setThemeMode(mode);
  }, []);

  const resetAllData = useCallback(() => {
    const freshNote = createFreshNote();
    if (typeof window !== "undefined") {
      [
        NOTES_STORAGE_KEY,
        ACTIVE_NOTE_STORAGE_KEY,
        FOLDERS_STORAGE_KEY,
        ACTIVE_FOLDER_STORAGE_KEY,
        SETTINGS_STORAGE_KEY,
        MODEL_STORAGE_KEY,
        RECORDINGS_STORAGE_KEY,
        THEME_STORAGE_KEY,
        MIC_DEVICE_STORAGE_KEY
      ].forEach(key => window.localStorage.removeItem(key));
    }
    setNotes([freshNote]);
    setActiveNoteId(freshNote.id);
    setFolders([]);
    setRecordings([]);
    setActiveFolderId(null);
    setFolderWorkspaceOpen(false);
    setSearchTerm("");
    setPreferences({ ...DEFAULT_PREFERENCES });
    setModel(DEFAULT_MODEL);
    setThemeMode("system");
    setSettingsOpen(false);
  }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  const value = useMemo(
    () => ({
      notes,
      filteredNotes,
      searchTerm,
      folders,
      recordings,
      activeFolderId,
      activeFolder,
      folderWorkspaceOpen,
      openFolderWorkspace,
      closeFolderWorkspace,
      setSearchTerm,
      activeNote,
      activeNoteId,
      selectNote,
      createNote,
      createFolder,
      selectFolder,
      clearFolderSelection,
      updateNoteTitle,
      updateNoteHighlights,
      updateNoteInitialContext,
      assignNoteFolder,
      appendTranscriptEntry,
      registerRecording,
      updateRecording,
      deleteRecording,
      addManualEntry,
      addInitialEntry,
      archiveNote,
      updateTranscriptEntry,
      deleteArchivedNotes,
      deleteNote,
      updateFolder,
      deleteFolder,
      preferences,
      handleLanguageChange,
      model,
      handleModelChange,
      settingsOpen,
      openSettings,
      closeSettings,
      setSettingsOpen,
      themeMode,
      handleThemeModeChange,
      resetAllData,
      systemPrefersDark,
      generateSummary
    }),
    [
      notes,
      filteredNotes,
      searchTerm,
      folders,
      recordings,
      activeFolderId,
      activeFolder,
      folderWorkspaceOpen,
      openFolderWorkspace,
      closeFolderWorkspace,
      selectNote,
      createNote,
      createFolder,
      selectFolder,
      clearFolderSelection,
      updateNoteTitle,
      updateNoteHighlights,
      updateNoteInitialContext,
      assignNoteFolder,
      appendTranscriptEntry,
      addManualEntry,
      addInitialEntry,
      archiveNote,
      updateTranscriptEntry,
      deleteArchivedNotes,
      deleteNote,
      updateFolder,
      deleteFolder,
      registerRecording,
      updateRecording,
      deleteRecording,
      preferences,
      handleLanguageChange,
      model,
      handleModelChange,
      settingsOpen,
      openSettings,
      closeSettings,
      setSettingsOpen,
      themeMode,
      handleThemeModeChange,
      resetAllData,
      systemPrefersDark,
      generateSummary
    ]
  );

  return (
    <AppContext.Provider value={value}>
      <AudioProvider
        activeNote={activeNote}
        model={model}
        preferences={preferences}
        onAppendTranscriptEntry={appendTranscriptEntry}
        onRegisterRecording={registerRecording}
        onUpdateRecording={updateRecording}
      >
        {children}
      </AudioProvider>
    </AppContext.Provider>
  );
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) {
    throw new Error("useApp must be used within AppProvider");
  }
  return value;
}
