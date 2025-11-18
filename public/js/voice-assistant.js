/**
 * Sophisticated Voice Assistant Client with XState
 * 
 * Manages voice conversations using state machine for clean state management
 * and sophisticated conversation flow control.
 */

class VoiceAssistant {
  constructor() {
    this.stateMachine = new VoiceAssistantStateMachine();
    this.wsClient = new GeminiLiveWebSocketClient();
    this.voiceClient = new EnhancedVoiceClient(); // Use enhanced client with VAD
    this.isInitialized = false;
    this.messageCount = 0;
    this.audioQueue = [];
    this.isPlaying = false;
    
    // DOM elements
    this.elements = {
      chatMessages: document.getElementById('chat-messages'),
      textInput: document.getElementById('text-input'),
      sendBtn: document.getElementById('send-btn'),
      voiceBtn: document.getElementById('voice-btn'),
      recordingIndicator: document.getElementById('recording-indicator'),
      languageSelect: document.getElementById('language-select'),
      clearChatBtn: document.getElementById('clear-chat-btn'),
      connectionDot: document.getElementById('connection-dot'),
      connectionText: document.getElementById('connection-text'),
      welcomeOverlay: document.getElementById('welcome-overlay'),
      startChatBtn: document.getElementById('start-chat-btn'),
      settingsPanel: document.getElementById('settings-panel'),
      settingsToggle: document.getElementById('settings-toggle'),
      // VAD controls
      vadThreshold: document.getElementById('vad-threshold'),
      vadThresholdValue: document.getElementById('vad-threshold-value'),
      autoRecord: document.getElementById('auto-record'),
      autoStop: document.getElementById('auto-stop'),
      silenceTimeout: document.getElementById('silence-timeout')
    };
    
    this.setupStateMachineListeners();
    this.setupWebSocketListeners();
    this.setupVoiceListeners();
  }

  /**
   * Setup state machine event listeners
   */
  setupStateMachineListeners() {
    this.stateMachine.on('stateChange', (data) => {
      console.log('[VoiceAssistant] State changed:', data);
      this.updateUIForState(data.currentState);
    });

    this.stateMachine.on('speechProcessed', (data) => {
      console.log('[VoiceAssistant] Speech processed:', data);
      this.addMessage('user', data.text, data.language);
    });

    this.stateMachine.on('audioReady', (data) => {
      console.log('[VoiceAssistant] Audio ready:', data);
      this.playAudio(data.audioUrl);
    });

    this.stateMachine.on('error', (data) => {
      console.error('[VoiceAssistant] Error:', data);
      this.showError(data.error);
    });

    this.stateMachine.on('errorCleared', () => {
      console.log('[VoiceAssistant] Error cleared');
      this.clearError();
    });
  }

  /**
   * Setup WebSocket event listeners
   */
  setupWebSocketListeners() {
    this.wsClient.on('connected', () => {
      console.log('[VoiceAssistant] WebSocket connected');
      this.stateMachine.context.isConnected = true;
      this.updateConnectionStatus(true);
    });

    this.wsClient.on('disconnected', () => {
      console.log('[VoiceAssistant] WebSocket disconnected');
      this.stateMachine.context.isConnected = false;
      this.updateConnectionStatus(false);
      this.stateMachine.transition('ERROR', 'Connection lost');
    });

    this.wsClient.on('serviceStatus', (data) => {
      console.log('[VoiceAssistant] Service status:', data);
      if (data.geminiLiveAvailable) {
        this.stateMachine.transition('READY');
      } else {
        this.stateMachine.transition('ERROR', data.message);
      }
    });

    this.wsClient.on('sessionStarted', (data) => {
      console.log('[VoiceAssistant] Session started:', data);
      this.stateMachine.context.sessionId = data.sessionId;
    });

    this.wsClient.on('audioResponse', (data) => {
      console.log('[VoiceAssistant] Audio response received');
      this.stateMachine.transition('AUDIO_READY', data.audioUrl);
    });

    this.wsClient.on('textResponse', (data) => {
      console.log('[VoiceAssistant] Text response received:', data);
      this.addMessage('assistant', data.text, data.language);
    });

    this.wsClient.on('error', (data) => {
      console.error('[VoiceAssistant] WebSocket error:', data);
      this.stateMachine.transition('ERROR', data.message);
    });
  }

  /**
   * Setup voice client event listeners with VAD support
   */
  setupVoiceListeners() {
    this.voiceClient.on('recordingStarted', () => {
      console.log('[VoiceAssistant] Recording started');
      this.stateMachine.context.isRecording = true;
      this.stateMachine.transition('SPEECH_START');
    });

    this.voiceClient.on('recordingStopped', () => {
      console.log('[VoiceAssistant] Recording stopped');
      this.stateMachine.context.isRecording = false;
      this.stateMachine.transition('SPEECH_END');
    });

    this.voiceClient.on('audioData', (data) => {
      console.log('[VoiceAssistant] Audio data received');
      this.sendAudioData(data);
    });

    // VAD-specific events
    this.voiceClient.on('speechStarted', (data) => {
      console.log('[VoiceAssistant] Speech detected by VAD:', data);
      this.stateMachine.transition('SPEECH_START');
    });

    this.voiceClient.on('speechEnded', (data) => {
      console.log('[VoiceAssistant] Speech ended by VAD:', data);
      this.stateMachine.transition('SPEECH_END');
    });

    this.voiceClient.on('vadError', (error) => {
      console.error('[VoiceAssistant] VAD error:', error);
      this.stateMachine.transition('ERROR', error.error);
    });

    this.voiceClient.on('error', (error) => {
      console.error('[VoiceAssistant] Voice client error:', error);
      this.stateMachine.transition('ERROR', error.message);
    });
  }

  /**
   * Initialize the voice assistant
   */
  async init() {
    try {
      console.log('[VoiceAssistant] Initializing...');
      
      // Validate DOM elements
      const missingElements = [];
      for (const [key, element] of Object.entries(this.elements)) {
        if (!element) {
          missingElements.push(key);
        }
      }
      
      if (missingElements.length > 0) {
        throw new Error(`Missing DOM elements: ${missingElements.join(', ')}`);
      }

      // Setup event listeners
      this.setupEventListeners();
      
      // Initialize voice client
      await this.voiceClient.init();
      
      // Connect WebSocket
      await this.wsClient.connect();
      
      this.isInitialized = true;
      console.log('[VoiceAssistant] Initialized successfully');
      
      // Start the state machine
      this.stateMachine.start();
      
    } catch (error) {
      console.error('[VoiceAssistant] Initialization failed:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Setup DOM event listeners
   */
  setupEventListeners() {
    // Voice button
    this.elements.voiceBtn.addEventListener('click', () => {
      this.toggleVoiceRecording();
    });

    // Send button
    this.elements.sendBtn.addEventListener('click', () => {
      this.sendTextMessage();
    });

    // Text input
    this.elements.textInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.sendTextMessage();
      }
    });

    // Clear chat
    this.elements.clearChatBtn.addEventListener('click', () => {
      this.clearChat();
    });

    // Language selection
    this.elements.languageSelect.addEventListener('change', (e) => {
      this.stateMachine.context.language = e.target.value;
    });

    // Settings toggle
    this.elements.settingsToggle.addEventListener('click', () => {
      this.toggleSettings();
    });

    // Start chat button
    this.elements.startChatBtn.addEventListener('click', () => {
      this.startChat();
    });

    // VAD configuration controls
    if (this.elements.vadThreshold) {
      this.elements.vadThreshold.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        this.elements.vadThresholdValue.textContent = value.toFixed(1);
        this.configureVAD({ threshold: value });
      });
    }

    if (this.elements.autoRecord) {
      this.elements.autoRecord.addEventListener('change', (e) => {
        this.configureVAD({ autoStartRecording: e.target.checked });
      });
    }

    if (this.elements.autoStop) {
      this.elements.autoStop.addEventListener('change', (e) => {
        this.configureVAD({ autoStopRecording: e.target.checked });
      });
    }

    if (this.elements.silenceTimeout) {
      this.elements.silenceTimeout.addEventListener('change', (e) => {
        this.configureVAD({ silenceTimeout: parseInt(e.target.value) });
      });
    }
  }

  /**
   * Toggle voice recording
   */
  toggleVoiceRecording() {
    const currentState = this.stateMachine.getCurrentState();
    
    if (currentState === 'ready' || currentState === 'idle') {
      this.startVoiceRecording();
    } else if (currentState === 'listening') {
      this.stopVoiceRecording();
    } else if (currentState === 'interrupted') {
      this.resumeVoiceRecording();
    } else {
      console.warn('[VoiceAssistant] Cannot toggle recording in state:', currentState);
    }
  }

  /**
   * Start voice recording
   */
  async startVoiceRecording() {
    try {
      console.log('[VoiceAssistant] Starting voice recording...');
      this.stateMachine.transition('LISTEN');
      await this.voiceClient.startRecording();
      this.updateVoiceButton('recording');
    } catch (error) {
      console.error('[VoiceAssistant] Failed to start recording:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Stop voice recording
   */
  async stopVoiceRecording() {
    try {
      console.log('[VoiceAssistant] Stopping voice recording...');
      await this.voiceClient.stopRecording();
      this.updateVoiceButton('ready');
    } catch (error) {
      console.error('[VoiceAssistant] Failed to stop recording:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Resume voice recording
   */
  async resumeVoiceRecording() {
    try {
      console.log('[VoiceAssistant] Resuming voice recording...');
      this.stateMachine.transition('RESUME');
      await this.voiceClient.startRecording();
      this.updateVoiceButton('recording');
    } catch (error) {
      console.error('[VoiceAssistant] Failed to resume recording:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Send text message
   */
  async sendTextMessage() {
    const text = this.elements.textInput.value.trim();
    if (!text) return;

    try {
      console.log('[VoiceAssistant] Sending text message:', text);
      this.addMessage('user', text);
      this.elements.textInput.value = '';
      
      // Send via WebSocket
      await this.wsClient.sendTextMessage(text);
      
    } catch (error) {
      console.error('[VoiceAssistant] Failed to send text message:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Send audio data
   */
  async sendAudioData(audioData) {
    try {
      console.log('[VoiceAssistant] Sending audio data...');
      await this.wsClient.sendAudioData(audioData);
    } catch (error) {
      console.error('[VoiceAssistant] Failed to send audio data:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Play audio response
   */
  async playAudio(audioUrl) {
    try {
      console.log('[VoiceAssistant] Playing audio:', audioUrl);
      this.isPlaying = true;
      this.updateVoiceButton('playing');
      
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        this.isPlaying = false;
        this.updateVoiceButton('ready');
        this.stateMachine.transition('END');
      };
      
      await audio.play();
      
    } catch (error) {
      console.error('[VoiceAssistant] Failed to play audio:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Update UI for current state
   */
  updateUIForState(state) {
    console.log('[VoiceAssistant] Updating UI for state:', state);
    
    // Update voice button
    switch (state) {
      case 'idle':
        this.updateVoiceButton('disabled');
        break;
      case 'ready':
        this.updateVoiceButton('ready');
        break;
      case 'listening':
        this.updateVoiceButton('recording');
        break;
      case 'processing':
        this.updateVoiceButton('processing');
        break;
      case 'responding':
        this.updateVoiceButton('playing');
        break;
      case 'error':
        this.updateVoiceButton('error');
        break;
      default:
        this.updateVoiceButton('ready');
    }
  }

  /**
   * Update voice button appearance
   */
  updateVoiceButton(state) {
    const btn = this.elements.voiceBtn;
    const indicator = this.elements.recordingIndicator;
    
    // Remove all state classes
    btn.classList.remove('recording', 'processing', 'playing', 'error', 'disabled');
    indicator.style.display = 'none';
    
    switch (state) {
      case 'ready':
        btn.textContent = '🎤';
        btn.disabled = false;
        break;
      case 'recording':
        btn.textContent = '⏹️';
        btn.classList.add('recording');
        indicator.style.display = 'block';
        break;
      case 'processing':
        btn.textContent = '⏳';
        btn.classList.add('processing');
        btn.disabled = true;
        break;
      case 'playing':
        btn.textContent = '🔊';
        btn.classList.add('playing');
        btn.disabled = true;
        break;
      case 'error':
        btn.textContent = '❌';
        btn.classList.add('error');
        break;
      case 'disabled':
        btn.textContent = '🎤';
        btn.disabled = true;
        btn.classList.add('disabled');
        break;
    }
  }

  /**
   * Add message to chat
   */
  addMessage(sender, text, language = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = sender === 'user' ? '👤' : '🤖';
    
    const content = document.createElement('div');
    content.className = 'message-content';
    
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.textContent = text;
    
    const metaDiv = document.createElement('div');
    metaDiv.className = 'message-meta';
    metaDiv.textContent = new Date().toLocaleTimeString();
    
    if (language && language !== 'en') {
      const langDiv = document.createElement('div');
      langDiv.className = 'message-language';
      langDiv.textContent = `🌐 ${language}`;
      metaDiv.appendChild(langDiv);
    }
    
    content.appendChild(textDiv);
    content.appendChild(metaDiv);
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);
    
    this.elements.chatMessages.appendChild(messageDiv);
    this.elements.chatMessages.scrollTop = this.elements.chatMessages.scrollHeight;
    
    this.messageCount++;
  }

  /**
   * Show error message
   */
  showError(message) {
    console.error('[VoiceAssistant] Error:', message);
    this.addMessage('system', `❌ ${message}`);
  }

  /**
   * Clear error
   */
  clearError() {
    // Remove any error messages from the chat
    const errorMessages = this.elements.chatMessages.querySelectorAll('.system-message');
    errorMessages.forEach(msg => {
      if (msg.textContent.includes('❌')) {
        msg.remove();
      }
    });
  }

  /**
   * Update connection status
   */
  updateConnectionStatus(connected) {
    this.elements.connectionDot.className = connected ? 'status-dot connected' : 'status-dot disconnected';
    this.elements.connectionText.textContent = connected ? 'Connected' : 'Disconnected';
  }

  /**
   * Clear chat
   */
  clearChat() {
    this.elements.chatMessages.innerHTML = '';
    this.messageCount = 0;
    this.stateMachine.reset();
  }

  /**
   * Toggle settings panel
   */
  toggleSettings() {
    this.elements.settingsPanel.classList.toggle('hidden');
  }

  /**
   * Start chat
   */
  startChat() {
    this.elements.welcomeOverlay.style.display = 'none';
    this.elements.chatInterface.style.display = 'block';
    this.stateMachine.start();
  }

  /**
   * Get current state
   */
  getCurrentState() {
    return this.stateMachine.getCurrentState();
  }

  /**
   * Get context
   */
  getContext() {
    return this.stateMachine.getContext();
  }

  /**
   * Configure VAD settings
   */
  configureVAD(options = {}) {
    console.log('[VoiceAssistant] Configuring VAD:', options);
    this.voiceClient.configureVAD(options);
  }

  /**
   * Get VAD statistics
   */
  getVADStats() {
    return this.voiceClient.getVADStats();
  }

  /**
   * Get VAD configuration
   */
  getVADConfiguration() {
    return this.voiceClient.getVADConfiguration();
  }

  /**
   * Reset VAD state
   */
  resetVAD() {
    console.log('[VoiceAssistant] Resetting VAD state');
    this.voiceClient.resetVAD();
  }
}

// Make globally available
window.VoiceAssistant = VoiceAssistant;
