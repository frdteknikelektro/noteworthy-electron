// Session class for OpenAI Realtime API
class Session {
  constructor(apiKey, streamType) {
    this.apiKey = apiKey;
    this.streamType = streamType;
    this.useSessionToken = true;
    this.ms = null;
    this.pc = null;
    this.dc = null;
  }

  async startTranscription(stream, sessionConfig) {
    await this.startInternal(stream, sessionConfig, '/v1/realtime/transcription_sessions');
  }

  stop() {
    this.dc?.close();
    this.dc = null;
    this.pc?.close();
    this.pc = null;
    this.ms?.getTracks().forEach(track => track.stop());
    this.ms = null;
  }

  async startInternal(stream, sessionConfig, tokenEndpoint) {
    this.ms = stream;
    this.pc = new RTCPeerConnection();
    this.pc.ontrack = event => this.ontrack?.(event);
    this.pc.addTrack(stream.getTracks()[0]);
    this.pc.onconnectionstatechange = () => this.onconnectionstatechange?.(this.pc.connectionState);
    this.dc = this.pc.createDataChannel('');
    this.dc.onopen = () => this.onopen?.();
    this.dc.onmessage = event => this.onmessage?.(JSON.parse(event.data));

    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    try {
      const answer = await this.signal(offer, sessionConfig, tokenEndpoint);
      await this.pc.setRemoteDescription(answer);
    } catch (error) {
      this.onerror?.(error);
    }
  }

  async signal(offer, sessionConfig, tokenEndpoint) {
    const urlRoot = 'https://api.openai.com';
    const realtimeUrl = `${urlRoot}/v1/realtime`;
    let sdpResponse;

    if (this.useSessionToken) {
      const sessionUrl = `${urlRoot}${tokenEndpoint}`;
      const sessionResponse = await fetch(sessionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'openai-beta': 'realtime-v1',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(sessionConfig)
      });

      if (!sessionResponse.ok) {
        throw new Error('Failed to request session token');
      }

      const sessionData = await sessionResponse.json();
      const clientSecret = sessionData.client_secret.value;

      sdpResponse = await fetch(realtimeUrl, {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${clientSecret}`,
          'Content-Type': 'application/sdp'
        }
      });

      if (!sdpResponse.ok) {
        throw new Error('Failed to signal');
      }
    } else {
      const formData = new FormData();
      formData.append('session', JSON.stringify(sessionConfig));
      formData.append('sdp', offer.sdp);

      sdpResponse = await fetch(realtimeUrl, {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${this.apiKey}` }
      });

      if (!sdpResponse.ok) {
        throw new Error('Failed to signal');
      }
    }

    return { type: 'answer', sdp: await sdpResponse.text() };
  }

  sendMessage(message) {
    this.dc?.send(JSON.stringify(message));
  }
}

// WAV recorder for optional backup
class WavRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.isRecording = false;
    this.combinedStream = null;
  }

  async startRecording(microphoneStream, systemAudioStream) {
    if (this.isRecording) return;
    if (!microphoneStream || !systemAudioStream) {
      throw new Error('Start capture before recording backup audio.');
    }

    const audioContext = new AudioContext();
    const micSource = audioContext.createMediaStreamSource(microphoneStream);
    const systemSource = audioContext.createMediaStreamSource(systemAudioStream);
    const merger = audioContext.createChannelMerger(2);
    micSource.connect(merger, 0, 0);
    systemSource.connect(merger, 0, 1);
    const destination = audioContext.createMediaStreamDestination();
    merger.connect(destination);

    this.combinedStream = destination.stream;
    this.mediaRecorder = new MediaRecorder(this.combinedStream, { mimeType: 'audio/webm;codecs=opus' });
    this.audioChunks = [];
    this.isRecording = true;

    this.mediaRecorder.ondataavailable = event => {
      if (event.data.size > 0) {
        this.audioChunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => this.saveRecording();
    this.mediaRecorder.start(1000);
  }

  stopRecording() {
    if (!this.isRecording || !this.mediaRecorder) return;
    this.mediaRecorder.stop();
    this.isRecording = false;
  }

  async saveRecording() {
    if (this.audioChunks.length === 0) return;

    try {
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const wavBlob = this.audioBufferToWav(audioBuffer);
      const url = URL.createObjectURL(wavBlob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `noteworthy-recording-${new Date().toISOString().replace(/[:.]/g, '-')}.wav`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error saving WAV recording:', error);
    }
  }

  audioBufferToWav(buffer) {
    const length = buffer.length;
    const channels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const arrayBuffer = new ArrayBuffer(44 + length * channels * 2);
    const view = new DataView(arrayBuffer);

    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * channels * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * 2, true);
    view.setUint16(32, channels * 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * channels * 2, true);

    let offset = 44;
    for (let i = 0; i < length; i++) {
      for (let channel = 0; channel < channels; channel++) {
        const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
        view.setInt16(offset, sample * 0x7fff, true);
        offset += 2;
      }
    }

    return new Blob([arrayBuffer], { type: 'audio/wav' });
  }
}

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

const STREAM_META = {
  microphone: { statusId: 'microphone', messageSource: 'microphone', errorLabel: 'microphone' },
  system_audio: { statusId: 'speaker', messageSource: 'speaker', errorLabel: 'system audio' }
};

const state = {
  notes: [],
  activeNoteId: null,
  isCapturing: false,
  drafts: {
    microphone: null,
    speaker: null
  },
  preferences: { ...DEFAULT_PREFERENCES }
};

let microphoneSession = null;
let systemAudioSession = null;
let microphoneStream = null;
let systemAudioStream = null;
const wavRecorder = new WavRecorder();

const domElements = {
  micStatus: document.getElementById('micStatus'),
  speakerStatus: document.getElementById('speakerStatus'),
  recordStatus: document.getElementById('recordStatus'),
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  recordBtn: document.getElementById('recordBtn'),
  modelSelect: document.getElementById('modelSelect'),
  micSelect: document.getElementById('micSelect'),
  transcriptStream: document.getElementById('transcriptStream'),
  noteHighlights: document.getElementById('noteHighlights'),
  noteList: document.getElementById('noteList'),
  createNoteBtn: document.getElementById('createNoteBtn'),
  noteSearch: document.getElementById('noteSearch'),
  clearAllNotesBtn: document.getElementById('clearAllNotesBtn'),
  noteTitleInput: document.getElementById('noteTitle'),
  noteTimestamp: document.getElementById('noteTimestamp'),
  noteStatusCopy: document.getElementById('noteStatusCopy'),
  archiveNoteBtn: document.getElementById('archiveNoteBtn'),
  exportMarkdownBtn: document.getElementById('exportMarkdownBtn'),
  exportPdfBtn: document.getElementById('exportPdfBtn'),
  languageSelect: document.getElementById('languageSelect'),
  promptInput: document.getElementById('promptInput'),
  silenceInput: document.getElementById('silenceInput')
};

const {
  micStatus,
  speakerStatus,
  recordStatus,
  startBtn,
  stopBtn,
  recordBtn,
  modelSelect,
  micSelect,
  transcriptStream,
  noteHighlights,
  noteList,
  createNoteBtn,
  noteSearch,
  clearAllNotesBtn,
  noteTitleInput,
  noteTimestamp,
  noteStatusCopy,
  archiveNoteBtn,
  exportMarkdownBtn,
  exportPdfBtn,
  languageSelect,
  promptInput,
  silenceInput
} = domElements;

function generateId(prefix = 'entry') {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function persistNotes() {
  localStorage.setItem(STORAGE_KEYS.notes, JSON.stringify(state.notes));
  if (state.activeNoteId) {
    localStorage.setItem(STORAGE_KEYS.activeNote, state.activeNoteId);
  }
}

function loadNotes() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.notes);
    state.notes = stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.warn('Failed to load saved notes; starting fresh.', error);
    state.notes = [];
  }

  state.notes = state.notes.map(note => ({
    transcript: [],
    highlightsHtml: '',
    archived: false,
    ...note,
    transcript: note.transcript || [],
    highlightsHtml: note.highlightsHtml || '',
    archived: Boolean(note.archived)
  }));

  const storedActive = localStorage.getItem(STORAGE_KEYS.activeNote);
  if (storedActive && state.notes.some(note => note.id === storedActive)) {
    state.activeNoteId = storedActive;
  }
}

function loadPreferences() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.settings);
    if (stored) {
      const parsed = JSON.parse(stored);
      state.preferences = {
        ...DEFAULT_PREFERENCES,
        ...parsed,
        silenceSeconds: sanitizeSilenceSeconds(parsed?.silenceSeconds ?? DEFAULT_PREFERENCES.silenceSeconds)
      };
      return;
    }
  } catch (error) {
    console.warn('Failed to load preferences; using defaults.', error);
  }
  state.preferences = { ...DEFAULT_PREFERENCES };
}

function persistPreferences() {
  localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.preferences));
}

function getActiveNote() {
  return state.notes.find(note => note.id === state.activeNoteId) || null;
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

function renderNoteList() {
  noteList.innerHTML = '';
  const term = noteSearch.value.trim().toLowerCase();

  const filtered = state.notes
    .slice()
    .sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt))
    .filter(note => {
      if (!term) return true;
      const haystack = [note.title || '', note.highlightsHtml || '', ...(note.transcript || []).map(entry => entry.text || '')]
        .join(' ')
        .toLowerCase();
      return haystack.includes(term);
    });

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'note-item';
    empty.textContent = term ? 'No notes match that search.' : 'No notes yet — create a live note to get started.';
    noteList.appendChild(empty);
    return;
  }

  filtered.forEach(note => {
    const item = document.createElement('button');
    item.type = 'button';
    item.className = `note-item${note.id === state.activeNoteId ? ' active' : ''}`;
    item.dataset.noteId = note.id;

    const title = document.createElement('div');
    title.className = 'note-item-title';
    title.textContent = note.title || 'Untitled note';

    const meta = document.createElement('div');
    meta.className = 'note-item-meta';
    const updated = note.updatedAt || note.createdAt;
    meta.textContent = `${note.archived ? 'Archived' : 'Active'} • ${relativeLabel(updated)}`;

    item.appendChild(title);
    item.appendChild(meta);

    item.addEventListener('click', () => setActiveNote(note.id));
    noteList.appendChild(item);
  });
}

function ensureCapturePreconditions(note) {
  if (!note) {
    alert('Create or select a note before starting capture.');
    return false;
  }

  if (note.archived) {
    alert('Unarchive the note before resuming capture.');
    return false;
  }

  if (!window.electronAPI?.apiKey) {
    alert('Missing OpenAI API key. Add it to your .env file as OPENAI_KEY.');
    return false;
  }

  return true;
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

async function captureMediaStreams() {
  const microphone = await navigator.mediaDevices.getUserMedia({
    audio: micSelect.value ? { deviceId: { exact: micSelect.value } } : true,
    video: false
  });

  await window.electronAPI.enableLoopbackAudio();
  let displayStream;
  try {
    displayStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: true });
  } finally {
    await window.electronAPI.disableLoopbackAudio();
  }

  stripVideoTracks(displayStream);
  return { microphone, systemAudio: displayStream };
}

function buildSessionConfig() {
  const transcription = {
    model: modelSelect.value,
    prompt: state.preferences.prompt?.trim(),
    language: state.preferences.language || 'id'
  };

  const config = {
    input_audio_transcription: {
      model: transcription.model
    },
    turn_detection: {
      type: 'server_vad',
      silence_duration_ms: Math.round(state.preferences.silenceSeconds * 1000)
    }
  };

  if (transcription.prompt) {
    config.input_audio_transcription.prompt = transcription.prompt;
  }

  if (transcription.language) {
    config.input_audio_transcription.language = transcription.language;
  }

  return config;
}

function createRealtimeSession(type) {
  const meta = STREAM_META[type];
  const session = new Session(window.electronAPI.apiKey, type);
  session.onconnectionstatechange = stateValue => updateStatus(meta.statusId, stateValue === 'connected');
  session.onmessage = parsed => handleStreamMessage(meta.messageSource, parsed);
  session.onerror = error => handleCaptureError(error, meta.errorLabel);
  return session;
}

async function setupRealtimeSessions(sessionConfig) {
  microphoneSession = createRealtimeSession('microphone');
  systemAudioSession = createRealtimeSession('system_audio');

  await Promise.all([
    microphoneSession.startTranscription(microphoneStream, sessionConfig),
    systemAudioSession.startTranscription(systemAudioStream, sessionConfig)
  ]);
}

function ensurePlaceholder() {
  if (transcriptStream.children.length === 0) {
    const placeholder = document.createElement('div');
    placeholder.className = 'transcript-entry';
    placeholder.dataset.placeholder = 'true';
    placeholder.innerHTML = `
      <div class="entry-header"><span class="pill">Waiting for capture…</span></div>
      <div class="entry-text">Choose a note and press “Start capture” to begin transcribing.</div>
    `;
    transcriptStream.appendChild(placeholder);
  }
}

function createTranscriptElement(entry, options = {}) {
  const { isDraft = false, statusLabel } = options;
  const wrapper = document.createElement('div');
  wrapper.className = 'transcript-entry';
  wrapper.dataset.entryId = entry.id;
  wrapper.dataset.source = entry.source;
  if (isDraft) {
    wrapper.dataset.draft = 'true';
  }

  const header = document.createElement('div');
  header.className = 'entry-header';

  const sourcePill = document.createElement('span');
  sourcePill.className = `pill ${entry.source === 'microphone' ? 'microphone' : 'speaker'}`;
  sourcePill.textContent = entry.source === 'microphone' ? 'Microphone' : 'System audio';
  header.appendChild(sourcePill);

  const statusSpan = document.createElement('span');
  statusSpan.className = 'entry-status';
  if (statusLabel) {
    statusSpan.textContent = statusLabel;
  } else {
    statusSpan.style.display = 'none';
  }
  header.appendChild(statusSpan);

  const timeSpan = document.createElement('span');
  timeSpan.className = 'entry-timestamp';
  timeSpan.textContent = formatTimestamp(entry.timestamp);
  header.appendChild(timeSpan);

  const body = document.createElement('div');
  body.className = 'entry-text';
  body.textContent = entry.text;

  wrapper.appendChild(header);
  wrapper.appendChild(body);
  return wrapper;
}

function renderTranscript(note) {
  transcriptStream.innerHTML = '';
  if (!note || !note.transcript || note.transcript.length === 0) {
    ensurePlaceholder();
    return;
  }

  note.transcript.forEach(entry => {
    transcriptStream.appendChild(createTranscriptElement(entry));
  });
  transcriptStream.scrollTop = transcriptStream.scrollHeight;
}

function renderActiveNote() {
  const note = getActiveNote();
  noteTitleInput.value = note ? note.title : '';
  noteHighlights.innerHTML = note ? note.highlightsHtml || '' : '';

  if (note) {
    const created = formatTimestamp(note.createdAt);
    const updated = note.updatedAt && note.updatedAt !== note.createdAt ? ` · Updated ${formatTimestamp(note.updatedAt)}` : '';
    noteTimestamp.textContent = `Created ${created}${updated}`;
    archiveNoteBtn.textContent = note.archived ? 'Unarchive note' : 'Archive note';
    archiveNoteBtn.disabled = false;
  } else {
    noteTimestamp.textContent = 'No note selected';
    archiveNoteBtn.textContent = 'Archive note';
    archiveNoteBtn.disabled = true;
  }

  renderTranscript(note);
  updateNoteStatus();
  syncControlAvailability();
}

function updateNoteStatus() {
  const note = getActiveNote();
  if (!note) {
    noteStatusCopy.textContent = 'Create or select a note to begin.';
    return;
  }

  if (note.archived) {
    noteStatusCopy.textContent = 'Archived note — unarchive to resume capture.';
    return;
  }

  if (state.isCapturing) {
    const languageLabel = LANGUAGE_LABELS[state.preferences.language] || state.preferences.language.toUpperCase();
    noteStatusCopy.textContent = `Capturing audio (${languageLabel}, idle ≥ ${state.preferences.silenceSeconds}s).`;
  } else {
    const languageLabel = LANGUAGE_LABELS[state.preferences.language] || state.preferences.language.toUpperCase();
    noteStatusCopy.textContent = `Ready — press “Start capture” to transcribe in ${languageLabel}.`;
  }
}

function syncControlAvailability() {
  const note = getActiveNote();
  const canCapture = Boolean(note && !note.archived);
  startBtn.disabled = state.isCapturing || !canCapture;
  stopBtn.disabled = !state.isCapturing;
  recordBtn.disabled = !state.isCapturing;
  micSelect.disabled = state.isCapturing;
  modelSelect.disabled = state.isCapturing;
  languageSelect.disabled = state.isCapturing;
  silenceInput.disabled = state.isCapturing;
  promptInput.disabled = false;
}

function appendFinalTranscript(source, text) {
  const note = getActiveNote();
  if (!note) return;

  note.transcript = note.transcript || [];
  const entry = {
    id: generateId('entry'),
    source,
    text,
    timestamp: new Date().toISOString()
  };
  note.transcript.push(entry);
  note.updatedAt = new Date().toISOString();
  persistNotes();
  renderTranscript(note);
  renderNoteList();
  updateNoteStatus();
}

function beginDraft(source, initialText, statusLabel) {
  const note = getActiveNote();
  if (!note) return;

  const placeholder = transcriptStream.querySelector('[data-placeholder="true"]');
  if (placeholder) {
    placeholder.remove();
  }

  const draftEntry = {
    id: generateId('draft'),
    source,
    text: initialText,
    timestamp: new Date().toISOString()
  };

  const element = createTranscriptElement(draftEntry, { isDraft: true, statusLabel });
  transcriptStream.appendChild(element);
  transcriptStream.scrollTop = transcriptStream.scrollHeight;

  state.drafts[source] = {
    id: draftEntry.id,
    element
  };
}

function updateDraft(source, text, statusLabel) {
  const draft = state.drafts[source];
  if (!draft) return;

  const body = draft.element.querySelector('.entry-text');
  if (body) {
    body.textContent = text;
  }

  const statusSpan = draft.element.querySelector('.entry-status');
  if (statusSpan) {
    if (statusLabel) {
      statusSpan.style.display = '';
      statusSpan.textContent = statusLabel;
    } else {
      statusSpan.style.display = 'none';
      statusSpan.textContent = '';
    }
  }

  const timestampSpan = draft.element.querySelector('.entry-timestamp');
  if (timestampSpan) {
    timestampSpan.textContent = formatTimestamp(new Date().toISOString());
  }
}

function finalizeDraft(source, text) {
  const draft = state.drafts[source];
  if (draft) {
    draft.element.remove();
    state.drafts[source] = null;
  }
  appendFinalTranscript(source, text);
}

function handleStreamMessage(source, message) {
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
      finalizeDraft(source, message.transcript);
      break;
    default:
      break;
  }
}

function updateStatus(streamType, isConnected) {
  const element = streamType === 'microphone' ? micStatus : speakerStatus;
  const label = streamType === 'microphone' ? 'Microphone' : 'System audio';
  element.className = `pill ${streamType === 'microphone' ? 'microphone' : 'speaker'} ${isConnected ? 'connected' : 'disconnected'}`;
  element.textContent = isConnected ? `${label} live` : `${label} offline`;
}

function updateRecordStatus(isRecording) {
  recordStatus.className = `pill recording ${isRecording ? 'connected' : 'disconnected'}`;
  recordStatus.textContent = isRecording ? 'Backup recording active' : 'Backup recording idle';
  recordBtn.textContent = isRecording ? 'Stop backup recording' : 'Start backup recording';
}

async function start() {
  const note = getActiveNote();
  if (!ensureCapturePreconditions(note)) {
    return;
  }

  state.isCapturing = true;
  syncControlAvailability();
  updateNoteStatus();

  try {
    const streams = await captureMediaStreams();
    microphoneStream = streams.microphone;
    systemAudioStream = streams.systemAudio;

    const sessionConfig = buildSessionConfig();
    await setupRealtimeSessions(sessionConfig);

    updateStatus('microphone', true);
    updateStatus('speaker', true);
    updateNoteStatus();
    syncControlAvailability();
  } catch (error) {
    console.error('Error starting capture:', error);
    alert(`Error starting capture: ${error.message}`);
    stop();
  }
}

function handleCaptureError(error, streamType) {
  console.error(`${streamType} session error:`, error);
  alert(`Error (${streamType}): ${error.message}`);
  stop();
}

function stop() {
  if (!state.isCapturing && !microphoneSession && !systemAudioSession) {
    syncControlAvailability();
    updateNoteStatus();
    return;
  }

  state.isCapturing = false;

  microphoneSession?.stop();
  systemAudioSession?.stop();
  microphoneSession = null;
  systemAudioSession = null;

  microphoneStream?.getTracks().forEach(track => track.stop());
  systemAudioStream?.getTracks().forEach(track => track.stop());
  microphoneStream = null;
  systemAudioStream = null;

  state.drafts.microphone = null;
  state.drafts.speaker = null;

  updateStatus('microphone', false);
  updateStatus('speaker', false);

  if (wavRecorder.isRecording) {
    wavRecorder.stopRecording();
  }
  updateRecordStatus(false);

  syncControlAvailability();
  updateNoteStatus();
  ensurePlaceholder();
}

async function toggleRecording() {
  try {
    if (!wavRecorder.isRecording) {
      await wavRecorder.startRecording(microphoneStream, systemAudioStream);
      updateRecordStatus(true);
    } else {
      wavRecorder.stopRecording();
      updateRecordStatus(false);
    }
  } catch (error) {
    console.error('Error controlling recording:', error);
    alert(error.message);
  }
}

function createNote() {
  const now = new Date().toISOString();
  const note = {
    id: generateId('note'),
    title: `Live note — ${new Date().toLocaleDateString()}`,
    createdAt: now,
    updatedAt: now,
    highlightsHtml: '',
    transcript: [],
    archived: false
  };
  state.notes.push(note);
  state.activeNoteId = note.id;
  persistNotes();
  renderNoteList();
  renderActiveNote();
  noteTitleInput.focus();
}

function setActiveNote(noteId) {
  if (state.isCapturing && state.activeNoteId !== noteId) {
    const proceed = confirm('Switching notes will stop the current capture. Continue?');
    if (!proceed) {
      return;
    }
    stop();
  }
  state.activeNoteId = noteId;
  persistNotes();
  renderNoteList();
  renderActiveNote();
}

function archiveActiveNote() {
  const note = getActiveNote();
  if (!note) return;

  if (state.isCapturing) {
    stop();
  }

  note.archived = !note.archived;
  note.updatedAt = new Date().toISOString();
  persistNotes();
  renderNoteList();
  renderActiveNote();
}

function clearArchivedNotes() {
  const hasArchived = state.notes.some(note => note.archived);
  if (!hasArchived) {
    alert('No archived notes to clear.');
    return;
  }
  const confirmClear = confirm('This will permanently delete all archived notes. Continue?');
  if (!confirmClear) {
    return;
  }

  state.notes = state.notes.filter(note => !note.archived);
  if (!state.notes.some(note => note.id === state.activeNoteId)) {
    state.activeNoteId = state.notes[0]?.id || null;
  }
  persistNotes();
  renderNoteList();
  renderActiveNote();
}

function updateNoteTitle(value) {
  const note = getActiveNote();
  if (!note) return;
  note.title = value || 'Untitled note';
  note.updatedAt = new Date().toISOString();
  persistNotes();
  renderNoteList();
}

function updateHighlights() {
  const note = getActiveNote();
  if (!note) return;
  note.highlightsHtml = noteHighlights.innerHTML;
  note.updatedAt = new Date().toISOString();
  persistNotes();
  renderNoteList();
}

function sanitizeSilenceSeconds(value) {
  const numeric = Number(value);
  if (Number.isNaN(numeric)) {
    return DEFAULT_PREFERENCES.silenceSeconds;
  }
  return Math.min(30, Math.max(1, Number(numeric.toFixed(2))));
}

function renderPreferences() {
  languageSelect.value = state.preferences.language;
  promptInput.value = state.preferences.prompt;
  silenceInput.value = state.preferences.silenceSeconds;
}

function attachPreferenceListeners() {
  languageSelect.addEventListener('change', event => {
    state.preferences.language = event.target.value || DEFAULT_PREFERENCES.language;
    persistPreferences();
    updateNoteStatus();
  });

  promptInput.addEventListener('input', event => {
    state.preferences.prompt = event.target.value;
    persistPreferences();
  });

  silenceInput.addEventListener('change', event => {
    const sanitized = sanitizeSilenceSeconds(event.target.value);
    state.preferences.silenceSeconds = sanitized;
    silenceInput.value = sanitized;
    persistPreferences();
    updateNoteStatus();
  });

  silenceInput.addEventListener('input', event => {
    const sanitized = sanitizeSilenceSeconds(event.target.value);
    event.target.value = sanitized;
  });
}

function exportActiveNoteAsMarkdown() {
  const note = getActiveNote();
  if (!note) {
    alert('Select a note to export.');
    return;
  }

  const lines = [];
  lines.push(`# ${note.title || 'Untitled note'}`);
  lines.push('');
  lines.push(`Created: ${formatTimestamp(note.createdAt)}`);
  if (note.updatedAt && note.updatedAt !== note.createdAt) {
    lines.push(`Updated: ${formatTimestamp(note.updatedAt)}`);
  }
  lines.push('');
  lines.push('## Transcript');
  lines.push('');
  const transcriptEntries = note.transcript || [];

  if (transcriptEntries.length === 0) {
    lines.push('_No transcript captured yet._');
  } else {
    transcriptEntries.forEach(entry => {
      const sourceLabel = entry.source === 'microphone' ? 'Microphone' : 'System audio';
      lines.push(`- **${sourceLabel} (${formatTimestamp(entry.timestamp)}):** ${entry.text}`);
    });
  }

  if (note.highlightsHtml) {
    lines.push('');
    lines.push('## Highlights');
    lines.push('');
    const temp = document.createElement('div');
    temp.innerHTML = note.highlightsHtml;
    const textContent = temp.innerText.trim();
    lines.push(textContent || '_No highlights yet._');
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${(note.title || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${note.id}.md`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function exportActiveNoteAsPdf() {
  const note = getActiveNote();
  if (!note) {
    alert('Select a note to export.');
    return;
  }

  const printWindow = window.open('', '_blank', 'width=900,height=800');
  if (!printWindow) {
    alert('Unable to open print preview. Disable pop-up blockers and try again.');
    return;
  }

  const transcriptEntries = note.transcript || [];

  const transcriptHtml = transcriptEntries.map(entry => (
    `<div style="margin-bottom:12px;">
      <div style="font-size:12px;color:#555;">
        <strong>${entry.source === 'microphone' ? 'Microphone' : 'System audio'}</strong>
        · ${formatTimestamp(entry.timestamp)}
      </div>
      <div style="font-size:14px;line-height:1.5;">${entry.text}</div>
    </div>`
  )).join('') || '<em>No transcript captured yet.</em>';

  const highlights = note.highlightsHtml ? `<h2>Highlights</h2><div>${note.highlightsHtml}</div>` : '';

  printWindow.document.write(`
    <html>
      <head>
        <title>${note.title}</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 32px; color: #111; }
          h1 { margin-bottom: 4px; }
          h2 { margin-top: 32px; }
        </style>
      </head>
      <body>
        <h1>${note.title || 'Untitled note'}</h1>
        <p>Created: ${formatTimestamp(note.createdAt)}${note.updatedAt ? `<br/>Updated: ${formatTimestamp(note.updatedAt)}` : ''}</p>
        <h2>Transcript</h2>
        ${transcriptHtml}
        ${highlights}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

function updateMicSelect() {
  navigator.mediaDevices.enumerateDevices()
    .then(devices => {
      micSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Default microphone';
      micSelect.appendChild(placeholder);

      devices.forEach(device => {
        if (device.kind === 'audioinput') {
          const option = document.createElement('option');
          option.value = device.deviceId;
          option.textContent = device.label || `Microphone ${micSelect.length}`;
          micSelect.appendChild(option);
        }
      });
    })
    .catch(error => console.warn('Unable to enumerate microphones', error));
}

function initialize() {
  loadPreferences();
  loadNotes();

  if (state.notes.length === 0) {
    createNote();
  } else {
    if (!state.activeNoteId) {
      state.activeNoteId = state.notes[0].id;
    }
    renderNoteList();
    renderActiveNote();
  }

  createNoteBtn.addEventListener('click', createNote);
  noteSearch.addEventListener('input', renderNoteList);
  clearAllNotesBtn.addEventListener('click', clearArchivedNotes);
  startBtn.addEventListener('click', start);
  stopBtn.addEventListener('click', stop);
  recordBtn.addEventListener('click', toggleRecording);
  archiveNoteBtn.addEventListener('click', archiveActiveNote);
  exportMarkdownBtn.addEventListener('click', exportActiveNoteAsMarkdown);
  exportPdfBtn.addEventListener('click', exportActiveNoteAsPdf);

  noteTitleInput.addEventListener('input', event => updateNoteTitle(event.target.value));
  noteHighlights.addEventListener('input', updateHighlights);

  window.addEventListener('beforeunload', () => {
    if (state.isCapturing) {
      stop();
    }
  });

  updateMicSelect();
  ensurePlaceholder();
  renderPreferences();
  attachPreferenceListeners();
}

document.addEventListener('DOMContentLoaded', initialize);
