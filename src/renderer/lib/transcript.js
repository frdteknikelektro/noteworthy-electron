import { API_TEMPERATURE } from "@/renderer/settings/constants";

export function buildTranscriptSnippet(note, drafts = {}) {
  if (!note) return "";
  const initialContextText =
    typeof note.initialContext === "string" ? note.initialContext.trim() : "";
  const contextLine = initialContextText || "-";
  const hasInitialTranscript = (note.transcript || []).some(entry => entry.source === "initial");
  const entries = [
    ...(note.transcript || []),
    ...Object.values(drafts || {}).filter(Boolean)
  ];
  const textParts = entries
    .map(entry => entry.text?.trim())
    .filter(Boolean);
  const snippetParts = hasInitialTranscript ? textParts : [contextLine, ...textParts];
  return snippetParts.join("\n");
}

const DEFAULT_CHUNK_SECONDS = 30;
const DEFAULT_OVERLAP_SECONDS = 1;
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe-diarize";
const DEFAULT_TRANSCRIPTION_RESPONSE_FORMAT = "json";
export const AUDIO_UPLOAD_CHUNK_THRESHOLD_BYTES = 25 * 1024 * 1024;
const TRANSCRIPTION_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i += 1) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

function sliceAudioBuffer(sourceBuffer, startFrame, endFrame) {
  const AudioBufferCtor = globalThis?.AudioBuffer;
  if (!AudioBufferCtor) {
    throw new Error("AudioBuffer is not available in this environment.");
  }
  const length = Math.max(0, endFrame - startFrame);
  const sliced = new AudioBufferCtor({
    length,
    numberOfChannels: sourceBuffer.numberOfChannels,
    sampleRate: sourceBuffer.sampleRate
  });
  for (let channel = 0; channel < sourceBuffer.numberOfChannels; channel += 1) {
    const sourceData = sourceBuffer.getChannelData(channel);
    sliced.copyToChannel(sourceData.subarray(startFrame, endFrame), channel, 0);
  }
  return sliced;
}

function audioBufferToWavBlob(buffer) {
  const length = buffer.length;
  const channels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(arrayBuffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < length; i += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      view.setInt16(offset, sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function buildChunkTextFromSegments(chunk, dropSeconds) {
  const segmentTexts = Array.isArray(chunk.segments) ? chunk.segments : [];
  const parts = segmentTexts
    .map(segment => trimSegmentText(segment, dropSeconds))
    .filter(Boolean);
  return parts.join(" ").trim();
}

async function fetchTranscriptionChunk(blob, { apiKey, model, temperature, language, responseFormat, fileName, stream = false, onStreamEvent } = {}) {
  const resolvedModel = model || DEFAULT_TRANSCRIPTION_MODEL;
  const finalResponseFormat =
    responseFormat ||
    (resolvedModel.includes("diarize") ? "diarized_json" : DEFAULT_TRANSCRIPTION_RESPONSE_FORMAT);
  const formData = new FormData();
  formData.append("model", resolvedModel);
  const chunkFileName = fileName || blob?.name || "chunk.wav";
  formData.append("file", blob, chunkFileName);
  formData.append("response_format", finalResponseFormat);
  if (language) {
    formData.append("language", language);
  }
  const resolvedTemperature = typeof temperature === "number" ? temperature : API_TEMPERATURE;
  formData.append("temperature", resolvedTemperature.toString());
  if (resolvedModel.includes("diarize")) {
    formData.append("chunking_strategy", "auto");
  }
  if (stream) {
    formData.append("stream", "true");
  }

  const response = await fetch(TRANSCRIPTION_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Transcription chunk failed (${response.status}): ${bodyText || response.statusText}`);
  }

  if (stream) {
    return parseTranscriptionStream(response, onStreamEvent);
  }

  return response.json();
}

async function parseTranscriptionStream(response, onStreamEvent) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming transcription response body is unavailable.");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let finalEvent = null;

  const findNextSeparator = () => {
    const newlineIndex = buffer.indexOf("\n\n");
    const crlfIndex = buffer.indexOf("\r\n\r\n");
    if (newlineIndex === -1 && crlfIndex === -1) {
      return null;
    }
    if (newlineIndex === -1) {
      return { index: crlfIndex, length: 4 };
    }
    if (crlfIndex === -1) {
      return { index: newlineIndex, length: 2 };
    }
    return newlineIndex <= crlfIndex
      ? { index: newlineIndex, length: 2 }
      : { index: crlfIndex, length: 4 };
  };

  const emitEvent = payload => {
    if (!payload) return;
    onStreamEvent?.(payload);
    if (payload.type === "transcript.text.done") {
      finalEvent = payload;
    }
  };

  const processChunk = chunk => {
    if (!chunk.trim()) return;
    const lines = chunk.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim()) continue;
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        emitEvent(JSON.parse(payload));
      } catch (error) {
        console.warn("Unable to parse streaming transcription payload:", error);
      }
    }
  };

  let done = false;
  while (!done) {
    const { value, done: readerDone } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true });
    }
    let boundary = findNextSeparator();
    while (boundary) {
      const chunk = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.length);
      processChunk(chunk);
      boundary = findNextSeparator();
    }
    done = readerDone;
  }

  if (buffer.trim()) {
    processChunk(buffer.trim());
  }

  return finalEvent;
}

function trimSegmentText(segment, dropSeconds) {
  if (!segment?.text) return "";
  const start = typeof segment.start === "number" ? segment.start : 0;
  const end = typeof segment.end === "number" ? segment.end : start;
  if (dropSeconds <= 0 || start >= end) {
    return segment.text.trim();
  }
  if (end <= dropSeconds) {
    return "";
  }
  const ratio = Math.min(1, Math.max(0, (dropSeconds - start) / Math.max(end - start, 1e-3)));
  const removeCount = Math.min(segment.text.length, Math.max(0, Math.round(segment.text.length * ratio)));
  return segment.text.slice(removeCount).trim();
}

function formatSegmentMessage(segment) {
  if (!segment?.text) return null;
  const text = segment.text.trim();
  if (!text) return null;
  const speaker = segment.speaker ? String(segment.speaker).trim() : "";
  return speaker ? `${speaker}: ${text}` : text;
}

export function buildSegmentMessages(segments) {
  if (!Array.isArray(segments)) return [];
  return segments.map(formatSegmentMessage).filter(Boolean);
}

function getSegmentStart(segment) {
  return typeof segment?.start === "number" && Number.isFinite(segment.start) ? segment.start : 0;
}

function getSegmentEnd(segment) {
  return typeof segment?.end === "number" && Number.isFinite(segment.end) ? segment.end : getSegmentStart(segment);
}

function getSegmentDuration(segment, fallback) {
  const start = getSegmentStart(segment);
  const end = getSegmentEnd(segment);
  if (end >= start) {
    return end - start;
  }
  return fallback;
}

function getSegmentsRange(segments) {
  let minStart = Infinity;
  let maxEnd = -Infinity;
  for (const segment of segments) {
    const start = getSegmentStart(segment);
    const end = getSegmentEnd(segment);
    if (start < minStart) {
      minStart = start;
    }
    if (end > maxEnd) {
      maxEnd = end;
    }
  }
  if (!Number.isFinite(minStart)) {
    minStart = 0;
  }
  if (!Number.isFinite(maxEnd)) {
    maxEnd = minStart;
  }
  return { start: minStart, end: maxEnd };
}

export async function transcribeSingleRequest(audioBlob, config = {}) {
  const {
    apiKey = typeof window !== "undefined" ? window?.electronAPI?.apiKey : undefined,
    model = DEFAULT_TRANSCRIPTION_MODEL,
    temperature = API_TEMPERATURE,
    language,
    responseFormat,
    stream = true,
    onChunk,
    onProgress
  } = config;

  if (!apiKey) {
    throw new Error("OpenAI API key is required for transcription.");
  }
  if (!(audioBlob instanceof Blob)) {
    throw new TypeError("transcribeSingleRequest expects a Blob or File instance.");
  }

  const AudioContextCtor = globalThis?.AudioContext;
  if (!AudioContextCtor) {
    throw new Error("AudioContext is not available in this environment.");
  }

  const audioContext = new AudioContextCtor();
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(arrayBuffer);
    const fallbackDuration =
      decoded.sampleRate && decoded.length ? decoded.length / decoded.sampleRate : 0;
    const rawDuration =
      Number.isFinite(decoded.duration) && decoded.duration >= 0
        ? decoded.duration
        : fallbackDuration;
    const durationSeconds = Number.isFinite(rawDuration) && rawDuration >= 0 ? rawDuration : 0;

    const streamingSegments = [];
    let streamingChunkIndex = 0;
    let hasStreamedChunks = false;
    const handleStreamEvent = event => {
      console.log("handleStreamEvent", { event });
      if (event?.type !== "transcript.text.segment") return;
      const normalizedSegments = (() => {
        if (!event) return [];
        if (Array.isArray(event.segments)) {
          return event.segments.filter(Boolean);
        }
        if (event.segment) {
          if (Array.isArray(event.segment.segments)) {
            return event.segment.segments.filter(Boolean);
          }
          return [event.segment].filter(Boolean);
        }
        return [event].filter(Boolean);
      })();
      if (!normalizedSegments.length) return;
      const messageParts = normalizedSegments.map(formatSegmentMessage).filter(Boolean);
      if (!messageParts.length) return;
      streamingSegments.push(...normalizedSegments);
      const chunkIndex = streamingChunkIndex;
      const { start: startSeconds, end: endSeconds } = getSegmentsRange(normalizedSegments);
      const durationSecondsForSegment = Math.max(endSeconds - startSeconds, 0);
      const textParts = normalizedSegments
        .map(segment => (typeof segment.text === "string" ? segment.text.trim() : ""))
        .filter(Boolean);
      const segmentChunk = {
        chunkIndex,
        totalChunks: chunkIndex + 1,
        durationSeconds: durationSecondsForSegment,
        segments: normalizedSegments,
        text: textParts.join(" ").trim(),
        trimmedText: messageParts.join(" "),
        rawResponse: event
      };
      streamingChunkIndex += 1;
      hasStreamedChunks = true;
      onChunk?.(segmentChunk);
      onProgress?.({
        chunkIndex,
        totalChunks: streamingChunkIndex,
        processedChunks: streamingChunkIndex,
        percent: 0,
        startSeconds,
        endSeconds,
        durationSeconds: durationSecondsForSegment
      });
    };

    const totalChunks = 1;
    onProgress?.({
      chunkIndex: -1,
      totalChunks,
      processedChunks: 0,
      percent: 0,
      startSeconds: 0,
      endSeconds: 0,
      durationSeconds
    });

    const response = await fetchTranscriptionChunk(audioBlob, {
      apiKey,
      model,
      temperature,
      language,
      responseFormat,
      fileName: audioBlob.name,
      stream,
      onStreamEvent: stream ? handleStreamEvent : undefined
    });

    const chunkBase = {
      chunkIndex: 0,
      durationSeconds,
      segments: Array.isArray(response?.segments) ? response.segments : [],
      text: typeof response?.text === "string" ? response.text.trim() : "",
      rawResponse: response
    };
    const finalSegments = streamingSegments.length ? streamingSegments : chunkBase.segments;
    chunkBase.segments = finalSegments;
    const trimmedSegmentsText = buildChunkTextFromSegments(chunkBase, 0);
    const fallbackText = chunkBase.text || "";
    const chunk = { ...chunkBase, trimmedText: trimmedSegmentsText || fallbackText };

    const shouldEmitFinalChunk = !stream || !hasStreamedChunks;
    if (shouldEmitFinalChunk) {
      onChunk?.(chunk);
    }
    const finalChunkIndex = hasStreamedChunks ? Math.max(0, streamingChunkIndex - 1) : 0;
    const finalTotalChunks = hasStreamedChunks ? streamingChunkIndex : 1;
    const finalProcessedChunks = hasStreamedChunks ? streamingChunkIndex : 1;
    onProgress?.({
      chunkIndex: finalChunkIndex,
      totalChunks: finalTotalChunks,
      processedChunks: finalProcessedChunks,
      percent: 100,
      startSeconds: 0,
      endSeconds: durationSeconds,
      durationSeconds
    });

    return {
      chunks: [chunk]
    };
  } finally {
    audioContext.close().catch(() => {});
  }
}

export async function transcribeWithSlidingWindow(audioBlob, config = {}) {
  const {
    apiKey = typeof window !== "undefined" ? window?.electronAPI?.apiKey : undefined,
    chunkSeconds = DEFAULT_CHUNK_SECONDS,
    overlapSeconds = DEFAULT_OVERLAP_SECONDS,
    model = DEFAULT_TRANSCRIPTION_MODEL,
    temperature = API_TEMPERATURE,
    language,
    responseFormat,
    onChunk,
    onProgress
  } = config;

  if (!apiKey) {
    throw new Error("OpenAI API key is required for transcription.");
  }
  if (!(audioBlob instanceof Blob)) {
    throw new TypeError("transcribeWithSlidingWindow expects a Blob or File instance.");
  }
  if (chunkSeconds <= 0) {
    throw new Error("chunkSeconds must be greater than zero.");
  }

  const AudioContextCtor = globalThis?.AudioContext;
  if (!AudioContextCtor) {
    throw new Error("AudioContext is not available in this environment.");
  }

  const audioContext = new AudioContextCtor();
  try {
    const arrayBuffer = await audioBlob.arrayBuffer();
    const decoded = await audioContext.decodeAudioData(arrayBuffer);
    const sampleRate = decoded.sampleRate;
    const stepFrames = Math.max(Math.floor(chunkSeconds * sampleRate), 1);
    const chunkFrames = Math.max(Math.floor((chunkSeconds + overlapSeconds) * sampleRate), 1);
    const totalFrames = decoded.length;
    if (totalFrames === 0) {
      return { chunks: [] };
    }
    const startFrames = [];
    let startFrameCursor = 0;
    while (startFrameCursor < totalFrames) {
      startFrames.push(startFrameCursor);
      startFrameCursor += stepFrames;
    }
    if (startFrames.length === 0) {
      startFrames.push(0);
    }
    const totalChunks = startFrames.length;
    onProgress?.({
      chunkIndex: -1,
      totalChunks,
      processedChunks: 0,
      percent: 0,
      startSeconds: 0,
      endSeconds: 0,
      durationSeconds: 0
    });
    const chunkResults = new Array(totalChunks);
    let nextChunkIndex = 0;
    let processedChunks = 0;
    let nextChunkIndexToEmit = 0;
    const concurrencyLimit = Math.min(5, totalChunks);

    const emitReadyChunks = () => {
      while (nextChunkIndexToEmit < totalChunks && chunkResults[nextChunkIndexToEmit]) {
        const readyChunk = chunkResults[nextChunkIndexToEmit];
        onChunk?.(readyChunk);
        nextChunkIndexToEmit += 1;
      }
    };

    const worker = async () => {
      while (true) {
        const chunkIndex = nextChunkIndex;
        if (chunkIndex >= totalChunks) {
          break;
        }
        nextChunkIndex += 1;

        const startFrame = startFrames[chunkIndex];
        const endFrame = Math.min(totalFrames, startFrame + chunkFrames);
        const slice = sliceAudioBuffer(decoded, startFrame, endFrame);
        const chunkBlob = audioBufferToWavBlob(slice);
        const response = await fetchTranscriptionChunk(chunkBlob, {
          apiKey,
          model,
          temperature,
          language,
          responseFormat
        });

        const chunkBase = {
          chunkIndex,
          durationSeconds: (endFrame - startFrame) / sampleRate,
          segments: Array.isArray(response?.segments) ? response.segments : [],
          text: typeof response?.text === "string" ? response.text.trim() : "",
          rawResponse: response
        };
        const dropSeconds = chunkIndex === 0 ? 0 : overlapSeconds;
        const trimmedSegmentsText = buildChunkTextFromSegments(chunkBase, dropSeconds);
        const fallbackText = chunkBase.text || "";
        const trimmedText = trimmedSegmentsText || fallbackText;
        const chunk = { ...chunkBase, trimmedText };

        chunkResults[chunkIndex] = chunk;
        emitReadyChunks();

        processedChunks += 1;
        onProgress?.({
          chunkIndex,
          totalChunks,
          processedChunks,
          percent: Math.floor((processedChunks / totalChunks) * 100),
          startSeconds: startFrame / sampleRate,
          endSeconds: endFrame / sampleRate,
          durationSeconds: chunk.durationSeconds
        });
      }
    };

    await Promise.all(Array.from({ length: concurrencyLimit }, () => worker()));

    return {
      chunks: chunkResults
    };
  } finally {
    audioContext.close().catch(() => {});
  }
}
