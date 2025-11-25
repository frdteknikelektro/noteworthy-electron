import { Mp3Encoder } from "@breezystack/lamejs";

const TARGET_SAMPLE_RATE = 16000;
const TARGET_BITRATE = 128;
const BLOCK_SIZE = 1152;

const clamp = value => Math.max(-1, Math.min(1, value));

function floatTo16BitPCM(float32Array, length) {
  const result = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    const sample = clamp(float32Array[i]);
    result[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }
  return result;
}

function mixToMono(channels) {
  if (!Array.isArray(channels) || channels.length === 0) {
    return new Float32Array(0);
  }
  const length = Math.min(
    ...channels.map(channel => (channel?.length ?? Infinity))
  );
  if (!Number.isFinite(length) || length === 0) {
    return channels[0] instanceof Float32Array ? channels[0].slice() : new Float32Array(0);
  }
  const output = new Float32Array(length);
  const channelCount = channels.length;
  for (let i = 0; i < length; i += 1) {
    let sum = 0;
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      sum += channels[channelIndex]?.[i] ?? 0;
    }
    output[i] = sum / channelCount;
  }
  return output;
}

function resample(buffer, sourceRate, targetRate) {
  if (!buffer || buffer.length === 0 || sourceRate === targetRate) {
    return buffer;
  }
  const ratio = sourceRate / targetRate;
  const outputLength = Math.round(buffer.length / ratio);
  if (outputLength <= 0) {
    return buffer;
  }
  const result = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i += 1) {
    const position = i * ratio;
    const positionFloor = Math.floor(position);
    const positionCeil = Math.min(positionFloor + 1, buffer.length - 1);
    const t = position - positionFloor;
    const startValue = buffer[positionFloor] ?? 0;
    const endValue = buffer[positionCeil] ?? 0;
    result[i] = startValue * (1 - t) + endValue * t;
  }
  return result;
}

function encodeMp3(int16Samples, progressCallback) {
  const encoder = new Mp3Encoder(1, TARGET_SAMPLE_RATE, TARGET_BITRATE);
  const chunks = [];
  const totalSamples = int16Samples.length;
  const normalizedTotal = Math.max(totalSamples, 1);

  for (let offset = 0; offset < totalSamples; offset += BLOCK_SIZE) {
    const end = Math.min(offset + BLOCK_SIZE, totalSamples);
    const block = int16Samples.subarray(offset, end);
    const chunk = encoder.encodeBuffer(block);
    if (chunk.length) {
      chunks.push(chunk);
    }
    const percent = Math.min(99, Math.round((end / normalizedTotal) * 100));
    if (typeof progressCallback === "function") {
      progressCallback(percent);
    }
  }

  const flushed = encoder.flush();
  if (flushed.length) {
    chunks.push(flushed);
  }
  if (typeof progressCallback === "function") {
    progressCallback(100);
  }

  const length = chunks.reduce((sum, current) => sum + current.length, 0);
  const buffer = new Uint8Array(length);
  let cursor = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, cursor);
    cursor += chunk.length;
  }
  return buffer.buffer;
}

self.onmessage = async event => {
  const { data } = event;
  if (!data) {
    return;
  }

  const { id, pcmChannels, sampleRate = 44100 } = data;
  if (!id || !Array.isArray(pcmChannels) || pcmChannels.length === 0) {
    self.postMessage({ id, type: "error", message: "Invalid PCM data" });
    return;
  }

  const sendProgress = (() => {
    let lastPercent = -1;
    return percent => {
      if (!Number.isFinite(percent)) {
        return false;
      }
      const normalized = Math.min(100, Math.max(0, Math.round(percent)));
      if (normalized === lastPercent) {
        return false;
      }
      lastPercent = normalized;
      self.postMessage({ id, type: "progress", percent: normalized });
      return true;
    };
  })();

  try {
    sendProgress(0);

    const monoSource = mixToMono(pcmChannels);
    const resampled = resample(monoSource, sampleRate, TARGET_SAMPLE_RATE);
    if (!resampled || resampled.length === 0) {
      throw new Error("No audio samples available for encoding");
    }

    const totalSamples = resampled.length;
    const int16Samples = floatTo16BitPCM(resampled, totalSamples);

    const rawMp3 = encodeMp3(int16Samples, sendProgress);

    const view = new Uint8Array(rawMp3);
    const buffer = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
    self.postMessage({ id, type: "result", mp3Buffer: buffer }, [buffer]);
  } catch (error) {
    self.postMessage({ id, type: "error", message: error?.message || "Encoding failed" });
  }
};
