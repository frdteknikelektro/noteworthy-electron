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
import { MIC_DEVICE_STORAGE_KEY } from "./storage-keys";

const AudioContext = createContext(null);

const STREAM_META = {
  microphone: { statusId: "microphone", messageSource: "microphone", errorLabel: "microphone" },
  system_audio: { statusId: "speaker", messageSource: "speaker", errorLabel: "system audio" }
};

function loadStoredMicDevice() {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(MIC_DEVICE_STORAGE_KEY) || "";
  } catch (error) {
    console.warn("Unable to read saved microphone:", error);
  }
  return "";
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

export function AudioProvider({
  children,
  activeNote,
  preferences,
  model,
  onAppendTranscriptEntry
}) {
  const [micDeviceId, setMicDeviceId] = useState(() => loadStoredMicDevice());
  const [micDevices, setMicDevices] = useState([]);
  const [micMuted, setMicMuted] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [drafts, setDrafts] = useState({ microphone: null, speaker: null });
  const [streamStatus, setStreamStatus] = useState({ microphone: false, speaker: false });
  const [isRecording, setIsRecording] = useState(false);
  const [systemAudioEnabled, setSystemAudioEnabled] = useState(true);

  const microphoneSessionRef = useRef(null);
  const systemAudioSessionRef = useRef(null);
  const microphoneStreamRef = useRef(null);
  const systemAudioStreamRef = useRef(null);
  const wavRecorderRef = useRef(new WavRecorder());
  const prevMicDeviceRef = useRef(micDeviceId);
  const prevSystemAudioRef = useRef(systemAudioEnabled);

  const updateStatus = useCallback((statusId, connected) => {
    setStreamStatus(prev => ({ ...prev, [statusId]: connected }));
  }, []);

  const appendFinalTranscript = useCallback(
    (source, text) => {
      if (!onAppendTranscriptEntry) return;
      onAppendTranscriptEntry({ source, text });
    },
    [onAppendTranscriptEntry]
  );

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
        case "conversation.item.input_audio_transcription.completed":
          finalizeDraft(source, message.transcript || "");
          break;
        default:
          break;
      }
    },
    [finalizeDraft]
  );

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
      language: preferences?.language
    };
    const config = {
      input_audio_transcription: {
        model: transcription.model
      },
      turn_detection: {
        type: "server_vad"
      }
    };
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
        await wavRecorderRef.current.startRecording(
          microphoneStreamRef.current,
          systemAudioStreamRef.current
        );
        setIsRecording(true);
        updateStatus("microphone", true);
        updateStatus("speaker", includeSystemAudio);
      } catch (error) {
        console.error("Error starting capture:", error);
        alert(`Error starting capture: ${error.message}`);
        stopCapture();
      }
    },
    [
      applyMicMute,
      buildSessionConfig,
      captureMediaStreams,
      ensureCapturePreconditions,
      micMuted,
      setupRealtimeSessions,
      stopCapture,
      systemAudioEnabled,
      updateStatus
    ]
  );

  useEffect(() => {
    if (isCapturing || micDevices.length === 0) return;
    if (micDeviceId && micDevices.some(device => device.deviceId === micDeviceId)) return;
    const firstDeviceId = micDevices.find(device => device.deviceId)?.deviceId;
    if (firstDeviceId) {
      setMicDeviceId(firstDeviceId);
    }
  }, [isCapturing, micDeviceId, micDevices]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (micDeviceId) {
        window.localStorage.setItem(MIC_DEVICE_STORAGE_KEY, micDeviceId);
      } else {
        window.localStorage.removeItem(MIC_DEVICE_STORAGE_KEY);
      }
    } catch (error) {
      console.warn("Unable to persist microphone selection:", error);
    }
  }, [micDeviceId]);

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

  const handleMicChange = useCallback(valueOrEvent => {
    const rawValue =
      typeof valueOrEvent === "string" ? valueOrEvent : valueOrEvent?.target?.value;
    const nextValue = rawValue || "";
    setMicDeviceId(nextValue);
    if (nextValue) {
      setMicMuted(false);
    }
  }, []);

  const toggleMicMute = useCallback(() => {
    setMicMuted(prev => !prev);
  }, []);

  const toggleSystemAudio = useCallback(() => {
    setSystemAudioEnabled(prev => !prev);
  }, []);

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

  const mediaRecorder = wavRecorderRef.current?.mediaRecorder || null;

  const value = useMemo(
    () => ({
      micDeviceId,
      micDevices,
      micMuted,
      isCapturing,
      drafts,
      streamStatus,
      isRecording,
      mediaRecorder,
      systemAudioEnabled,
      startCapture,
      stopCapture,
      toggleRecording,
      handleMicChange,
      toggleMicMute,
      toggleSystemAudio
    }),
    [
      micDeviceId,
      micDevices,
      micMuted,
      isCapturing,
      drafts,
      streamStatus,
      isRecording,
      mediaRecorder,
      systemAudioEnabled,
      startCapture,
      stopCapture,
      toggleRecording,
      handleMicChange,
      toggleMicMute,
      toggleSystemAudio
    ]
  );

  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>;
}

export function useAudio() {
  const value = useContext(AudioContext);
  if (!value) {
    throw new Error("useAudio must be used within AudioProvider");
  }
  return value;
}
