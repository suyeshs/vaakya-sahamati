/**
 * Voice Assistant State Machine - Clean Architecture
 *
 * XState machine that manages the conversation flow and state transitions
 * for the voice assistant. Focused on voice logic with clean separation
 * from performance monitoring and background tasks.
 *
 * @author Developer Team
 * @version 3.0.0
 */

/**
 * Context interface for the voice assistant state machine
 *
 * Minimal context focused on voice processing state only.
 * Performance monitoring is handled separately.
 */
class VoiceAssistantContext {
  constructor() {
    this.error = null;
    this.input = "";
    this.response = "";
    this.language = "en";
    this.isConnected = false;
    this.isRecording = false;
    this.sessionId = null;
    this.audioUrl = null;
  }
}

/**
 * Voice Assistant State Machine Configuration - Clean Architecture
 *
 * Simple state machine focused on voice processing logic:
 * - Clean state transitions
 * - Minimal context for voice data
 * - No performance monitoring (handled separately)
 * - No background services (handled by actors)
 */
class VoiceAssistantStateMachine {
  constructor() {
    this.context = new VoiceAssistantContext();
    this.currentState = 'idle';
    this.listeners = new Map();
    
    // State definitions
    this.states = {
      idle: {
        on: {
          START: 'starting',
          RESPONSE_READY: 'responding',
          CLEAR_ERROR: () => this.clearError()
        }
      },
      starting: {
        timeout: 3000,
        on: {
          READY: 'ready',
          ERROR: (error) => this.handleError(error),
          TIMEOUT: 'error'
        }
      },
      ready: {
        on: {
          LISTEN: 'listening',
          SPEECH_START: 'listening',
          RESPONSE_READY: 'responding',
          CLEAR_ERROR: () => this.clearError(),
          ERROR: (error) => this.handleError(error)
        }
      },
      listening: {
        timeout: 10000,
        on: {
          SPEECH_START: 'listening',
          SPEECH_END: 'processing',
          RESPONSE_READY: 'responding',
          INTERRUPT: 'interrupted',
          CANCEL: 'idle',
          CLEAR_ERROR: () => this.clearError(),
          ERROR: (error) => this.handleError(error),
          TIMEOUT: 'idle'
        }
      },
      processing: {
        timeout: 60000,
        on: {
          SPEECH_PROCESSED: (data) => this.handleSpeechProcessed(data),
          AUDIO_READY: (audioUrl) => this.handleAudioReady(audioUrl),
          INTERRUPT: 'interrupted',
          CLEAR_ERROR: () => this.clearError(),
          ERROR: (error) => this.handleError(error),
          TIMEOUT: 'error'
        }
      },
      responding: {
        on: {
          END: 'ready',
          LISTEN: 'listening',
          INTERRUPT: 'interrupted',
          CLEAR_ERROR: () => this.clearError(),
          ERROR: (error) => this.handleError(error)
        }
      },
      interrupted: {
        on: {
          RESUME: 'listening',
          CANCEL: 'idle',
          CLEAR_ERROR: () => this.clearError(),
          ERROR: (error) => this.handleError(error)
        }
      },
      error: {
        on: {
          RETRY: 'listening',
          READY: 'ready',
          CANCEL: 'idle',
          START: 'starting',
          CLEAR_ERROR: () => this.clearError()
        }
      }
    };
  }

  /**
   * Transition to a new state
   */
  transition(event, data = null) {
    const currentStateConfig = this.states[this.currentState];
    if (!currentStateConfig || !currentStateConfig.on[event]) {
      console.warn(`[StateMachine] Invalid transition: ${this.currentState} -> ${event}`);
      return false;
    }

    const nextState = currentStateConfig.on[event];
    const previousState = this.currentState;
    
    if (typeof nextState === 'function') {
      nextState(data);
    } else {
      this.currentState = nextState;
    }

    console.log(`[StateMachine] ${previousState} -> ${this.currentState} (${event})`);
    this.notifyListeners('stateChange', {
      previousState,
      currentState: this.currentState,
      event,
      context: this.context
    });

    return true;
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
        console.error(`[StateMachine] Listener error for ${event}:`, error);
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
    this.context = new VoiceAssistantContext();
    this.notifyListeners('reset');
  }
}

// Export for use in other modules
window.VoiceAssistantStateMachine = VoiceAssistantStateMachine;
