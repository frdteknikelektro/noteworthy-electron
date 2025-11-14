import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './components/ui/button';
import { Session, WavRecorder } from './lib/audio';

const STORAGE_KEYS = {
  notes: 'noteworthy.notes.v1',
  activeNote: 'noteworthy.active-note',
  settings: 'noteworthy.settings.v1'
};

const LANGUAGE_LABELS = {
  id: 'Bahasa Indonesia',
  en: 'English',
  ms: 'Bahasa Melayu',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  es: 'Spanish',
  fr: 'French',
  de: 'German'
};

const DEFAULT_PREFERENCES = {
  language: 'id',
  prompt: '',
  silenceSeconds: 5
};

const MODEL_OPTIONS = ['whisper-1', 'gpt-4o-transcribe', 'gpt-4o-mini-transcribe'];

const STREAM_META = {
  microphone: { statusId: 'microphone', messageSource: 'microphone', errorLabel: 'microphone' },
  system_audio: { statusId: 'speaker', messageSource: 'speaker', errorLabel: 'system audio' }
};

const THEME_STORAGE_KEY = 'mic-speaker-streamer.theme';
const THEME_MODES = ['system', 'light', 'dark'];
const THEME_ICONS = { system: '🌓', light: '☀️', dark: '🌙' };
const THEME_LABELS = { system: 'System', light: 'Light', dark: 'Dark' };

function generateId(prefix = 'entry') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createFreshNote() {
  const now = new Date().toISOString();
  return {
    id: generateId('note'),
    title: `Live note — ${new Date().toLocaleDateString()}`,
    createdAt: now,
    updatedAt: now,
    highlightsHtml: '',
    transcript: [],
    archived: false
  };
}

function normalizeStoredNote(note) {
  return {
    ...note,
    transcript: note.transcript || [],
    highlightsHtml: note.highlightsHtml || '',
    archived: Boolean(note.archived)
  };
}

function sanitizeSilenceSeconds(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return DEFAULT_PREFERENCES.silenceSeconds;
  }
  return Math.min(30, Math.max(1, Number(numeric.toFixed(2))));
}

function initNotesState() {
  if (typeof window === 'undefined') {
    const note = createFreshNote();
    return { notes: [note], activeId: note.id };
  }

  try {
    const storedRaw = localStorage.getItem(STORAGE_KEYS.notes);
    const parsed = storedRaw ? JSON.parse(storedRaw) : [];
    const notes = Array.isArray(parsed) && parsed.length ? parsed.map(normalizeStoredNote) : [createFreshNote()];
    const storedActive = localStorage.getItem(STORAGE_KEYS.activeNote);
    const activeId = storedActive && notes.some(note => note.id === storedActive) ? storedActive : notes[0]?.id || null;
    return { notes, activeId };
  } catch (error) {
    console.warn('Unable to hydrate notes:', error);
    const note = createFreshNote();
    return { notes: [note], activeId: note.id };
  }
}

function loadPreferencesState() {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_PREFERENCES };
  }

  try {
    const storedRaw = localStorage.getItem(STORAGE_KEYS.settings);
    if (storedRaw) {
      const parsed = JSON.parse(storedRaw);
      return {
        ...DEFAULT_PREFERENCES,
        ...parsed,
        silenceSeconds: sanitizeSilenceSeconds(parsed?.silenceSeconds ?? DEFAULT_PREFERENCES.silenceSeconds)
      };
    }
  } catch (error) {
    console.warn('Failed to load preferences:', error);
  }

  return { ...DEFAULT_PREFERENCES };
}

function formatTimestamp(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function relativeLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes} min ago`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
}

function stripVideoTracks(stream) {
  stream.getVideoTracks().forEach(track => {
    try {
      track.stop();
      stream.removeTrack(track);
    } catch (error) {
      console.warn('Unable to remove video track:', error);
    }
  });
}

function loadStoredThemeMode() {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (THEME_MODES.includes(stored)) {
      return stored;
    }
  } catch (error) {
    console.warn('Unable to read theme preference:', error);
  }
  return 'system';
}

function getSystemPrefersDark() {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function resolveThemeTone(mode, prefersDark) {
  if (mode === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return mode;
}

export default function App() {
  const initialNotesState = useMemo(() => initNotesState(), []);
  const [notes, setNotes] = useState(initialNotesState.notes);
  const [activeNoteId, setActiveNoteId] = useState(initialNotesState.activeId);
  const [preferences, setPreferences] = useState(() => loadPreferencesState());
  const [model, setModel] = useState('gpt-4o-mini-transcribe');
  const [micDeviceId, setMicDeviceId] = useState('');
  const [micDevices, setMicDevices] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [drafts, setDrafts] = useState({ microphone: null, speaker: null });
  const [streamStatus, setStreamStatus] = useState({ microphone: false, speaker: false });
  const [isRecording, setIsRecording] = useState(false);
  const [themeMode, setThemeMode] = useState(() => loadStoredThemeMode());
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark());
  const titleInputRef = useRef(null);
  const highlightsRef = useRef(null);
  const microphoneSessionRef = useRef(null);
  const systemAudioSessionRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const systemAudioStreamRef = useRef(null);
  const wavRecorderRef = useRef(new WavRecorder());

  const activeNote = useMemo(() => {
    if (!notes.length) return null;
    return notes.find(note => note.id === activeNoteId) || notes[0];
  }, [activeNoteId, notes]);

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
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(notes));
  }, [notes]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeNoteId) {
      localStorage.setItem(STORAGE_KEYS.activeNote, activeNoteId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.activeNote);
    }
  }, [activeNoteId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tone = resolveThemeTone(themeMode, systemPrefersDark);
    document.documentElement.dataset.theme = tone;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch (error) {
      console.warn('Unable to persist theme preference:', error);
    }
  }, [themeMode, systemPrefersDark]);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = event => {
      setSystemPrefersDark(event.matches);
    };

    if ('addEventListener' in mediaQuery) {
      mediaQuery.addEventListener('change', handleChange);
    } else if ('addListener' in mediaQuery) {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if ('removeEventListener' in mediaQuery) {
        mediaQuery.removeEventListener('change', handleChange);
      } else if ('removeListener' in mediaQuery) {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  useEffect(() => {
    if (highlightsRef.current) {
      highlightsRef.current.innerHTML = activeNote?.highlightsHtml || '';
    }
  }, [activeNote?.id]);

  const refreshMicrophones = useCallback(() => {
    if (!navigator?.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices
      .enumerateDevices()
      .then(devices => {
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        setMicDevices(audioInputs);
      })
      .catch(error => console.warn('Unable to enumerate microphones', error));
  }, []);

  useEffect(() => {
    refreshMicrophones();
    if (!navigator?.mediaDevices?.addEventListener) return;
    const handler = () => refreshMicrophones();
    navigator.mediaDevices.addEventListener('devicechange', handler);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handler);
  }, [refreshMicrophones]);

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

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isCapturing, stopCapture]);

  const appendFinalTranscript = useCallback(
    (source, text) => {
      if (!activeNoteId) return;
      const entry = {
        id: generateId('entry'),
        source,
        text,
        timestamp: new Date().toISOString()
      };
      setNotes(prev =>
        prev.map(note =>
          note.id === activeNoteId
            ? {
                ...note,
                transcript: [...(note.transcript || []), entry],
                updatedAt: new Date().toISOString()
              }
            : note
        )
      );
    },
    [activeNoteId]
  );

  const beginDraft = useCallback((source, initialText, statusLabel) => {
    setDrafts(prev => ({
      ...prev,
      [source]: {
        id: generateId('draft'),
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
        case 'transcription_session.created':
          console.log(`${source} session created:`, message.session?.id);
          break;
        case 'input_audio_buffer.speech_started':
          beginDraft(source, 'Listening…', 'Listening…');
          break;
        case 'input_audio_buffer.speech_stopped':
          updateDraft(source, 'Processing…', 'Processing…');
          break;
        case 'conversation.item.input_audio_transcription.completed':
          finalizeDraft(source, message.transcript || '');
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
      session.onconnectionstatechange = stateValue => updateStatus(meta.statusId, stateValue === 'connected');
      session.onmessage = message => handleStreamMessage(meta.messageSource, message);
      session.onerror = error => handleCaptureError(error, meta.errorLabel);
      return session;
    },
    [handleCaptureError, handleStreamMessage, updateStatus]
  );

  const setupRealtimeSessions = useCallback(
    async sessionConfig => {
      microphoneSessionRef.current = createRealtimeSession('microphone');
      systemAudioSessionRef.current = createRealtimeSession('system_audio');
      await Promise.all([
        microphoneSessionRef.current.startTranscription(microphoneStreamRef.current, sessionConfig),
        systemAudioSessionRef.current.startTranscription(systemAudioStreamRef.current, sessionConfig)
      ]);
    },
    [createRealtimeSession]
  );

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
        type: 'server_vad',
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

  const captureMediaStreams = useCallback(
    async () => {
      const microphone = await navigator.mediaDevices.getUserMedia({
        audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
        video: false
      });

      if (window.electronAPI?.enableLoopbackAudio) {
        await window.electronAPI.enableLoopbackAudio();
      }

      let displayStream;
      try {
        displayStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
      } finally {
        if (window.electronAPI?.disableLoopbackAudio) {
          await window.electronAPI.disableLoopbackAudio();
        }
      }

      stripVideoTracks(displayStream);
      return { microphone, systemAudio: displayStream };
    },
    [micDeviceId]
  );

  const ensureCapturePreconditions = useCallback(() => {
    if (!activeNote) {
      alert('Create or select a note before starting capture.');
      return false;
    }
    if (activeNote.archived) {
      alert('Unarchive the note before resuming capture.');
      return false;
    }
    if (!window.electronAPI?.apiKey) {
      alert('Missing OpenAI API key. Add it to your .env file as OPENAI_KEY.');
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
        systemAudioStreamRef.current = streams.systemAudio;
        const sessionConfig = buildSessionConfig();
        await setupRealtimeSessions(sessionConfig);
        updateStatus('microphone', true);
        updateStatus('speaker', true);
      } catch (error) {
        console.error('Error starting capture:', error);
        alert(`Error starting capture: ${error.message}`);
        stopCapture();
      }
    },
    [buildSessionConfig, captureMediaStreams, ensureCapturePreconditions, setupRealtimeSessions, stopCapture, updateStatus]
  );

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
      console.error('Error controlling recording:', error);
      alert(error.message);
    }
  }, []);

  const createNote = useCallback(() => {
    const note = createFreshNote();
    setNotes(prev => [note, ...prev]);
    setActiveNoteId(note.id);
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }, []);

  const updateNoteTitle = useCallback(
    value => {
      if (!activeNoteId) return;
      setNotes(prev =>
        prev.map(note =>
          note.id === activeNoteId
            ? { ...note, title: value || 'Untitled note', updatedAt: new Date().toISOString() }
            : note
        )
      );
    },
    [activeNoteId]
  );

  const handleHighlightsInput = useCallback(() => {
    if (!activeNoteId || !highlightsRef.current) return;
    const html = highlightsRef.current.innerHTML;
    setNotes(prev =>
      prev.map(note =>
        note.id === activeNoteId
          ? { ...note, highlightsHtml: html, updatedAt: new Date().toISOString() }
          : note
      )
    );
  }, [activeNoteId]);

  const setActiveNoteSafely = useCallback(
    noteId => {
      if (!noteId || noteId === activeNoteId) return;
      if (isCapturing && activeNoteId && noteId !== activeNoteId) {
        const proceed = window.confirm('Switching notes will stop the current capture. Continue?');
        if (!proceed) {
          return;
        }
        stopCapture();
      }
      setActiveNoteId(noteId);
    },
    [activeNoteId, isCapturing, stopCapture]
  );

  const archiveActiveNote = useCallback(() => {
    if (!activeNote) return;
    if (isCapturing) {
      stopCapture();
    }
    setNotes(prev =>
      prev.map(note =>
        note.id === activeNote.id
          ? { ...note, archived: !note.archived, updatedAt: new Date().toISOString() }
          : note
      )
    );
  }, [activeNote, isCapturing, stopCapture]);

  const clearArchivedNotes = useCallback(() => {
    const hasArchived = notes.some(note => note.archived);
    if (!hasArchived) {
      alert('No archived notes to clear.');
      return;
    }
    if (!window.confirm('This will permanently delete all archived notes. Continue?')) {
      return;
    }
    setNotes(prev => prev.filter(note => !note.archived));
  }, [notes]);

  const handleExportMarkdown = useCallback(() => {
    if (!activeNote) {
      alert('Select a note to export.');
      return;
    }

    const lines = [];
    lines.push(`# ${activeNote.title || 'Untitled note'}`);
    lines.push('');
    lines.push(`Created: ${formatTimestamp(activeNote.createdAt)}`);
    if (activeNote.updatedAt && activeNote.updatedAt !== activeNote.createdAt) {
      lines.push(`Updated: ${formatTimestamp(activeNote.updatedAt)}`);
    }
    lines.push('');
    lines.push('## Transcript');
    lines.push('');

    const transcriptEntries = activeNote.transcript || [];
    if (transcriptEntries.length === 0) {
      lines.push('_No transcript captured yet._');
    } else {
      transcriptEntries.forEach(entry => {
        const sourceLabel = entry.source === 'microphone' ? 'Microphone' : 'System audio';
        lines.push(`- **${sourceLabel} (${formatTimestamp(entry.timestamp)}):** ${entry.text}`);
      });
    }

    if (activeNote.highlightsHtml) {
      lines.push('');
      lines.push('## Highlights');
      lines.push('');
      const temp = document.createElement('div');
      temp.innerHTML = activeNote.highlightsHtml;
      const textContent = temp.innerText.trim();
      lines.push(textContent || '_No highlights yet._');
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${(activeNote.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${activeNote.id}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }, [activeNote]);

  const handleExportPdf = useCallback(() => {
    if (!activeNote) {
      alert('Select a note to export.');
      return;
    }

    const printWindow = window.open('', '_blank', 'width=900,height=800');
    if (!printWindow) {
      alert('Unable to open print preview. Disable pop-up blockers and try again.');
      return;
    }

    const transcriptEntries = activeNote.transcript || [];
    const transcriptHtml = transcriptEntries
      .map(entry => {
        const sourceLabel = entry.source === 'microphone' ? 'Microphone' : 'System audio';
        return `
          <div style="margin-bottom:12px;">
            <div style="font-size:12px;color:#555;">
              <strong>${sourceLabel}</strong>
              · ${formatTimestamp(entry.timestamp)}
            </div>
            <div style="font-size:14px;line-height:1.5;">${entry.text}</div>
          </div>`;
      })
      .join('') || '<em>No transcript captured yet.</em>';

    const highlights = activeNote.highlightsHtml ? `<h2>Highlights</h2><div>${activeNote.highlightsHtml}</div>` : '';

    printWindow.document.write(`
      <html>
        <head>
          <title>${activeNote.title}</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px; color: #111; }
            h1 { margin-bottom: 4px; }
            h2 { margin-top: 32px; }
          </style>
        </head>
        <body>
          <h1>${activeNote.title || 'Untitled note'}</h1>
          <p>Created: ${formatTimestamp(activeNote.createdAt)}${activeNote.updatedAt ? `<br/>Updated: ${formatTimestamp(activeNote.updatedAt)}` : ''}</p>
          <h2>Transcript</h2>
          ${transcriptHtml}
          ${highlights}
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }, [activeNote]);

  const handleThemeToggle = useCallback(() => {
    const currentIndex = THEME_MODES.indexOf(themeMode);
    const nextIndex = (currentIndex + 1) % THEME_MODES.length;
    setThemeMode(THEME_MODES[nextIndex]);
  }, [themeMode]);

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

  const handleMicChange = useCallback(event => {
    setMicDeviceId(event.target.value);
  }, []);

  const handleSearchChange = useCallback(event => {
    setSearchTerm(event.target.value);
  }, []);

  const noteStatusText = useMemo(() => {
    if (!activeNote) {
      return 'Create or select a note to begin.';
    }
    if (activeNote.archived) {
      return 'Archived note — unarchive to resume capture.';
    }
    const languageLabel = LANGUAGE_LABELS[preferences.language] || preferences.language.toUpperCase();
    if (isCapturing) {
      return `Capturing audio (${languageLabel}, idle ≥ ${preferences.silenceSeconds}s).`;
    }
    return `Ready — press “Start capture” to transcribe in ${languageLabel}.`;
  }, [activeNote, isCapturing, preferences.language, preferences.silenceSeconds]);

  const noteTimestamp = useMemo(() => {
    if (!activeNote) return 'No note selected';
    const created = formatTimestamp(activeNote.createdAt);
    const updatedLabel = activeNote.updatedAt && activeNote.updatedAt !== activeNote.createdAt ? ` · Updated ${formatTimestamp(activeNote.updatedAt)}` : '';
    return `Created ${created}${updatedLabel}`;
  }, [activeNote]);

  const filteredNotes = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const sorted = [...notes].sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
    return sorted.filter(note => {
      if (!term) return true;
      const haystack = [note.title || '', note.highlightsHtml || '', ...(note.transcript || []).map(entry => entry.text || '')]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });
  }, [notes, searchTerm]);

  const transcriptEntries = useMemo(() => {
    const finalEntries = activeNote?.transcript || [];
    const queue = [...finalEntries];
    Object.values(drafts)
      .filter(Boolean)
      .forEach(draft => queue.push({ ...draft, isDraft: true }));
    return queue;
  }, [activeNote?.transcript, drafts]);

  const canCapture = Boolean(activeNote && !activeNote.archived);
  const startDisabled = isCapturing || !canCapture;
  const stopDisabled = !isCapturing;
  const recordDisabled = !isCapturing;
  const micSelectDisabled = isCapturing;
  const modelSelectDisabled = isCapturing;
  const languageSelectDisabled = isCapturing;
  const silenceInputDisabled = isCapturing;
  const recordButtonLabel = isRecording ? 'Stop backup recording' : 'Start backup recording';
  const micStatusClass = `pill microphone ${streamStatus.microphone ? 'connected' : 'disconnected'}`;
  const speakerStatusClass = `pill speaker ${streamStatus.speaker ? 'connected' : 'disconnected'}`;
  const micStatusLabel = streamStatus.microphone ? 'Microphone live' : 'Microphone offline';
  const speakerStatusLabel = streamStatus.speaker ? 'System audio live' : 'System audio offline';
  const recordStatusClass = `pill recording ${isRecording ? 'connected' : 'disconnected'}`;
  const recordStatusLabel = isRecording ? 'Backup recording active' : 'Backup recording idle';
  const archiveButtonText = activeNote?.archived ? 'Unarchive note' : 'Archive note';

  const themeIcon = THEME_ICONS[themeMode];
  const themeLabel = THEME_LABELS[themeMode];

  return (
    <div className="app-shell">
      <header className="top-bar">
        <div className="brand-text">
          <p className="eyebrow">Realtime capture</p>
          <h1 className="brand-heading">Mic + Speaker Streamer</h1>
          <p className="brand-subtitle">Clean, configurable capture tools inspired by Shadcn UI.</p>
        </div>
        <div className="top-actions">
          <div className="theme-control">
            <span className="theme-label">Theme</span>
            <Button variant="ghost" className="ghost-btn" type="button" onClick={handleThemeToggle}>
              <span className="theme-icon" aria-hidden="true">
                {themeIcon}
              </span>
              <span className="theme-text">{themeLabel}</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="content-layout">
        <aside className="sidebar">
          <div className="sidebar-header">
            <div>
              <p className="eyebrow">Notes</p>
              <h2>Live library</h2>
            </div>
            <button className="primary-btn" type="button" onClick={createNote}>
              New live note
            </button>
          </div>
          <div className="note-controls">
            <div className="note-search">
              <input type="search" value={searchTerm} onChange={handleSearchChange} placeholder="Search notes" autoComplete="off" />
            </div>
          </div>
          <div className="note-list">
            {filteredNotes.length === 0 ? (
              <div className="note-item">
                {searchTerm ? 'No notes match that search.' : 'No notes yet — create a live note to get started.'}
              </div>
            ) : (
              filteredNotes.map(note => (
                <button
                  key={note.id}
                  type="button"
                  className={`note-item${note.id === activeNote?.id ? ' active' : ''}`}
                  onClick={() => setActiveNoteSafely(note.id)}
                >
                  <div className="note-item-title">{note.title || 'Untitled note'}</div>
                  <div className="note-item-meta">
                    {note.archived ? 'Archived' : 'Active'} • {relativeLabel(note.updatedAt || note.createdAt)}
                  </div>
                </button>
              ))
            )}
          </div>
          <button className="link-btn" type="button" onClick={clearArchivedNotes}>
            Clear archived notes
          </button>
        </aside>

        <main className="content-panel">
          <section className="card note-heading">
            <div className="note-heading-row">
              <div>
                <p className="eyebrow">Active note</p>
                <input
                  ref={titleInputRef}
                  className="note-title"
                  type="text"
                  value={activeNote?.title || ''}
                  onChange={event => updateNoteTitle(event.target.value)}
                  placeholder="Untitled note"
                />
                <p className="note-timestamp">{noteTimestamp}</p>
              </div>
              <div className="note-heading-actions">
                <button className="secondary-btn" type="button" onClick={handleExportMarkdown}>
                  Export Markdown
                </button>
                <button className="secondary-btn" type="button" onClick={handleExportPdf}>
                  Export PDF
                </button>
              </div>
            </div>
          </section>

          <section className="grid-two">
            <article className="card capture-card">
              <div className="section-header">
                <span className="section-title">Capture controls</span>
                <p className="section-subtitle">Start both microphone and system audio sessions.</p>
              </div>
              <div className="control-row">
                <button className="primary-btn" type="button" onClick={startCapture} disabled={startDisabled}>
                  Start capture
                </button>
                <button className="secondary-btn" type="button" onClick={stopCapture} disabled={stopDisabled}>
                  Stop capture
                </button>
                <button className="secondary-btn" type="button" onClick={toggleRecording} disabled={recordDisabled}>
                  {recordButtonLabel}
                </button>
              </div>
              <div className="control-row">
                <select value={micDeviceId} onChange={handleMicChange} disabled={micSelectDisabled}>
                  <option value="">Default microphone</option>
                  {micDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${device.deviceId.slice(-4)}`}
                    </option>
                  ))}
                </select>
                <select value={model} onChange={handleModelChange} disabled={modelSelectDisabled}>
                  {MODEL_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div className="status-row">
                <span className={micStatusClass}>{micStatusLabel}</span>
                <span className={speakerStatusClass}>{speakerStatusLabel}</span>
                <span className={recordStatusClass}>{recordStatusLabel}</span>
              </div>
            </article>

            <article className="card preferences-card">
              <div className="section-header">
                <span className="section-title">Preferences</span>
                <p className="section-subtitle">Adjust transcription language, context, and VAD timing.</p>
              </div>
              <div className="preferences-grid">
                <label className="preference-group">
                  <span className="preference-label">Transcription language</span>
                  <select
                    className="preference-input"
                    value={preferences.language}
                    onChange={handleLanguageChange}
                    disabled={languageSelectDisabled}
                  >
                    {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="preference-group" style={{ gridColumn: 'span 2' }}>
                  <span className="preference-label">Context prompt</span>
                  <input
                    className="preference-input"
                    type="text"
                    placeholder="e.g., team names or glossary"
                    value={preferences.prompt}
                    onChange={handlePromptChange}
                  />
                </label>
                <label className="preference-group">
                  <span className="preference-label">Idle detection (seconds)</span>
                  <input
                    className="preference-input"
                    type="number"
                    min="1"
                    max="30"
                    step="0.5"
                    value={preferences.silenceSeconds}
                    onChange={handleSilenceChange}
                    disabled={silenceInputDisabled}
                  />
                </label>
              </div>
            </article>
          </section>

          <section className="card transcript-card">
            <div className="section-header">
              <span className="section-title">Live transcript</span>
              <p className="section-subtitle">Entries arrive as soon as the Realtime API completes each turn.</p>
            </div>
            <div className="transcript-stream">
              {transcriptEntries.length === 0 ? (
                <div className="transcript-entry">
                  <div className="entry-header">
                    <span className="pill">Waiting for capture…</span>
                  </div>
                  <div className="entry-text">
                    Choose a note and press “Start capture” to begin transcribing.
                  </div>
                </div>
              ) : (
                transcriptEntries.map(entry => (
                  <div
                    key={entry.id}
                    className="transcript-entry"
                    data-source={entry.source}
                    data-draft={entry.isDraft ? 'true' : undefined}
                  >
                    <div className="entry-header">
                      <span className={`pill ${entry.source === 'microphone' ? 'microphone' : 'speaker'}`}>
                        {entry.source === 'microphone' ? 'Microphone' : 'System audio'}
                      </span>
                      {entry.statusLabel ? <span className="entry-status">{entry.statusLabel}</span> : null}
                      <span className="entry-timestamp">{formatTimestamp(entry.timestamp)}</span>
                    </div>
                    <div className="entry-text">{entry.text}</div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="card highlight-card">
            <div className="section-header">
              <span className="section-title">Highlights</span>
              <p className="section-subtitle">Capture key insights or corrections for each session.</p>
            </div>
            <div
              id="noteHighlights"
              ref={highlightsRef}
              className="note-editor"
              contentEditable
              onInput={handleHighlightsInput}
            />
          </section>

          <section className="card housekeeping-card">
            <div className="section-header">
              <span className="section-title">Housekeeping</span>
            </div>
            <div className="housekeeping-body">
              <div className="status-copy">
                <strong>Status:</strong> <span>{noteStatusText}</span>
              </div>
              <button
                className="secondary-btn"
                type="button"
                onClick={archiveActiveNote}
                disabled={!activeNote}
              >
                {archiveButtonText}
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
