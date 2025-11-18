/**
 * Enhanced Voice Client with Silero VAD Integration
 * Handles microphone access, audio recording, voice activity detection, and audio playback
 */

class EnhancedVoiceClient {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.stream = null;
        this.isRecording = false;
        this.audioPlayer = null;
        
        // VAD integration
        this.vadService = new SileroVADService();
        this.audioContext = null;
        this.analyser = null;
        this.dataArray = null;
        this.animationFrame = null;
        
        // VAD configuration
        this.vadEnabled = true;
        this.autoStartRecording = true;
        this.autoStopRecording = true;
        this.silenceTimeout = 2000; // 2 seconds of silence to stop
        this.silenceTimer = null;
        
        // Event listeners
        this.listeners = new Map();
    }

    /**
     * Initialize the enhanced voice client with VAD
     */
    async init() {
        try {
            console.log('[EnhancedVoiceClient] Initializing with Silero VAD...');
            
            // Initialize audio player
            this.audioPlayer = document.getElementById('audio-player');
            if (!this.audioPlayer) {
                console.error('[EnhancedVoiceClient] Audio player element not found');
            }
            
            // Initialize VAD service
            await this.vadService.init();
            this.setupVADListeners();
            
            console.log('[EnhancedVoiceClient] Initialized successfully');
            this.notifyListeners('initialized');
            
        } catch (error) {
            console.error('[EnhancedVoiceClient] Initialization failed:', error);
            this.notifyListeners('error', { error: error.message });
        }
    }

    /**
     * Setup VAD event listeners
     */
    setupVADListeners() {
        this.vadService.on('speechStarted', (data) => {
            console.log('[EnhancedVoiceClient] Speech started:', data);
            this.notifyListeners('speechStarted', data);
            
            // Auto-start recording if enabled
            if (this.autoStartRecording && !this.isRecording) {
                this.startRecording();
            }
        });

        this.vadService.on('speechEnded', (data) => {
            console.log('[EnhancedVoiceClient] Speech ended:', data);
            this.notifyListeners('speechEnded', data);
            
            // Auto-stop recording if enabled
            if (this.autoStopRecording && this.isRecording) {
                this.scheduleRecordingStop();
            }
        });

        this.vadService.on('error', (data) => {
            console.error('[EnhancedVoiceClient] VAD error:', data);
            this.notifyListeners('vadError', data);
        });
    }

    /**
     * Start recording with VAD
     */
    async startRecording() {
        try {
            console.log('[EnhancedVoiceClient] Starting recording with VAD...');
            
            // Get user media with optimal settings for VAD
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    sampleRate: 16000, // Optimal for VAD
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            
            // Create audio context for VAD
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });
            
            // Create analyser for real-time audio analysis
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.8;
            
            const source = this.audioContext.createMediaStreamSource(this.stream);
            source.connect(this.analyser);
            
            this.dataArray = new Float32Array(this.analyser.frequencyBinCount);
            
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
                this.handleRecordingStop();
            };
            
            // Start recording
            this.mediaRecorder.start(100); // 100ms chunks for real-time processing
            this.isRecording = true;
            
            // Start VAD processing
            this.startVADProcessing();
            
            this.notifyListeners('recordingStarted');
            console.log('[EnhancedVoiceClient] Recording started with VAD');
            
        } catch (error) {
            console.error('[EnhancedVoiceClient] Failed to start recording:', error);
            this.notifyListeners('error', { error: error.message });
        }
    }

    /**
     * Start VAD processing loop
     */
    startVADProcessing() {
        if (!this.vadEnabled || !this.analyser) return;
        
        const processAudio = () => {
            if (!this.isRecording) return;
            
            // Get audio data
            this.analyser.getFloatTimeDomainData(this.dataArray);
            
            // Process with VAD
            this.vadService.processAudio(this.dataArray).then(result => {
                if (result.isSpeech) {
                    // Clear silence timer if speech is detected
                    if (this.silenceTimer) {
                        clearTimeout(this.silenceTimer);
                        this.silenceTimer = null;
                    }
                } else {
                    // Start silence timer if no speech
                    if (!this.silenceTimer && this.autoStopRecording) {
                        this.silenceTimer = setTimeout(() => {
                            if (this.isRecording) {
                                this.stopRecording();
                            }
                        }, this.silenceTimeout);
                    }
                }
            });
            
            // Continue processing
            this.animationFrame = requestAnimationFrame(processAudio);
        };
        
        this.animationFrame = requestAnimationFrame(processAudio);
    }

    /**
     * Stop VAD processing
     */
    stopVADProcessing() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
        
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
        }
    }

    /**
     * Schedule recording stop (for auto-stop functionality)
     */
    scheduleRecordingStop() {
        if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
        }
        
        this.silenceTimer = setTimeout(() => {
            if (this.isRecording) {
                this.stopRecording();
            }
        }, this.silenceTimeout);
    }

    /**
     * Stop recording
     */
    async stopRecording() {
        try {
            console.log('[EnhancedVoiceClient] Stopping recording...');
            
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
            
            this.isRecording = false;
            this.stopVADProcessing();
            
            // Stop audio context
            if (this.audioContext) {
                await this.audioContext.close();
                this.audioContext = null;
            }
            
            // Stop media stream
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
                this.stream = null;
            }
            
            this.notifyListeners('recordingStopped');
            console.log('[EnhancedVoiceClient] Recording stopped');
            
        } catch (error) {
            console.error('[EnhancedVoiceClient] Failed to stop recording:', error);
            this.notifyListeners('error', { error: error.message });
        }
    }

    /**
     * Handle recording stop event
     */
    handleRecordingStop() {
        try {
            const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm;codecs=opus' });
            
            // Convert to audio data for processing
            this.processAudioBlob(audioBlob);
            
        } catch (error) {
            console.error('[EnhancedVoiceClient] Failed to handle recording stop:', error);
            this.notifyListeners('error', { error: error.message });
        }
    }

  /**
   * Process audio blob
   */
  async processAudioBlob(audioBlob) {
    try {
      console.log('[EnhancedVoiceClient] Processing audio blob:', {
        size: audioBlob.size,
        type: audioBlob.type,
        timestamp: new Date().toISOString()
      });
      
      // Create audio URL for playback
      const audioUrl = URL.createObjectURL(audioBlob);
      
      console.log('[EnhancedVoiceClient] Audio blob processed, emitting audioData event');
      
      // Emit audio data event
      this.notifyListeners('audioData', {
        blob: audioBlob,
        url: audioUrl,
        size: audioBlob.size,
        type: audioBlob.type
      });
      
      console.log('[EnhancedVoiceClient] Audio data event emitted successfully');
      
    } catch (error) {
      console.error('[EnhancedVoiceClient] Failed to process audio blob:', error);
      this.notifyListeners('error', { error: error.message });
    }
  }

    /**
     * Play audio response
     */
    async playAudio(audioUrl) {
        try {
            console.log('[EnhancedVoiceClient] Playing audio:', audioUrl);
            
            if (this.audioPlayer) {
                this.audioPlayer.src = audioUrl;
                await this.audioPlayer.play();
                
                this.notifyListeners('audioPlaybackStarted');
                
                // Listen for playback end
                this.audioPlayer.onended = () => {
                    this.notifyListeners('audioPlaybackEnded');
                };
            }
            
        } catch (error) {
            console.error('[EnhancedVoiceClient] Failed to play audio:', error);
            this.notifyListeners('error', { error: error.message });
        }
    }

    /**
     * Configure VAD settings
     */
    configureVAD(options = {}) {
        this.vadService.configure(options);
        
        if (options.vadEnabled !== undefined) {
            this.vadEnabled = options.vadEnabled;
        }
        if (options.autoStartRecording !== undefined) {
            this.autoStartRecording = options.autoStartRecording;
        }
        if (options.autoStopRecording !== undefined) {
            this.autoStopRecording = options.autoStopRecording;
        }
        if (options.silenceTimeout !== undefined) {
            this.silenceTimeout = options.silenceTimeout;
        }
        
        console.log('[EnhancedVoiceClient] VAD configuration updated:', {
            vadEnabled: this.vadEnabled,
            autoStartRecording: this.autoStartRecording,
            autoStopRecording: this.autoStopRecording,
            silenceTimeout: this.silenceTimeout
        });
    }

    /**
     * Get VAD statistics
     */
    getVADStats() {
        return this.vadService.getStats();
    }

    /**
     * Get VAD configuration
     */
    getVADConfiguration() {
        return this.vadService.getConfiguration();
    }

    /**
     * Reset VAD state
     */
    resetVAD() {
        this.vadService.reset();
        this.stopVADProcessing();
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (!this.listeners.has(event)) return;
        const callbacks = this.listeners.get(event);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
            callbacks.splice(index, 1);
        }
    }

    /**
     * Notify listeners
     */
    notifyListeners(event, data) {
        if (!this.listeners.has(event)) return;
        this.listeners.get(event).forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                console.error(`[EnhancedVoiceClient] Listener error for ${event}:`, error);
            }
        });
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        this.stopRecording();
        this.resetVAD();
        
        if (this.audioContext) {
            this.audioContext.close();
        }
        
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }
    }
}

// Make globally available
window.EnhancedVoiceClient = EnhancedVoiceClient;
