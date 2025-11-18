/**
 * VAD-Integrated State Machine for Voice Assistant
 * 
 * Optimized state machine that works seamlessly with Silero VAD
 * for intelligent voice interaction workflow
 */

class VADIntegratedStateMachine {
  constructor() {
    this.context = {
      error: null,
      input: "",
      response: "",
      language: "en",
      isConnected: false,
      isRecording: false,
      sessionId: null,
      audioUrl: null,
      // VAD-specific context
      vadEnabled: true,
      speechDetected: false,
      speechStartTime: null,
      silenceStartTime: null,
      speechFrames: [],
      vadConfidence: 0,
      autoRecording: true
    };
    
    this.currentState = 'idle';
    this.listeners = new Map();
    this.vadService = null;
    
    // State definitions optimized for VAD workflow
    this.states = {
      idle: {
        on: {
          START: 'initializing',
          VAD_SPEECH_DETECTED: 'speech_detected',
          MANUAL_RECORD: 'manual_recording',
          RESPONSE_READY: 'responding',
          CLEAR_ERROR: () => this.clearError()
        }
      },
      initializing: {
        timeout: 3000,
        on: {
          READY: 'ready',
          VAD_READY: 'ready',
          ERROR: (error) => this.handleError(error),
          TIMEOUT: 'error'
        }
      },
      ready: {
        on: {
          VAD_SPEECH_DETECTED: 'speech_detected',
          MANUAL_RECORD: 'manual_recording',
          RESPONSE_READY: 'responding',
          VAD_ERROR: (error) => this.handleError(error),
          CLEAR_ERROR: () => this.clearError(),
          ERROR: (error) => this.handleError(error)
        }
      },
      speech_detected: {
        timeout: 100, // Quick transition to recording
        on: {
          START_RECORDING: 'recording',
          VAD_SPEECH_ENDED: 'processing_speech',
          VAD_NO_SPEECH: 'ready', // False positive
          TIMEOUT: 'ready'
        }
      },
      manual_recording: {
        on: {
          RECORDING_STARTED: 'recording',
          VAD_SPEECH_DETECTED: 'recording', // VAD can take over
          ERROR: (error) => this.handleError(error)
        }
      },
      recording: {
        timeout: 30000, // 30 second max recording
        on: {
          VAD_SPEECH_ENDED: 'processing_speech',
          RECORDING_STOPPED: 'processing_audio',
          VAD_NO_SPEECH: 'checking_silence',
          INTERRUPT: 'interrupted',
          CANCEL: 'ready',
          ERROR: (error) => this.handleError(error),
          TIMEOUT: 'processing_audio'
        }
      },
      checking_silence: {
        timeout: 2000, // 2 seconds of silence check
        on: {
          VAD_SPEECH_DETECTED: 'recording', // Resume recording
          RECORDING_STOPPED: 'processing_audio',
          TIMEOUT: 'processing_audio'
        }
      },
      processing_speech: {
        timeout: 1000, // Quick processing
        on: {
          SPEECH_PROCESSED: 'processing_audio',
          VAD_SPEECH_DETECTED: 'recording', // More speech
          ERROR: (error) => this.handleError(error),
          TIMEOUT: 'processing_audio'
        }
      },
      processing_audio: {
        timeout: 60000, // 1 minute processing timeout
        on: {
          AUDIO_READY: 'responding',
          RESPONSE_READY: 'responding',
          VAD_SPEECH_DETECTED: 'recording', // New speech while processing
          INTERRUPT: 'interrupted',
          ERROR: (error) => this.handleError(error),
          TIMEOUT: 'error'
        }
      },
      responding: {
        on: {
          RESPONSE_ENDED: 'ready',
          VAD_SPEECH_DETECTED: 'speech_detected', // New speech during response
          INTERRUPT: 'interrupted',
          ERROR: (error) => this.handleError(error)
        }
      },
      interrupted: {
        on: {
          RESUME: 'recording',
          CANCEL: 'ready',
          VAD_SPEECH_DETECTED: 'speech_detected',
          ERROR: (error) => this.handleError(error)
        }
      },
      error: {
        on: {
          RETRY: 'ready',
          VAD_SPEECH_DETECTED: 'speech_detected',
          CANCEL: 'idle',
          START: 'initializing',
          CLEAR_ERROR: () => this.clearError()
        }
      }
    };
  }

  /**
   * Set VAD service reference
   */
  setVADService(vadService) {
    this.vadService = vadService;
    this.setupVADListeners();
  }

  /**
   * Setup VAD event listeners
   */
  setupVADListeners() {
    if (!this.vadService) return;

    this.vadService.on('speechStarted', (data) => {
      console.log('[VADStateMachine] Speech started:', data);
      this.context.speechDetected = true;
      this.context.speechStartTime = data.timestamp;
      this.context.vadConfidence = data.probability || 0;
      this.transition('VAD_SPEECH_DETECTED', data);
    });

    this.vadService.on('speechEnded', (data) => {
      console.log('[VADStateMachine] Speech ended:', data);
      this.context.speechDetected = false;
      this.context.silenceStartTime = data.timestamp;
      this.context.speechFrames = data.frames || [];
      this.transition('VAD_SPEECH_ENDED', data);
    });

    this.vadService.on('error', (data) => {
      console.error('[VADStateMachine] VAD error:', data);
      this.transition('VAD_ERROR', data.error);
    });
  }

  /**
   * Transition to a new state with VAD optimization
   */
  transition(event, data = null) {
    const currentStateConfig = this.states[this.currentState];
    if (!currentStateConfig || !currentStateConfig.on[event]) {
      console.warn(`[VADStateMachine] Invalid transition: ${this.currentState} -> ${event}`);
      return false;
    }

    const nextState = currentStateConfig.on[event];
    const previousState = this.currentState;
    
    // Execute transition
    if (typeof nextState === 'function') {
      nextState(data);
    } else {
      this.currentState = nextState;
    }

    // Update context based on state
    this.updateContextForState(this.currentState, data);

    console.log(`[VADStateMachine] ${previousState} -> ${this.currentState} (${event})`);
    console.log('[VADStateMachine] Context after transition:', {
      isRecording: this.context.isRecording,
      speechDetected: this.context.speechDetected,
      isSessionActive: this.context.isSessionActive,
      vadEnabled: this.context.vadEnabled
    });
    
    this.notifyListeners('stateChange', {
      previousState,
      currentState: this.currentState,
      event,
      context: this.context,
      vadEnabled: this.context.vadEnabled
    });

    return true;
  }

  /**
   * Update context based on current state
   */
  updateContextForState(state, data) {
    switch (state) {
      case 'recording':
        this.context.isRecording = true;
        break;
      case 'ready':
        this.context.isRecording = false;
        this.context.speechDetected = false;
        break;
      case 'responding':
        this.context.isRecording = false;
        break;
      case 'error':
        this.context.error = data?.error || 'Unknown error';
        break;
    }
  }

  /**
   * Handle speech processed event
   */
  handleSpeechProcessed(data) {
    this.context.input = data.text || this.context.input;
    this.context.language = data.language || this.context.language;
    this.context.audioUrl = data.audioUrl || this.context.audioUrl;
    this.notifyListeners('speechProcessed', data);
  }

  /**
   * Handle audio ready event
   */
  handleAudioReady(audioUrl) {
    this.context.response = audioUrl || this.context.response;
    this.context.audioUrl = audioUrl;
    this.transition('AUDIO_READY');
    this.notifyListeners('audioReady', { audioUrl });
  }

  /**
   * Handle error
   */
  handleError(error) {
    this.context.error = error || "An error occurred";
    this.currentState = 'error';
    this.notifyListeners('error', { error: this.context.error });
  }

  /**
   * Clear error
   */
  clearError() {
    this.context.error = null;
    this.notifyListeners('errorCleared');
  }

  /**
   * Configure VAD settings
   */
  configureVAD(options = {}) {
    if (options.vadEnabled !== undefined) {
      this.context.vadEnabled = options.vadEnabled;
    }
    if (options.autoRecording !== undefined) {
      this.context.autoRecording = options.autoRecording;
    }
    
    console.log('[VADStateMachine] VAD configuration updated:', {
      vadEnabled: this.context.vadEnabled,
      autoRecording: this.context.autoRecording
    });
  }

  /**
   * Get optimized recording strategy based on current state
   */
  getRecordingStrategy() {
    const state = this.currentState;
    
    switch (state) {
      case 'ready':
        return {
          autoStart: this.context.vadEnabled && this.context.autoRecording,
          autoStop: this.context.vadEnabled,
          timeout: 30000
        };
      case 'recording':
        return {
          autoStart: false,
          autoStop: this.context.vadEnabled,
          timeout: 30000
        };
      case 'responding':
        return {
          autoStart: this.context.vadEnabled,
          autoStop: false,
          timeout: 10000
        };
      default:
        return {
          autoStart: false,
          autoStop: false,
          timeout: 30000
        };
    }
  }

  /**
   * Check if VAD should be active in current state
   */
  shouldVADBeActive() {
    const activeStates = ['idle', 'ready', 'recording', 'responding'];
    return this.context.vadEnabled && activeStates.includes(this.currentState);
  }

  /**
   * Get VAD configuration for current state
   */
  getVADConfiguration() {
    const state = this.currentState;
    
    switch (state) {
      case 'ready':
        return {
          threshold: 0.5,
          minSpeechDuration: 100,
          minSilenceDuration: 200,
          autoStart: true
        };
      case 'recording':
        return {
          threshold: 0.3, // Lower threshold during recording
          minSpeechDuration: 50,
          minSilenceDuration: 1000, // Longer silence check
          autoStart: false
        };
      case 'responding':
        return {
          threshold: 0.6, // Higher threshold during response
          minSpeechDuration: 200,
          minSilenceDuration: 100,
          autoStart: true
        };
      default:
        return {
          threshold: 0.5,
          minSpeechDuration: 100,
          minSilenceDuration: 200,
          autoStart: false
        };
    }
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
        console.error(`[VADStateMachine] Listener error for ${event}:`, error);
      }
    });
  }

  /**
   * Get current state
   */
  getCurrentState() {
    return this.currentState;
  }

  /**
   * Get context
   */
  getContext() {
    return { ...this.context };
  }

  /**
   * Check if in specific state
   */
  isInState(state) {
    return this.currentState === state;
  }

  /**
   * Check if can transition
   */
  canTransition(event) {
    const currentStateConfig = this.states[this.currentState];
    return currentStateConfig && currentStateConfig.on[event];
  }

  /**
   * Start the state machine
   */
  start() {
    this.transition('START');
  }

  /**
   * Reset to idle
   */
  reset() {
    this.currentState = 'idle';
    this.context = {
      error: null,
      input: "",
      response: "",
      language: "en",
      isConnected: false,
      isRecording: false,
      sessionId: null,
      audioUrl: null,
      vadEnabled: true,
      speechDetected: false,
      speechStartTime: null,
      silenceStartTime: null,
      speechFrames: [],
      vadConfidence: 0,
      autoRecording: true
    };
    this.notifyListeners('reset');
  }
}

// Make globally available
window.VADIntegratedStateMachine = VADIntegratedStateMachine;
