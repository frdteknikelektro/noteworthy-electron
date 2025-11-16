import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './components/ui/button';
import {
  Dialog,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogContent,
  DialogClose
} from './components/ui/dialog';
import { Session, WavRecorder } from './lib/audio';
import Dashboard from "@/renderer/dashboard";
import { AppProvider, useApp, generateId } from './app-provider';
import { SETTINGS_STORAGE_KEY } from './storage-keys';

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

const SECTION_CARD =
  'rounded-2xl border border-slate-200 bg-white/80 shadow-sm shadow-slate-900/5 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-50';
const COMPACT_CARD = 'rounded-2xl border border-slate-100 bg-white/80 shadow-sm dark:border-slate-800 dark:bg-slate-900/60';
const INPUT_BASE =
  'w-full appearance-none rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 transition focus:border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-50';
const HIGHLIGHTS_BASE =
  'min-h-[140px] rounded-2xl border border-slate-200 bg-white/60 px-4 py-3 text-sm leading-relaxed text-slate-900 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-100';
const STATUS_VARIANTS = {
  microphone: {
    connected: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
    disconnected: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
  },
  speaker: {
    connected: 'bg-sky-100 text-sky-600 dark:bg-sky-900/60 dark:text-sky-200',
    disconnected: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
  },
  recording: {
    connected: 'bg-rose-100 text-rose-600 dark:bg-rose-900/60 dark:text-rose-200',
    disconnected: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
  }
};

function sanitizeSilenceSeconds(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return DEFAULT_PREFERENCES.silenceSeconds;
  }
  return Math.min(30, Math.max(1, Number(numeric.toFixed(2))));
}

function SettingsModal({
  open,
  onOpenChange,
  startCapture,
  stopCapture,
  toggleRecording,
  startDisabled,
  stopDisabled,
  recordDisabled,
  recordButtonLabel,
  micDevices,
  micDeviceId,
  handleMicChange,
  micSelectDisabled,
  model,
  handleModelChange,
  modelSelectDisabled,
  preferences,
  handleLanguageChange,
  handlePromptChange,
  handleSilenceChange,
  languageSelectDisabled,
  silenceInputDisabled,
  streamStatus,
  isRecording,
  micStatusLabel,
  speakerStatusLabel,
  recordStatusLabel
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Capture settings</DialogTitle>
          <DialogDescription>
            Start and stop capture sessions, select the desired realtime model, and tune transcription preferences.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-2">
          <section className={`${SECTION_CARD} p-6`}>
            <div>
              <span className="text-[0.6rem] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">
                Capture controls
              </span>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Start microphone and system audio sessions.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <Button variant="default" type="button" onClick={startCapture} disabled={startDisabled}>
                Start capture
              </Button>
              <Button variant="secondary" type="button" onClick={stopCapture} disabled={stopDisabled}>
                Stop capture
              </Button>
              <Button variant="secondary" type="button" onClick={toggleRecording} disabled={recordDisabled}>
                {recordButtonLabel}
              </Button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                Microphone
                <select value={micDeviceId} onChange={handleMicChange} disabled={micSelectDisabled} className={INPUT_BASE}>
                  <option value="">Default microphone</option>
                  {micDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label || `Microphone ${device.deviceId.slice(-4)}`}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
                RT model
                <select value={model} onChange={handleModelChange} disabled={modelSelectDisabled} className={INPUT_BASE}>
                  {MODEL_OPTIONS.map(option => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex flex-wrap gap-3">
              <span
                className={`rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] ${
                  STATUS_VARIANTS.microphone[streamStatus.microphone ? 'connected' : 'disconnected']
                }`}
              >
                {micStatusLabel}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] ${
                  STATUS_VARIANTS.speaker[streamStatus.speaker ? 'connected' : 'disconnected']
                }`}
              >
                {speakerStatusLabel}
              </span>
              <span
                className={`rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] ${
                  STATUS_VARIANTS.recording[isRecording ? 'connected' : 'disconnected']
                }`}
              >
                {recordStatusLabel}
              </span>
            </div>
          </section>
          <section className={`${SECTION_CARD} p-6`}>
            <div className="space-y-1">
              <span className="text-[0.6rem] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">
                Preferences
              </span>
              <p className="text-sm text-slate-600 dark:text-slate-300">Adjust transcription context and VAD timing.</p>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Transcription language</span>
                <select value={preferences.language} onChange={handleLanguageChange} disabled={languageSelectDisabled} className={INPUT_BASE}>
                  {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Context prompt</span>
                <input
                  className={INPUT_BASE}
                  type="text"
                  placeholder="e.g., team names or glossary"
                  value={preferences.prompt}
                  onChange={handlePromptChange}
                />
              </label>
              <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Idle detection (seconds)</span>
                <input
                  className={INPUT_BASE}
                  type="number"
                  min="1"
                  max="30"
                  step="0.5"
                  inputMode="decimal"
                  value={preferences.silenceSeconds}
                  onChange={handleSilenceChange}
                  disabled={silenceInputDisabled}
                />
              </label>
            </div>
          </section>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

function loadPreferencesState() {
  if (typeof window === 'undefined') {
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
    console.warn('Failed to load preferences:', error);
  }

  return { ...DEFAULT_PREFERENCES };
}

function formatTimestamp(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return date.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
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

function AppContent() {
  const {
    notes,
    activeNote,
    activeNoteId,
    setActiveNoteId,
    updateNoteTitle,
    updateNoteHighlights,
    appendTranscriptEntry,
    archiveNote,
    deleteArchivedNotes,
  } = useApp();
  const [preferences, setPreferences] = useState(() => loadPreferencesState());
  const [model, setModel] = useState('gpt-4o-mini-transcribe');
  const [micDeviceId, setMicDeviceId] = useState('');
  const [micDevices, setMicDevices] = useState([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [drafts, setDrafts] = useState({ microphone: null, speaker: null });
  const [streamStatus, setStreamStatus] = useState({ microphone: false, speaker: false });
  const [isRecording, setIsRecording] = useState(false);
  const [themeMode, setThemeMode] = useState(() => loadStoredThemeMode());
  const [systemPrefersDark, setSystemPrefersDark] = useState(() => getSystemPrefersDark());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const titleInputRef = useRef(null);
  const highlightsRef = useRef(null);
  const microphoneSessionRef = useRef(null);
  const systemAudioSessionRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const systemAudioStreamRef = useRef(null);
  const wavRecorderRef = useRef(new WavRecorder());

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(preferences));
  }, [preferences]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tone = resolveThemeTone(themeMode, systemPrefersDark);
    const root = document.documentElement;
    root.dataset.theme = tone;
    root.classList.toggle('dark', tone === 'dark');
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
      appendTranscriptEntry({ source, text });
    },
    [appendTranscriptEntry]
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

  const handleNoteTitleChange = useCallback(
    value => {
      if (!activeNoteId) return;
      updateNoteTitle(activeNoteId, value || 'Untitled note');
    },
    [activeNoteId, updateNoteTitle]
  );

  const handleHighlightsInput = useCallback(() => {
    if (!activeNoteId || !highlightsRef.current) return;
    const html = highlightsRef.current.innerHTML;
    updateNoteHighlights(activeNoteId, html);
  }, [activeNoteId, updateNoteHighlights]);

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
    archiveNote(activeNote.id);
  }, [activeNote, isCapturing, stopCapture, archiveNote]);

  const clearArchivedNotes = useCallback(() => {
    const hasArchived = notes.some(note => note.archived);
    if (!hasArchived) {
      alert('No archived notes to clear.');
      return;
    }
    if (!window.confirm('This will permanently delete all archived notes. Continue?')) {
      return;
    }
    deleteArchivedNotes();
  }, [notes, deleteArchivedNotes]);

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

  const handleOpenSettings = useCallback(() => {
    setSettingsOpen(true);
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

  const handleMicChange = useCallback(event => {
    setMicDeviceId(event.target.value);
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
  const micStatusLabel = streamStatus.microphone ? 'Microphone live' : 'Microphone offline';
  const speakerStatusLabel = streamStatus.speaker ? 'System audio live' : 'System audio offline';
  const recordStatusLabel = isRecording ? 'Backup recording active' : 'Backup recording idle';
  const archiveButtonText = activeNote?.archived ? 'Unarchive note' : 'Archive note';

  const themeIcon = THEME_ICONS[themeMode];
  const themeLabel = THEME_LABELS[themeMode];

  return (
    <>
      <Dashboard
        themeIcon={themeIcon}
        themeLabel={themeLabel}
        onThemeToggle={handleThemeToggle}
        onOpenSettings={handleOpenSettings}
      />
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        startCapture={startCapture}
        stopCapture={stopCapture}
        toggleRecording={toggleRecording}
        startDisabled={startDisabled}
        stopDisabled={stopDisabled}
        recordDisabled={recordDisabled}
        recordButtonLabel={recordButtonLabel}
        micDevices={micDevices}
        micDeviceId={micDeviceId}
        handleMicChange={handleMicChange}
        micSelectDisabled={micSelectDisabled}
        model={model}
        handleModelChange={handleModelChange}
        modelSelectDisabled={modelSelectDisabled}
        preferences={preferences}
        handleLanguageChange={handleLanguageChange}
        handlePromptChange={handlePromptChange}
        handleSilenceChange={handleSilenceChange}
        languageSelectDisabled={languageSelectDisabled}
        silenceInputDisabled={silenceInputDisabled}
        streamStatus={streamStatus}
        isRecording={isRecording}
        micStatusLabel={micStatusLabel}
        speakerStatusLabel={speakerStatusLabel}
        recordStatusLabel={recordStatusLabel}
      />
    </>
  )
  // return (
  //   <SidebarProvider>
  //     <AppSidebar
  //       variant="inset"
  //       filteredNotes={filteredNotes}
  //       searchTerm={searchTerm}
  //       onSearchChange={handleSearchChange}
  //       onCreateNote={createNote}
  //       onSelectNote={setActiveNoteSafely}
  //       activeNote={activeNote}
  //       onClearArchivedNotes={clearArchivedNotes}
  //     />
  //     <SidebarInset>
  //       <SiteHeader
  //         className="border-b pb-4 dark:border-slate-800/70"
  //         themeIcon={themeIcon}
  //         themeLabel={themeLabel}
  //         onThemeToggle={handleThemeToggle}
  //       />
  //       <div className="flex flex-1 flex-col">
  //         <div className="@container/main flex flex-1 flex-col gap-2">
  //           <main className="space-y-4">
  //             <section className={`${SECTION_CARD} p-6`}>
  //               <div className="mt-6 max-w-xl min-w-0 space-y-2">
  //                 <p className="text-[0.65rem] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">
  //                   Realtime capture
  //                 </p>
  //                 <div>
  //                   <h1 className="text-3xl font-semibold leading-tight text-slate-900 dark:text-slate-50">
  //                     Mic + Speaker Streamer
  //                   </h1>
  //                   <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
  //                     Clean, configurable capture tools inspired by Shadcn UI.
  //                   </p>
  //                 </div>
  //               </div>
  //             </section>
  //
  //             <section className={`${SECTION_CARD} p-6`}>
  //               <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
  //                 <div className="space-y-1">
  //                   <p className="text-[0.6rem] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Active note</p>
  //                   <input
  //                     ref={titleInputRef}
  //                     className={`${INPUT_BASE} text-lg font-semibold`}
  //                     type="text"
  //                     value={activeNote?.title || ''}
  //                     onChange={event => handleNoteTitleChange(event.target.value)}
  //                     placeholder="Untitled note"
  //                   />
  //                   <p className="text-xs text-slate-500 dark:text-slate-400">{noteTimestamp}</p>
  //                 </div>
  //                 <div className="flex flex-wrap gap-3">
  //                   <Button variant="outline" type="button" onClick={handleExportMarkdown}>
  //                     Export Markdown
  //                   </Button>
  //                   <Button variant="outline" type="button" onClick={handleExportPdf}>
  //                     Export PDF
  //                   </Button>
  //                 </div>
  //               </div>
  //             </section>
  //
  //             <div className="grid gap-4 lg:grid-cols-2">
  //               <section className={`${SECTION_CARD} p-6`}>
  //                 <div>
  //                   <span className="text-[0.6rem] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Capture controls</span>
  //                   <p className="text-sm text-slate-600 dark:text-slate-300">Start microphone and system audio sessions.</p>
  //                 </div>
  //                 <div className="mt-4 flex flex-wrap gap-3">
  //                   <Button variant="default" type="button" onClick={startCapture} disabled={startDisabled}>
  //                     Start capture
  //                   </Button>
  //                   <Button variant="secondary" type="button" onClick={stopCapture} disabled={stopDisabled}>
  //                     Stop capture
  //                   </Button>
  //                   <Button variant="secondary" type="button" onClick={toggleRecording} disabled={recordDisabled}>
  //                     {recordButtonLabel}
  //                   </Button>
  //                 </div>
  //                 <div className="mt-5 grid gap-3 sm:grid-cols-2">
  //                   <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
  //                     Microphone
  //                     <select value={micDeviceId} onChange={handleMicChange} disabled={micSelectDisabled} className={INPUT_BASE}>
  //                       <option value="">Default microphone</option>
  //                       {micDevices.map(device => (
  //                         <option key={device.deviceId} value={device.deviceId}>
  //                           {device.label || `Microphone ${device.deviceId.slice(-4)}`}
  //                         </option>
  //                       ))}
  //                     </select>
  //                   </label>
  //                   <label className="flex flex-col gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">
  //                     RT model
  //                     <select value={model} onChange={handleModelChange} disabled={modelSelectDisabled} className={INPUT_BASE}>
  //                       {MODEL_OPTIONS.map(option => (
  //                         <option key={option} value={option}>
  //                           {option}
  //                         </option>
  //                       ))}
  //                     </select>
  //                   </label>
  //                 </div>
  //                 <div className="mt-5 flex flex-wrap gap-3">
  //                   <span className={`rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] ${STATUS_VARIANTS.microphone[streamStatus.microphone ? 'connected' : 'disconnected']}`}>
  //                     {micStatusLabel}
  //                   </span>
  //                   <span className={`rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] ${STATUS_VARIANTS.speaker[streamStatus.speaker ? 'connected' : 'disconnected']}`}>
  //                     {speakerStatusLabel}
  //                   </span>
  //                   <span className={`rounded-full px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em] ${STATUS_VARIANTS.recording[isRecording ? 'connected' : 'disconnected']}`}>
  //                     {recordStatusLabel}
  //                   </span>
  //                 </div>
  //               </section>
  //               <section className={`${SECTION_CARD} p-6`}>
  //                 <div className="space-y-1">
  //                   <span className="text-[0.6rem] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Preferences</span>
  //                   <p className="text-sm text-slate-600 dark:text-slate-300">Adjust transcription context and VAD timing.</p>
  //                 </div>
  //                 <div className="mt-4 grid gap-4 sm:grid-cols-2">
  //                   <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
  //                     <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Transcription language</span>
  //                     <select value={preferences.language} onChange={handleLanguageChange} disabled={languageSelectDisabled} className={INPUT_BASE}>
  //                       {Object.entries(LANGUAGE_LABELS).map(([code, label]) => (
  //                         <option key={code} value={code}>
  //                           {label}
  //                         </option>
  //                       ))}
  //                     </select>
  //                   </label>
  //                   <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 sm:col-span-2">
  //                     <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Context prompt</span>
  //                     <input
  //                       className={INPUT_BASE}
  //                       type="text"
  //                       placeholder="e.g., team names or glossary"
  //                       value={preferences.prompt}
  //                       onChange={handlePromptChange}
  //                     />
  //                   </label>
  //                   <label className="flex flex-col gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
  //                     <span className="text-xs uppercase tracking-[0.3em] text-slate-500 dark:text-slate-400">Idle detection (seconds)</span>
  //                     <input
  //                       className={INPUT_BASE}
  //                       type="number"
  //                       min="1"
  //                       max="30"
  //                       step="0.5"
  //                       inputMode="decimal"
  //                       value={preferences.silenceSeconds}
  //                       onChange={handleSilenceChange}
  //                       disabled={silenceInputDisabled}
  //                     />
  //                   </label>
  //                 </div>
  //               </section>
  //             </div>
  //
  //             <section className={`${SECTION_CARD} p-6`}>
  //               <div className="space-y-1">
  //                 <span className="text-[0.6rem] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Live transcript</span>
  //                 <p className="text-sm text-slate-600 dark:text-slate-300">Entries arrive as soon as the Realtime API completes each turn.</p>
  //               </div>
  //               <div className="mt-4 space-y-4 max-h-[360px] overflow-y-auto pr-1">
  //                 {transcriptEntries.length === 0 ? (
  //                   <div className="rounded-2xl border border-slate-100 bg-white/70 p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
  //                     Choose a note and press “Start capture” to begin transcribing.
  //                   </div>
  //                 ) : (
  //                   transcriptEntries.map(entry => (
  //                     <div
  //                       key={entry.id}
  //                       className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm transition dark:border-slate-800 dark:bg-slate-900/60"
  //                       data-source={entry.source}
  //                       data-draft={entry.isDraft ? 'true' : undefined}
  //                     >
  //                       <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em]">
  //                         <span
  //                           className={`rounded-full px-3 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.3em] ${
  //                             STATUS_VARIANTS[entry.source]?.connected ?? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
  //                           }`}
  //                         >
  //                           {entry.source === 'microphone' ? 'Microphone' : 'System audio'}
  //                         </span>
  //                         {entry.statusLabel ? (
  //                           <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{entry.statusLabel}</span>
  //                         ) : null}
  //                         <span className="text-xs text-slate-400 dark:text-slate-500">{formatTimestamp(entry.timestamp)}</span>
  //                       </div>
  //                       <p className="mt-3 text-sm leading-relaxed text-slate-900 dark:text-slate-100">{entry.text || 'Listening…'}</p>
  //                     </div>
  //                   ))
  //                 )}
  //               </div>
  //             </section>
  //
  //             <section className={`${SECTION_CARD} p-6`}>
  //               <div className="space-y-1">
  //                 <span className="text-[0.6rem] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Highlights</span>
  //                 <p className="text-sm text-slate-600 dark:text-slate-300">Capture key insights or corrections for each session.</p>
  //               </div>
  //               <div
  //                 id="noteHighlights"
  //                 ref={highlightsRef}
  //                 className={HIGHLIGHTS_BASE}
  //                 contentEditable
  //                 onInput={handleHighlightsInput}
  //               />
  //             </section>
  //
  //             <section className={`${SECTION_CARD} p-6`}>
  //               <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
  //                 <div>
  //                   <span className="text-[0.6rem] uppercase tracking-[0.4em] text-slate-500 dark:text-slate-400">Housekeeping</span>
  //                   <p className="text-sm text-slate-600 dark:text-slate-300">{noteStatusText}</p>
  //                 </div>
  //                 <Button variant="outline" type="button" onClick={archiveActiveNote} disabled={!activeNote}>
  //                   {archiveButtonText}
  //                 </Button>
  //               </div>
  //             </section>
  //           </main>
  //         </div>
  //       </div>
  //     </SidebarInset>
  //   </SidebarProvider>
  // );
}
