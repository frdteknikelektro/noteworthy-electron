export class Session {
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

export class WavRecorder {
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
