/**
 * Audio Worklet Processor for PCM Audio Streaming
 * Runs in a separate thread for efficient audio processing
 */

class AudioStreamProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    this.isSpeaking = false;
    this.speechThreshold = 0.01;
    this.lastSpeechTime = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];

    if (!input || !input[0]) {
      return true;
    }

    const inputData = input[0]; // First channel (mono)

    // Calculate RMS volume for speech detection
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sum / inputData.length);

    // Detect speech start/end
    const currentTime = currentFrame / sampleRate * 1000; // Convert to ms

    if (!this.isSpeaking && rms > this.speechThreshold) {
      this.isSpeaking = true;
      this.lastSpeechTime = currentTime;
      this.port.postMessage({
        type: 'speech-start',
        time: currentTime,
        rms: rms
      });
    }

    if (this.isSpeaking && rms < this.speechThreshold) {
      const duration = currentTime - this.lastSpeechTime;
      this.port.postMessage({
        type: 'speech-end',
        duration: duration
      });
      this.isSpeaking = false;
    }

    // Convert Float32 to Int16 PCM
    const pcmData = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    // Send PCM data to main thread
    this.port.postMessage({
      type: 'audio-data',
      data: pcmData.buffer
    }, [pcmData.buffer]); // Transfer buffer ownership for efficiency

    return true; // Keep processor alive
  }
}

registerProcessor('audio-stream-processor', AudioStreamProcessor);
