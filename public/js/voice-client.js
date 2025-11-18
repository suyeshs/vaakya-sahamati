/**
 * Voice Client for Audio Recording and Playback
 * Handles microphone access, audio recording, and audio playback
 */

class VoiceClient {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.isRecording = false;
        this.audioPlayer = null;
    }

    /**
     * Initialize audio player
     */
    init() {
        this.audioPlayer = document.getElementById('audio-player');
        if (!this.audioPlayer) {
            console.error('[VoiceClient] Audio player element not found');
        }
    }

    /**
     * Start recording audio
     */
    async startRecording() {
        try {
            console.log('[VoiceClient] Starting recording...');
            
            // Get user media
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 48000,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Create MediaRecorder
            this.mediaRecorder = new MediaRecorder(this.stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.audioChunks = [];
            
            // Set up event handlers
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                console.log('[VoiceClient] Recording stopped, processing audio...');
                this.processAudio();
            };
            
            // Start recording
            this.mediaRecorder.start(100); // Collect data every 100ms
            this.isRecording = true;
            
            console.log('[VoiceClient] Recording started');
            return true;
            
        } catch (error) {
            console.error('[VoiceClient] Failed to start recording:', error);
            throw error;
        }
    }

    /**
     * Stop recording audio
     */
    stopRecording() {
        if (this.mediaRecorder && this.isRecording) {
            console.log('[VoiceClient] Stopping recording...');
            this.mediaRecorder.stop();
            this.isRecording = false;
            
            // Stop all tracks
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
        }
    }

    /**
     * Process recorded audio
     */
    async processAudio() {
        try {
            // Create audio blob
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm;codecs=opus' });
            console.log('[VoiceClient] Audio blob created:', audioBlob.size, 'bytes');
            
            // Convert to ArrayBuffer for sending
            const arrayBuffer = await audioBlob.arrayBuffer();
            
            // Emit audio data event
            this.emit('audioData', arrayBuffer);
            
        } catch (error) {
            console.error('[VoiceClient] Failed to process audio:', error);
            this.emit('error', error);
        }
    }

    /**
     * Play audio response
     */
    playAudioResponse(audioBase64) {
        try {
            console.log('[VoiceClient] Playing audio response...');
            
            // Convert base64 to blob
            const binaryString = atob(audioBase64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Play audio
            if (this.audioPlayer) {
                this.audioPlayer.src = audioUrl;
                this.audioPlayer.play().then(() => {
                    console.log('[VoiceClient] Audio playing');
                }).catch(error => {
                    console.error('[VoiceClient] Failed to play audio:', error);
                });
                
                // Clean up URL after playing
                this.audioPlayer.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                };
            }
            
        } catch (error) {
            console.error('[VoiceClient] Failed to play audio response:', error);
            this.emit('error', error);
        }
    }

    /**
     * Check if recording is supported
     */
    isRecordingSupported() {
        return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    }

    /**
     * Get available audio devices
     */
    async getAudioDevices() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices.filter(device => device.kind === 'audioinput');
        } catch (error) {
            console.error('[VoiceClient] Failed to get audio devices:', error);
            return [];
        }
    }

    /**
     * Event listener management
     */
    on(event, listener) {
        if (!this.eventListeners) {
            this.eventListeners = new Map();
        }
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(listener);
    }

    off(event, listener) {
        if (this.eventListeners) {
            const listeners = this.eventListeners.get(event);
            if (listeners) {
                const index = listeners.indexOf(listener);
                if (index > -1) {
                    listeners.splice(index, 1);
                }
            }
        }
    }

    emit(event, data) {
        if (this.eventListeners) {
            const listeners = this.eventListeners.get(event);
            if (listeners) {
                listeners.forEach(listener => {
                    try {
                        listener(data);
                    } catch (error) {
                        console.error('[VoiceClient] Event listener error:', error);
                    }
                });
            }
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.stopRecording();
        if (this.audioPlayer) {
            this.audioPlayer.pause();
            this.audioPlayer.src = '';
        }
    }
}

// Export for use in other scripts
window.VoiceClient = VoiceClient;
