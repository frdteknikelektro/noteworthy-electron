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
const DEFAULT_TRANSCRIPTION_MODEL = "gpt-4o-transcribe";
const DEFAULT_TRANSCRIPTION_RESPONSE_FORMAT = "json";
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

async function fetchTranscriptionChunk(blob, { apiKey, model, language, responseFormat }) {
  const formData = new FormData();
  formData.append("model", model);
  formData.append("file", blob, "chunk.wav");
  formData.append("response_format", responseFormat || DEFAULT_TRANSCRIPTION_RESPONSE_FORMAT);
  if (language) {
    formData.append("language", language);
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

  return response.json();
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

export async function transcribeWithSlidingWindow(audioBlob, config = {}) {
  const {
    apiKey = typeof window !== "undefined" ? window?.electronAPI?.apiKey : undefined,
    chunkSeconds = DEFAULT_CHUNK_SECONDS,
    overlapSeconds = DEFAULT_OVERLAP_SECONDS,
    model = DEFAULT_TRANSCRIPTION_MODEL,
    language,
    responseFormat = DEFAULT_TRANSCRIPTION_RESPONSE_FORMAT,
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
