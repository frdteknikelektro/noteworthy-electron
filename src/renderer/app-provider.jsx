"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { NOTES_STORAGE_KEY, ACTIVE_NOTE_STORAGE_KEY } from "./storage-keys";

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
    archived: false
  };
}

function normalizeStoredNote(note) {
  const now = new Date().toISOString();
  return {
    ...note,
    transcript: note.transcript || [],
    highlightsHtml: note.highlightsHtml || "",
    archived: Boolean(note.archived),
    createdAt: note.createdAt || now,
    updatedAt: note.updatedAt || note.createdAt || now
  };
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

export function AppProvider({ children }) {
  const initial = useMemo(() => initNotesState(), []);
  const [notes, setNotes] = useState(initial.notes);
  const [activeNoteId, setActiveNoteId] = useState(initial.activeId);
  const [searchTerm, setSearchTerm] = useState("");

  const activeNote = useMemo(() => notes.find(note => note.id === activeNoteId) || notes[0] || null, [activeNoteId, notes]);

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
    const note = createFreshNote();
    setNotes(prev => [note, ...prev]);
    setActiveNoteId(note.id);
  }, []);

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

  const value = useMemo(
    () => ({
      notes,
      filteredNotes,
      searchTerm,
      setSearchTerm,
      activeNote,
      activeNoteId,
      setActiveNoteId,
      createNote,
      updateNoteTitle,
      updateNoteHighlights,
      appendTranscriptEntry,
      archiveNote,
      deleteArchivedNotes
    }),
    [
      notes,
      filteredNotes,
      searchTerm,
      activeNote,
      activeNoteId,
      setActiveNoteId,
      setSearchTerm,
      createNote,
      updateNoteTitle,
      updateNoteHighlights,
      appendTranscriptEntry,
      archiveNote,
      deleteArchivedNotes
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
