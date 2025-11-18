export interface STTPipelineResponse {
  success: boolean;
  isPolyfill?: boolean;
  stt?: {
    transcript: string;
    confidence: number;
    issues?: string[];
  };
  llm?: {
    text: string;
    model: string;
  };
  tts?: {
    audio: string; // base64 encoded
    format: string;
  };
  polyfill?: {
    type: string;
    source: string;
  };
  mode?: string;
  error?: string;
}

export class HttpVoiceService {
  private apiBaseUrl: string;
  private sessionId: string;

  constructor(apiBaseUrl?: string) {
    this.apiBaseUrl = apiBaseUrl || 'https://samvad-api-bun-def3r7eewq-uc.a.run.app';
    this.sessionId = 'session-' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Convert Float32Array audio from VAD to WAV format
   */
  private float32ToWav(float32Array: Float32Array, sampleRate: number): Blob {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const blockAlign = numChannels * bytesPerSample;

    const dataLength = float32Array.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // WAV header
    const writeString = (offset: number, string: string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true); // byte rate
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // Convert float32 to int16 PCM
    let offset = 44;
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * Send audio to STT-TTS pipeline
   */
  async sendAudio(
    audio: Float32Array,
    language: string = 'en'
  ): Promise<STTPipelineResponse> {
    try {
      // Convert to WAV
      const wavBlob = this.float32ToWav(audio, 16000);
      const arrayBuffer = await wavBlob.arrayBuffer();
      const base64Audio = btoa(
        new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
      );

      console.log('[HttpVoiceService] Sending audio to backend, size:', wavBlob.size, 'bytes');

      const response = await fetch(`${this.apiBaseUrl}/api/stt-tts-pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audio: base64Audio,
          language: language,
          sessionId: this.sessionId,
          mimeType: 'audio/wav'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: STTPipelineResponse = await response.json();
      return data;
    } catch (error) {
      console.error('[HttpVoiceService] Failed to send audio:', error);
      throw error;
    }
  }

  /**
   * Play TTS audio from base64 string
   */
  async playTTSAudio(base64Audio: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const audioBytes = atob(base64Audio);
        const arrayBuffer = new ArrayBuffer(audioBytes.length);
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < audioBytes.length; i++) {
          view[i] = audioBytes.charCodeAt(i);
        }

        const audioBlob = new Blob([arrayBuffer], { type: 'audio/mp3' });
        const audioUrl = URL.createObjectURL(audioBlob);
        const audio = new Audio(audioUrl);

        audio.onended = () => {
          URL.revokeObjectURL(audioUrl);
          resolve();
        };

        audio.onerror = (error) => {
          URL.revokeObjectURL(audioUrl);
          reject(error);
        };

        audio.play();
      } catch (error) {
        reject(error);
      }
    });
  }
}
