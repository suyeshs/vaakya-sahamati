/**
 * Optimized Voice Assistant with VAD-Integrated State Machine
 * 
 * Seamlessly integrates Silero VAD with XState for optimal voice interaction workflow
 */

class OptimizedVoiceAssistant {
  constructor() {
    // Use VAD-integrated state machine
    this.stateMachine = new VADIntegratedStateMachine();
    this.wsClient = new GeminiLiveWebSocketClient();
    this.voiceClient = new EnhancedVoiceClient();
    this.vadService = new SileroVADService();
    
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
      chatInterface: document.querySelector('.chat-container'), // Main chat container
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
    this.setupVADListeners();
  }

  /**
   * Setup VAD-integrated state machine listeners
   */
  setupStateMachineListeners() {
    this.stateMachine.on('stateChange', (data) => {
      console.log('[OptimizedVoiceAssistant] State changed:', data);
      this.updateUIForState(data.currentState);
      this.updateVADConfiguration(data.currentState);
      this.updateRecordingStrategy(data.currentState);
    });

    this.stateMachine.on('speechProcessed', (data) => {
      console.log('[OptimizedVoiceAssistant] Speech processed:', data);
      this.addMessage('user', data.text, data.language);
    });

    this.stateMachine.on('audioReady', (data) => {
      console.log('[OptimizedVoiceAssistant] Audio ready:', data);
      this.playAudio(data.audioUrl);
    });

    this.stateMachine.on('error', (data) => {
      console.error('[OptimizedVoiceAssistant] Error:', data);
      this.showError(data.error);
    });

    this.stateMachine.on('errorCleared', () => {
      console.log('[OptimizedVoiceAssistant] Error cleared');
      this.clearError();
    });
  }

  /**
   * Setup VAD event listeners
   */
  setupVADListeners() {
    this.vadService.on('speechStarted', (data) => {
      console.log('[OptimizedVoiceAssistant] VAD speech started:', data);
      this.stateMachine.transition('VAD_SPEECH_DETECTED', data);
    });

    this.vadService.on('speechEnded', (data) => {
      console.log('[OptimizedVoiceAssistant] VAD speech ended:', data);
      this.stateMachine.transition('VAD_SPEECH_ENDED', data);
    });

    this.vadService.on('error', (data) => {
      console.error('[OptimizedVoiceAssistant] VAD error:', data);
      this.stateMachine.transition('VAD_ERROR', data.error);
    });
  }

  /**
   * Setup WebSocket event listeners
   */
  setupWebSocketListeners() {
    this.wsClient.on('connected', () => {
      console.log('[OptimizedVoiceAssistant] WebSocket connected');
      this.stateMachine.context.isConnected = true;
      this.updateConnectionStatus(true);
      
      // Start a session immediately after connection
      this.startSession();
    });

    this.wsClient.on('disconnected', () => {
      console.log('[OptimizedVoiceAssistant] WebSocket disconnected');
      this.stateMachine.context.isConnected = false;
      this.updateConnectionStatus(false);
      this.stateMachine.transition('ERROR', 'Connection lost');
    });

    this.wsClient.on('serviceStatus', (data) => {
      console.log('[OptimizedVoiceAssistant] Service status:', data);
      if (data.geminiLiveAvailable) {
        this.stateMachine.transition('READY');
      } else {
        this.stateMachine.transition('ERROR', data.message);
      }
    });

    this.wsClient.on('sessionStarted', (data) => {
      console.log('[OptimizedVoiceAssistant] Session started:', data);
      this.stateMachine.context.sessionId = data.sessionId;
      this.stateMachine.context.isSessionActive = true;
    });

    this.wsClient.on('audioResponse', (data) => {
      console.log('[OptimizedVoiceAssistant] Audio response received');
      this.stateMachine.transition('AUDIO_READY', data.audioUrl);
    });

    this.wsClient.on('textResponse', (data) => {
      console.log('[OptimizedVoiceAssistant] Text response received:', data);
      this.addMessage('assistant', data.text, data.language);
    });

    this.wsClient.on('error', (data) => {
      console.error('[OptimizedVoiceAssistant] WebSocket error:', data);
      this.stateMachine.transition('ERROR', data.message);
    });
  }

  /**
   * Setup voice client event listeners
   */
  setupVoiceListeners() {
    this.voiceClient.on('recordingStarted', () => {
      console.log('[OptimizedVoiceAssistant] Recording started');
      this.stateMachine.transition('RECORDING_STARTED');
    });

    this.voiceClient.on('recordingStopped', () => {
      console.log('[OptimizedVoiceAssistant] Recording stopped');
      this.stateMachine.transition('RECORDING_STOPPED');
    });

    this.voiceClient.on('audioData', (data) => {
      console.log('[OptimizedVoiceAssistant] Audio data received:', {
        size: data.size,
        type: data.type,
        timestamp: new Date().toISOString(),
        currentState: this.stateMachine.getCurrentState()
      });
      // Pass the blob directly, not the entire data object
      this.sendAudioData(data.blob);
    });

    this.voiceClient.on('error', (error) => {
      console.error('[OptimizedVoiceAssistant] Voice client error:', error);
      this.stateMachine.transition('ERROR', error.message);
    });
  }

  /**
   * Initialize the optimized voice assistant
   */
  async init() {
    try {
      console.log('[OptimizedVoiceAssistant] Initializing with VAD integration...');
      
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
      
      // Initialize VAD service
      await this.vadService.init();
      this.stateMachine.setVADService(this.vadService);
      
      // Initialize voice client
      await this.voiceClient.init();
      
      // Connect WebSocket
      await this.wsClient.connect();
      
      this.isInitialized = true;
      console.log('[OptimizedVoiceAssistant] Initialized successfully');
      
      // Start the state machine
      this.stateMachine.start();
      
    } catch (error) {
      console.error('[OptimizedVoiceAssistant] Initialization failed:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Update VAD configuration based on current state
   */
  updateVADConfiguration(state) {
    if (!this.stateMachine.shouldVADBeActive()) {
      this.voiceClient.configureVAD({ vadEnabled: false });
      return;
    }

    const vadConfig = this.stateMachine.getVADConfiguration();
    console.log(`[OptimizedVoiceAssistant] Updating VAD config for ${state}:`, vadConfig);
    
    // Enable auto-start for ready and initializing states
    const autoStart = state === 'ready' || state === 'initializing';
    this.voiceClient.configureVAD({
      vadEnabled: true,
      autoStartRecording: autoStart,
      autoStopRecording: true,
      ...vadConfig
    });
  }

  /**
   * Update recording strategy based on current state
   */
  updateRecordingStrategy(state) {
    const strategy = this.stateMachine.getRecordingStrategy();
    console.log(`[OptimizedVoiceAssistant] Recording strategy for ${state}:`, strategy);
    
    // Update voice client with optimized strategy
    this.voiceClient.configureVAD({
      autoStartRecording: strategy.autoStart,
      autoStopRecording: strategy.autoStop,
      silenceTimeout: strategy.timeout
    });
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
    this.setupVADControls();
  }

  /**
   * Setup VAD configuration controls
   */
  setupVADControls() {
    if (this.elements.vadThreshold) {
      this.elements.vadThreshold.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        this.elements.vadThresholdValue.textContent = value.toFixed(1);
        this.configureVAD({ threshold: value });
      });
    }

    if (this.elements.autoRecord) {
      this.elements.autoRecord.addEventListener('change', (e) => {
        this.stateMachine.configureVAD({ autoRecording: e.target.checked });
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
   * Toggle voice recording with state-aware logic
   */
  toggleVoiceRecording() {
    const currentState = this.stateMachine.getCurrentState();
    
    if (currentState === 'ready' || currentState === 'idle') {
      this.startVoiceRecording();
    } else if (currentState === 'recording') {
      this.stopVoiceRecording();
    } else if (currentState === 'interrupted') {
      this.resumeVoiceRecording();
    } else {
      console.warn('[OptimizedVoiceAssistant] Cannot toggle recording in state:', currentState);
    }
  }

  /**
   * Start voice recording
   */
  async startVoiceRecording() {
    try {
      console.log('[OptimizedVoiceAssistant] Starting voice recording...');
      this.stateMachine.transition('MANUAL_RECORD');
      await this.voiceClient.startRecording();
      this.updateVoiceButton('recording');
    } catch (error) {
      console.error('[OptimizedVoiceAssistant] Failed to start recording:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Stop voice recording
   */
  async stopVoiceRecording() {
    try {
      console.log('[OptimizedVoiceAssistant] Stopping voice recording...');
      await this.voiceClient.stopRecording();
      this.updateVoiceButton('ready');
    } catch (error) {
      console.error('[OptimizedVoiceAssistant] Failed to stop recording:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Resume voice recording
   */
  async resumeVoiceRecording() {
    try {
      console.log('[OptimizedVoiceAssistant] Resuming voice recording...');
      this.stateMachine.transition('RESUME');
      await this.voiceClient.startRecording();
      this.updateVoiceButton('recording');
    } catch (error) {
      console.error('[OptimizedVoiceAssistant] Failed to resume recording:', error);
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
      console.log('[OptimizedVoiceAssistant] Sending text message:', text);
      this.addMessage('user', text);
      this.elements.textInput.value = '';
      
      // Send via WebSocket
      await this.wsClient.sendTextMessage(text);
      
    } catch (error) {
      console.error('[OptimizedVoiceAssistant] Failed to send text message:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Start a WebSocket session
   */
  startSession() {
    try {
      console.log('[OptimizedVoiceAssistant] Starting WebSocket session...');
      this.wsClient.startSession({
        language: this.stateMachine.context.language || 'auto',
        sessionId: this.stateMachine.context.sessionId
      });
    } catch (error) {
      console.error('[OptimizedVoiceAssistant] Failed to start session:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Send audio data
   */
  async sendAudioData(audioData) {
    try {
      console.log('[OptimizedVoiceAssistant] sendAudioData called:', {
        audioDataSize: audioData.size,
        audioDataType: audioData.type,
        wsConnected: this.wsClient.isConnected,
        wsSessionActive: this.wsClient.isSessionActive,
        currentState: this.stateMachine.getCurrentState(),
        timestamp: new Date().toISOString()
      });
      
      // Check if session is active
      if (!this.wsClient.isSessionActive) {
        console.log('[OptimizedVoiceAssistant] Session not active, starting session...');
        this.startSession();
        // Wait a bit for session to start
        await new Promise(resolve => setTimeout(resolve, 100));
        console.log('[OptimizedVoiceAssistant] Session start attempted, checking status:', {
          wsConnected: this.wsClient.isConnected,
          wsSessionActive: this.wsClient.isSessionActive
        });
      }
      
      console.log('[OptimizedVoiceAssistant] Sending audio data to WebSocket...');
      await this.wsClient.sendAudioData(audioData);
      console.log('[OptimizedVoiceAssistant] Audio data sent successfully');
    } catch (error) {
      console.error('[OptimizedVoiceAssistant] Failed to send audio data:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Play audio response
   */
  async playAudio(audioUrl) {
    try {
      console.log('[OptimizedVoiceAssistant] Playing audio:', audioUrl);
      this.isPlaying = true;
      this.updateVoiceButton('playing');
      
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        this.isPlaying = false;
        this.updateVoiceButton('ready');
        this.stateMachine.transition('RESPONSE_ENDED');
      };
      
      await audio.play();
      
    } catch (error) {
      console.error('[OptimizedVoiceAssistant] Failed to play audio:', error);
      this.stateMachine.transition('ERROR', error.message);
    }
  }

  /**
   * Update UI for current state with VAD awareness
   */
  updateUIForState(state) {
    console.log('[OptimizedVoiceAssistant] Updating UI for state:', state);
    
    // Update voice button with VAD-aware states
    switch (state) {
      case 'idle':
        this.updateVoiceButton('disabled');
        break;
      case 'ready':
        this.updateVoiceButton('ready');
        break;
      case 'speech_detected':
        this.updateVoiceButton('detecting');
        break;
      case 'recording':
        this.updateVoiceButton('recording');
        break;
      case 'processing_audio':
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
   * Update voice button appearance with VAD states
   */
  updateVoiceButton(state) {
    const btn = this.elements.voiceBtn;
    const indicator = this.elements.recordingIndicator;
    
    // Remove all state classes
    btn.classList.remove('recording', 'processing', 'playing', 'error', 'disabled', 'detecting');
    indicator.style.display = 'none';
    
    switch (state) {
      case 'ready':
        btn.textContent = '🎤';
        btn.disabled = false;
        break;
      case 'detecting':
        btn.textContent = '👂';
        btn.classList.add('detecting');
        indicator.style.display = 'block';
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
    console.error('[OptimizedVoiceAssistant] Error:', message);
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
    // The chat interface is already visible, just hide the welcome overlay
    this.stateMachine.start();
  }

  /**
   * Configure VAD settings
   */
  configureVAD(options = {}) {
    console.log('[OptimizedVoiceAssistant] Configuring VAD:', options);
    this.voiceClient.configureVAD(options);
    this.vadService.configure(options);
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
   * Get VAD statistics
   */
  getVADStats() {
    return {
      stateMachine: this.stateMachine.getContext(),
      voiceClient: this.voiceClient.getVADStats(),
      vadService: this.vadService.getStats()
    };
  }
}

// Make globally available
window.OptimizedVoiceAssistant = OptimizedVoiceAssistant;
