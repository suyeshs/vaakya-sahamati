/**
 * Vertex AI Multimodal Live Service
 * Native audio-to-audio streaming with Gemini 2.5 Flash
 * Uses proper WebSocket bidirectional streaming (not REST API)
 */

const { GoogleAuth } = require('google-auth-library');
// Using Bun's native WebSocket (globally available)
const { logger } = require('../utils/logger');
const SharedFunctionSchema = require('./SharedFunctionSchema');
const config = require('../config');
const OpikClient = require('./OpikClient.js').default;
const sessionPersistenceService = require('./SessionPersistenceService');

class VertexAILiveService {
  constructor(env) {
    this.env = env;
    // Use config with environment variable fallbacks
    this.projectId = config.vertexAILive.projectId;
    this.location = config.vertexAILive.location;
    this.model = config.vertexAILive.model;
    this.vadConfig = config.vertexAILive.automaticActivityDetection;
    this.audioConfig = config.vertexAILive.audio;
    this.generationConfig = config.vertexAILive.generation;
    this.sessionTimeoutConfig = config.vertexAILive.sessionTimeout;
    this.activeSessions = new Map();
    this.conversationHistory = new Map(); // Store conversations by userId
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      logger.info('[VertexAILive] Initializing authentication...', {
        projectId: this.projectId,
        location: this.location,
        model: this.model
      });

      // Initialize Google Auth for access tokens
      this.auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });

      // Test authentication early
      try {
        const testClient = await this.auth.getClient();
        const testToken = await testClient.getAccessToken();
        logger.info('[VertexAILive] ✅ Authentication successful', {
          hasToken: !!testToken?.token,
          tokenPrefix: testToken?.token?.substring(0, 10) + '...'
        });
      } catch (authError) {
        logger.error('[VertexAILive] ❌ Authentication test failed:', {
          error: authError.message,
          code: authError.code,
          details: authError.details
        });
        throw new Error(`Authentication failed: ${authError.message}`);
      }

      logger.info('[VertexAILive] Initialized', {
        projectId: this.projectId,
        location: this.location,
        model: this.model,
        vadEnabled: this.vadConfig.enabled,
        vadTimeout: this.vadConfig.voiceActivityTimeout
      });

      this.initialized = true;
    } catch (error) {
      logger.error('[VertexAILive] Initialization failed:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get access token for WebSocket authentication
   */
  async getAccessToken() {
    try {
      logger.info('[VertexAILive] Getting access token...');
      const client = await this.auth.getClient();
      const accessToken = await client.getAccessToken();

      if (!accessToken || !accessToken.token) {
        throw new Error('Access token is empty or null');
      }

      logger.info('[VertexAILive] ✅ Access token obtained', {
        tokenLength: accessToken.token.length,
        tokenPrefix: accessToken.token.substring(0, 15) + '...'
      });

      return accessToken.token;
    } catch (error) {
      logger.error('[VertexAILive] ❌ Failed to get access token:', {
        error: error.message,
        code: error.code
      });
      throw error;
    }
  }

  /**
   * Create WebSocket URL for Vertex AI Multimodal Live API
   */
  getWebSocketUrl() {
    const modelPath = `projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}`;
    return `wss://${this.location}-aiplatform.googleapis.com/ws/google.cloud.aiplatform.v1beta1.LlmBidiService/BidiGenerateContent`;
  }

  /**
   * Create a new Live API session
   */
  async createSession(sessionId, config = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      const { language = 'en', systemInstruction, userId } = config;

      logger.info('[VertexAILive] Creating session', {
        sessionId,
        language,
        userId: userId || 'anonymous'
      });

      // Get access token for WebSocket auth
      const accessToken = await this.getAccessToken();

      // Create WebSocket connection with access token as query parameter
      // Bun's native WebSocket doesn't support custom headers (browser API standard)
      // So we pass the token as a query parameter instead
      const baseWsUrl = this.getWebSocketUrl();
      const wsUrl = `${baseWsUrl}?access_token=${accessToken}`;

      logger.info('[VertexAILive] Connecting to Vertex AI WebSocket', {
        sessionId,
        url: baseWsUrl, // Don't log the token
        hasToken: !!accessToken
      });

      const ws = new WebSocket(wsUrl);

      // Load previous conversation history if userId provided
      let previousContext = '';
      if (userId) {
        let userHistory = null;

        // Try loading from Firestore first
        try {
          const profile = await sessionPersistenceService.getUserProfile(userId);
          if (profile && profile.conversationHistory && profile.conversationHistory.length > 0) {
            userHistory = profile.conversationHistory;
            // Cache in memory for fast access
            this.conversationHistory.set(userId, userHistory);
            logger.info('[VertexAILive] Loaded conversation history from Firestore', {
              sessionId,
              userId,
              messagesLoaded: userHistory.length
            });
          }
        } catch (error) {
          logger.warn('[VertexAILive] Failed to load from Firestore, falling back to in-memory', {
            sessionId,
            userId,
            error: error.message
          });
        }

        // Fallback to in-memory cache if Firestore failed or empty
        if (!userHistory && this.conversationHistory.has(userId)) {
          userHistory = this.conversationHistory.get(userId);
          logger.info('[VertexAILive] Loaded conversation history from in-memory cache', {
            sessionId,
            userId,
            messagesLoaded: userHistory.length
          });
        }

        // Build context from history
        if (userHistory && userHistory.length > 0) {
          // Get last 10 messages for context
          const recentMessages = userHistory.slice(-10);
          previousContext = '\n\n📝 PREVIOUS CONVERSATION CONTEXT:\n' +
            recentMessages.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n') +
            '\n\nContinue from this context naturally. The user may reference previous topics.\n';
        }
      }

      // Build system instruction using shared fraud protection prompts with language context
      let fullSystemInstruction = systemInstruction || SharedFunctionSchema.buildSystemPrompt('', {}, language);

      // Append previous conversation context if available
      if (previousContext) {
        fullSystemInstruction += previousContext;
      }

      // Get shared function calling schema
      const functionDeclarations = SharedFunctionSchema.getFunctionDeclarations();

      const session = {
        id: sessionId,
        userId,  // For context persistence across sessions
        ws,
        language,
        systemInstruction: fullSystemInstruction,
        functionDeclarations,
        // Opik conversation tracking
        conversation: [],
        currentUserInput: '',
        currentAIOutput: '',
        traceIds: [],
        // Usage metadata tracking
        usageMetadata: {
          totalTokens: 0,
          promptTokens: 0,
          candidatesTokens: 0,
          audioInputTokens: 0,
          audioOutputTokens: 0,
          textInputTokens: 0,
          textOutputTokens: 0,
          lastUpdate: null
        },
        isActive: false,
        isSetupComplete: false,
        audioBuffer: [],
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        setupResolve: null,  // Will be set to resolve promise when setup complete
        keepaliveInterval: null,  // Will store keepalive timer
        isPriming: false,  // Flag to suppress priming response
        inactivityWarningSet: false,  // Track if "are you still there?" prompt was sent (for inactivity)
        inactivityWarningTime: null,  // When the inactivity warning was sent
        durationWarningSet: false,  // Track if "do you want to continue?" prompt was sent (for 2-min duration)
        durationWarningTime: null,  // When the duration warning was sent
        lastLatency: 0,  // Last measured latency in ms
        lastTurnStartTime: null  // Timestamp when last turn started
      };

      // Setup WebSocket event handlers
      this.setupWebSocketHandlers(session);

      // Store session
      this.activeSessions.set(sessionId, session);

      // Wait for connection to open - using browser/Bun standard API
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          logger.error('[VertexAILive] ❌ WebSocket connection timeout after 10s', {
            sessionId,
            wsUrl
          });
          reject(new Error('WebSocket connection timeout after 10 seconds'));
        }, 10000);

        // Use addEventListener with once option for one-time events
        ws.addEventListener('open', () => {
          clearTimeout(timeout);
          logger.info('[VertexAILive] ✅ WebSocket connected successfully', { sessionId });
          resolve();
        }, { once: true });

        ws.addEventListener('error', (error) => {
          clearTimeout(timeout);
          logger.error('[VertexAILive] ❌ WebSocket connection error', {
            sessionId,
            error: error.message || error
          });
          reject(error);
        }, { once: true });
      });

      // Send setup message
      logger.info('[VertexAILive] Sending setup message to Vertex AI...', { sessionId });
      await this.sendSetup(session);

      // Wait for setup to complete
      await new Promise((resolve, reject) => {
        session.setupResolve = resolve;

        const setupTimeout = setTimeout(() => {
          logger.error('[VertexAILive] ❌ Setup timeout after 15s - Vertex AI did not respond', {
            sessionId,
            model: this.model,
            location: this.location
          });
          reject(new Error('Setup timeout - Vertex AI did not respond with setupComplete'));
        }, 15000);  // 15 second timeout

        session.setupResolve = () => {
          clearTimeout(setupTimeout);
          logger.info('[VertexAILive] ✅ Setup complete received from Vertex AI', { sessionId });
          resolve();
        };
      });

      logger.info('[VertexAILive] ✅ Session fully ready', { sessionId });

      // Prime the AI with language context immediately after setup
      await this.primeLanguageContext(session);

      // Start keepalive to prevent connection timeout during silence
      this.startKeepalive(session);

      return session;
    } catch (error) {
      logger.error('[VertexAILive] ❌ Session creation failed:', {
        sessionId,
        error: error.message,
        stack: error.stack,
        code: error.code,
        projectId: this.projectId,
        location: this.location,
        model: this.model
      });
      // Clean up failed session
      if (this.activeSessions.has(sessionId)) {
        const session = this.activeSessions.get(sessionId);
        if (session.ws) {
          try {
            session.ws.close();
          } catch (e) {
            logger.warn('[VertexAILive] Error closing WebSocket during cleanup', { e: e.message });
          }
        }
        this.activeSessions.delete(sessionId);
      }
      throw error;
    }
  }

  /**
   * Prime the AI with language context to ensure correct voice from first response
   * Skips priming for auto-detect mode
   */
  async primeLanguageContext(session) {
    // Skip priming for auto-detect mode
    if (session.language === 'auto') {
      logger.info('[VertexAILive] Skipping language priming for auto-detect mode', {
        sessionId: session.id
      });
      return;
    }
    const languageGreetings = {
      // Indian languages
      'hi': 'नमस्ते! मैं आपकी मदद के लिए यहाँ हूँ।', // Hindi
      'ta': 'வணக்கம்! நான் உங்களுக்கு உதவ இங்கே இருக்கிறேன்.', // Tamil
      'te': 'నమస్కారం! నేను మీకు సహాయం చేయడానికి ఇక్కడ ఉన్నాను.', // Telugu
      'mr': 'नमस्कार! मी तुमच्या मदतीसाठी येथे आहे.', // Marathi
      'bn': 'নমস্কার! আমি আপনাকে সাহায্য করতে এখানে আছি।', // Bengali
      'gu': 'નમસ્તે! હું તમારી મદદ કરવા માટે અહીં છું.', // Gujarati
      'kn': 'ನಮಸ್ಕಾರ! ನಾನು ನಿಮಗೆ ಸಹಾಯ ಮಾಡಲು ಇಲ್ಲಿದ್ದೇನೆ.', // Kannada
      'ml': 'നമസ്കാരം! ഞാൻ നിങ്ങളെ സഹായിക്കാൻ ഇവിടെയുണ്ട്.', // Malayalam
      'pa': 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਮੈਂ ਤੁਹਾਡੀ ਮਦਦ ਕਰਨ ਲਈ ਇੱਥੇ ਹਾਂ.', // Punjabi
      'en': 'Hello! I\'m here to help you.', // Indian English

      // International languages
      'en-US': 'Hello! I\'m here to help you.', // US English
      'en-GB': 'Hello! I\'m here to help you.', // UK English
      'es': '¡Hola! Estoy aquí para ayudarte.', // Spanish
      'fr': 'Bonjour! Je suis là pour vous aider.', // French
      'de': 'Hallo! Ich bin hier, um Ihnen zu helfen.', // German
      'it': 'Ciao! Sono qui per aiutarti.', // Italian
      'pt': 'Olá! Estou aqui para ajudá-lo.', // Portuguese
      'ja': 'こんにちは！お手伝いします。', // Japanese
      'ko': '안녕하세요! 도와드리겠습니다.', // Korean
      'zh': '你好！我来帮助你。', // Chinese
      'ar': 'مرحباً! أنا هنا لمساعدتك.', // Arabic
      'ru': 'Здравствуйте! Я здесь, чтобы помочь вам.', // Russian
      'tr': 'Merhaba! Size yardımcı olmak için buradayım.', // Turkish
      'id': 'Halo! Saya di sini untuk membantu Anda.', // Indonesian
      'vi': 'Xin chào! Tôi ở đây để giúp bạn.', // Vietnamese
      'th': 'สวัสดี! ฉันอยู่ที่นี่เพื่อช่วยคุณ', // Thai
      'pl': 'Cześć! Jestem tutaj, aby ci pomóc.', // Polish
      'nl': 'Hallo! Ik ben hier om je te helpen.', // Dutch
      'uk': 'Привіт! Я тут, щоб допомогти вам.' // Ukrainian
    };

    const greeting = languageGreetings[session.language] || languageGreetings['en'];

    logger.info('[VertexAILive] Priming language context', {
      sessionId: session.id,
      language: session.language,
      greeting: greeting.substring(0, 30) + '...'
    });

    // Set priming flag to suppress the response
    session.isPriming = true;

    // Send initial context as a client content turn
    // This primes the AI to understand the language context without the user hearing it
    const primeMessage = {
      clientContent: {
        turns: [
          {
            role: 'user',
            parts: [
              {
                text: greeting
              }
            ]
          }
        ],
        turnComplete: true
      }
    };

    session.ws.send(JSON.stringify(primeMessage));

    // Wait for the AI to process and respond to the priming message
    // The response will be suppressed by the isPriming flag
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Clear priming flag - next responses go to client
    session.isPriming = false;

    logger.info('[VertexAILive] Language context primed successfully', {
      sessionId: session.id,
      language: session.language
    });
  }

  /**
   * Setup WebSocket event handlers
   * Using Bun's native WebSocket (browser-standard API)
   */
  setupWebSocketHandlers(session) {
    const { ws, id: sessionId } = session;

    // Message handler - browser/Bun standard API
    ws.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);

        // Log all messages for debugging
        logger.info('[VertexAILive] Raw message received:', {
          sessionId,
          messageKeys: Object.keys(message),
          hasSetupComplete: !!message.setupComplete,
          hasServerContent: !!message.serverContent,
          hasToolCall: !!message.toolCall,
          hasToolCallCancellation: !!message.toolCallCancellation
        });

        await this.handleServerMessage(session, message);
      } catch (error) {
        logger.error('[VertexAILive] Message handling error:', error);
      }
    };

    // Close handler - browser/Bun standard API
    ws.onclose = (event) => {
      logger.info('[VertexAILive] WebSocket closed', {
        sessionId,
        code: event.code,
        reason: event.reason
      });
      session.isActive = false;
      this.activeSessions.delete(sessionId);
    };

    // Error handler - browser/Bun standard API
    ws.onerror = (error) => {
      logger.error('[VertexAILive] WebSocket error:', {
        sessionId,
        error: error.message || error
      });
    };
  }

  /**
   * Map language codes to regional variants
   * Returns null for auto-detect mode (omits languageCode from config)
   */
  getLanguageCode(language) {
    // Auto-detect mode - don't set languageCode
    if (language === 'auto') {
      return null;
    }

    const languageMap = {
      // Indian languages
      'en': 'en-IN',    // Indian English
      'hi': 'hi-IN',    // Hindi
      'ta': 'ta-IN',    // Tamil
      'te': 'te-IN',    // Telugu
      'mr': 'mr-IN',    // Marathi
      'bn': 'bn-IN',    // Bengali
      'gu': 'gu-IN',    // Gujarati
      'kn': 'kn-IN',    // Kannada
      'ml': 'ml-IN',    // Malayalam
      'pa': 'pa-IN',    // Punjabi
      'or': 'or-IN',    // Odia

      // International languages (already with region codes)
      'en-US': 'en-US', // US English
      'en-GB': 'en-GB', // UK English
      'es': 'es-ES',    // Spanish
      'fr': 'fr-FR',    // French
      'de': 'de-DE',    // German
      'it': 'it-IT',    // Italian
      'pt': 'pt-BR',    // Portuguese (Brazil)
      'ja': 'ja-JP',    // Japanese
      'ko': 'ko-KR',    // Korean
      'zh': 'zh-CN',    // Chinese (Simplified)
      'ar': 'ar-SA',    // Arabic (Saudi)
      'ru': 'ru-RU',    // Russian
      'tr': 'tr-TR',    // Turkish
      'id': 'id-ID',    // Indonesian
      'vi': 'vi-VN',    // Vietnamese
      'th': 'th-TH',    // Thai
      'pl': 'pl-PL',    // Polish
      'nl': 'nl-NL',    // Dutch
      'uk': 'uk-UA'     // Ukrainian
    };

    return languageMap[language] || 'en-IN'; // Default to Indian English
  }

  /**
   * Send setup message to initialize session
   */
  async sendSetup(session) {
    const modelPath = `projects/${this.projectId}/locations/${this.location}/publishers/google/models/${this.model}`;

    // Get proper language code with regional variant (null for auto-detect)
    const languageCode = this.getLanguageCode(session.language);

    // Build speechConfig - only include languageCode if not auto-detect mode
    const speechConfig = {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: this.audioConfig.voiceName
        }
      }
    };

    // Add languageCode only if specified (not auto-detect)
    if (languageCode) {
      speechConfig.languageCode = languageCode;
    }

    const setupMessage = {
      setup: {
        model: modelPath,
        generationConfig: {
          temperature: this.generationConfig.temperature,
          maxOutputTokens: this.generationConfig.maxOutputTokens,
          responseModalities: this.audioConfig.responseModalities,
          speechConfig: speechConfig
        },
        // CRITICAL: Enable automatic activity detection for natural conversation flow
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: !this.vadConfig.enabled,
            // Convert seconds to milliseconds (config is in seconds, API expects ms)
            silenceDurationMs: Math.round(this.vadConfig.voiceActivityTimeout * 1000)
          }
        },
        systemInstruction: {
          parts: [{ text: session.systemInstruction }]
        },
        tools: [{
          functionDeclarations: session.functionDeclarations
        }]
      }
    };

    const vadTimeoutMs = Math.round(this.vadConfig.voiceActivityTimeout * 1000);

    logger.info('[VertexAILive] Sending setup', {
      sessionId: session.id,
      hasFunctions: session.functionDeclarations.length > 0,
      vadEnabled: this.vadConfig.enabled,
      vadTimeoutSeconds: this.vadConfig.voiceActivityTimeout,
      vadTimeoutMs: vadTimeoutMs,
      voiceName: this.audioConfig.voiceName,
      languageCode: languageCode,
      requestedLanguage: session.language,
      // Log the actual VAD config being sent to Vertex AI
      actualVadConfig: setupMessage.setup.realtimeInputConfig.automaticActivityDetection
    });

    session.ws.send(JSON.stringify(setupMessage));
  }

  /**
   * Handle messages from server
   */
  async handleServerMessage(session, message) {
    const { id: sessionId } = session;

    // Setup complete
    if (message.setupComplete) {
      session.isSetupComplete = true;
      session.isActive = true;
      logger.info('[VertexAILive] Setup complete', { sessionId });

      // Resolve the setup promise if waiting
      if (session.setupResolve) {
        session.setupResolve();
        session.setupResolve = null;
      }

      return;
    }

    // Server content (audio response or function call)
    if (message.serverContent) {
      const { modelTurn, turnComplete } = message.serverContent;

      if (modelTurn && modelTurn.parts) {
        for (const part of modelTurn.parts) {
          // Native audio response from Vertex AI (fast, low latency)
          if (part.inlineData && part.inlineData.mimeType === 'audio/pcm') {
            const audioData = Buffer.from(part.inlineData.data, 'base64');

            // Check if we're in priming phase - suppress priming responses
            if (session.isPriming) {
              logger.info('[VertexAILive] Suppressing priming response audio', {
                sessionId,
                size: audioData.length
              });
              // Don't forward priming response to client
              continue;
            }

            // Calculate latency on first audio response
            if (session.lastTurnStartTime) {
              session.lastLatency = Date.now() - session.lastTurnStartTime;
              session.lastTurnStartTime = null; // Reset for next turn
            }

            logger.info('[VertexAILive] Received native audio chunk', {
              sessionId,
              size: audioData.length,
              latency: session.lastLatency
            });

            // Send audio directly to client
            if (session.onAudioChunk) {
              session.onAudioChunk(audioData);
            }
          }

          // Text response (for debugging and tracking)
          if (part.text) {
            if (session.isPriming) {
              logger.info('[VertexAILive] Suppressing priming response text', {
                sessionId,
                textPreview: part.text.substring(0, 50)
              });
              continue;
            }

            // Accumulate AI output for Opik tracking
            session.currentAIOutput += part.text;

            logger.info('[VertexAILive] Received text', {
              sessionId,
              text: part.text.substring(0, 100)
            });

            // Send text to client for display
            if (session.onTextChunk) {
              session.onTextChunk(part.text);
            }
          }

          // Function call in serverContent (should not happen with AUDIO modality, but keep for safety)
          if (part.functionCall) {
            logger.info('[VertexAILive] Function call in serverContent', {
              sessionId,
              function: part.functionCall.name
            });
          }
        }
      }

      if (turnComplete) {
        logger.info('[VertexAILive] Turn complete', { sessionId });

        // Log conversation exchange to Opik
        if (session.currentUserInput && session.currentAIOutput) {
          this.logToOpik(session).catch(err => {
            logger.error('[Opik] Failed to log trace:', err);
          });
        }
      }
    }

    // Tool call (happens with TEXT responseModalities)
    if (message.toolCall && message.toolCall.functionCalls) {
      logger.info('[VertexAILive] Tool call received', {
        sessionId,
        functionCount: message.toolCall.functionCalls.length
      });

      // Process each function call and synthesize with Google TTS
      for (const functionCall of message.toolCall.functionCalls) {
        logger.info('[VertexAILive] Processing function call', {
          sessionId,
          function: functionCall.name,
          args: functionCall.args
        });

        await this.handleFunctionCall(session, functionCall);
      }
    }

    // Usage metadata - capture and store
    if (message.usageMetadata) {
      const usage = message.usageMetadata;

      // Update session metadata
      session.usageMetadata.totalTokens = usage.totalTokenCount || session.usageMetadata.totalTokens;
      session.usageMetadata.promptTokens = usage.promptTokenCount || session.usageMetadata.promptTokens;
      session.usageMetadata.candidatesTokens = usage.candidatesTokenCount || session.usageMetadata.candidatesTokens;
      session.usageMetadata.lastUpdate = new Date().toISOString();

      // Extract modality-specific tokens if available
      if (usage.responseTokensDetails) {
        for (const detail of usage.responseTokensDetails) {
          if (detail.audioTokens !== undefined) {
            session.usageMetadata.audioOutputTokens = detail.audioTokens;
          }
          if (detail.textTokens !== undefined) {
            session.usageMetadata.textOutputTokens = detail.textTokens;
          }
        }
      }

      if (usage.promptTokensDetails) {
        for (const detail of usage.promptTokensDetails) {
          if (detail.audioTokens !== undefined) {
            session.usageMetadata.audioInputTokens = detail.audioTokens;
          }
          if (detail.textTokens !== undefined) {
            session.usageMetadata.textInputTokens = detail.textTokens;
          }
        }
      }

      logger.info('[VertexAILive] Usage metadata captured', {
        sessionId,
        total: session.usageMetadata.totalTokens,
        prompt: session.usageMetadata.promptTokens,
        candidates: session.usageMetadata.candidatesTokens,
        audioIn: session.usageMetadata.audioInputTokens,
        audioOut: session.usageMetadata.audioOutputTokens
      });
    }
  }

  /**
   * Handle function call from model
   */
  async handleFunctionCall(session, functionCall) {
    const { name, args, id } = functionCall;
    const startTime = Date.now();

    if (name === 'respond_to_financial_query') {
      // Extract the response from function args
      const response = args.response || 'Kya madad chahiye aapko?';
      const cleanResponse = SharedFunctionSchema.validateAndCleanResponse(response);

      logger.info('[VertexAILive] Function response extracted', {
        sessionId: session.id,
        response: cleanResponse,
        topic: args.topic
      });

      // Send function response back to Vertex AI (maintains conversation context)
      const functionResponse = {
        toolResponse: {
          functionResponses: [{
            id: id,
            name: name,
            response: {
              result: cleanResponse
            }
          }]
        }
      };

      session.ws.send(JSON.stringify(functionResponse));

      // Log function call to Opik
      const latency = Date.now() - startTime;
      if (OpikClient && OpikClient.isEnabled()) {
        OpikClient.logFunctionCall({
          session_id: session.id,
          function_name: name,
          function_args: args,
          function_response: { result: cleanResponse },
          timestamp: new Date().toISOString(),
          latency_ms: latency
        }).catch(err => {
          logger.error('[Opik] Failed to log function call:', err);
        });
      }

      // Synthesize text to audio using Google Cloud TTS Neural2 voices (highest quality)
      // COMMENTED OUT - Using native Vertex AI audio instead for faster response
      // try {
      //   const textToSpeech = require('@google-cloud/text-to-speech');
      //   const ttsClient = new textToSpeech.TextToSpeechClient();

      //   // Detect language and get Neural2 voice
      //   const languageCode = this.detectLanguage(cleanResponse);
      //   const voiceName = this.getBestNeuralVoice(languageCode);

      //   const ttsRequest = {
      //     input: { text: cleanResponse },
      //     voice: {
      //       languageCode: languageCode,
      //       name: voiceName
      //     },
      //     audioConfig: {
      //       audioEncoding: 'LINEAR16',
      //       sampleRateHertz: 24000,
      //       speakingRate: 0.95,  // Slightly slower for more natural, conversational pace
      //       pitch: 1.0,  // Slightly higher pitch for warmer, friendlier tone
      //       volumeGainDb: 0.0,
      //       effectsProfileId: ['telephony-class-application']  // Optimized for voice conversations
      //     }
      //   };

      //   logger.info('[VertexAILive] Synthesizing speech', {
      //     sessionId: session.id,
      //     language: languageCode,
      //     voice: voiceName,
      //     textLength: cleanResponse.length
      //   });

      //   const [ttsResponse] = await ttsClient.synthesizeSpeech(ttsRequest);
      //   const audioBuffer = Buffer.from(ttsResponse.audioContent);

      //   logger.info('[VertexAILive] Speech synthesized', {
      //     sessionId: session.id,
      //     audioSize: audioBuffer.length
      //   });

      //   // Send audio to client
      //   if (session.onAudioChunk) {
      //     session.onAudioChunk(audioBuffer);
      //   }
      // } catch (error) {
      //   logger.error('[VertexAILive] TTS synthesis error:', {
      //     sessionId: session.id,
      //     error: error.message,
      //     stack: error.stack
      //   });
      // }
    }
  }

  /**
   * Detect language from text (supports all major Indian languages)
   */
  detectLanguage(text) {
    // Hindi/Devanagari
    if (/[\u0900-\u097F]/.test(text)) return 'hi-IN';
    // Bengali
    if (/[\u0980-\u09FF]/.test(text)) return 'bn-IN';
    // Gujarati
    if (/[\u0A80-\u0AFF]/.test(text)) return 'gu-IN';
    // Kannada
    if (/[\u0C80-\u0CFF]/.test(text)) return 'kn-IN';
    // Malayalam
    if (/[\u0D00-\u0D7F]/.test(text)) return 'ml-IN';
    // Tamil
    if (/[\u0B80-\u0BFF]/.test(text)) return 'ta-IN';
    // Telugu
    if (/[\u0C00-\u0C7F]/.test(text)) return 'te-IN';

    // Default to Indian English
    return 'en-IN';
  }

  /**
   * Get best Neural2 voice for Indian languages
   * Neural2 voices offer the highest quality and most natural sounding speech
   */
  getBestNeuralVoice(languageCode) {
    const neuralVoices = {
      'en-IN': 'en-IN-Neural2-D',  // Female, conversational
      'hi-IN': 'hi-IN-Neural2-D',  // Female, natural
      'bn-IN': 'bn-IN-Wavenet-A',  // Bengali (Neural2 not available yet)
      'gu-IN': 'gu-IN-Wavenet-A',  // Gujarati (Neural2 not available yet)
      'kn-IN': 'kn-IN-Wavenet-A',  // Kannada (Neural2 not available yet)
      'ml-IN': 'ml-IN-Wavenet-A',  // Malayalam (Neural2 not available yet)
      'ta-IN': 'ta-IN-Wavenet-A',  // Tamil (Neural2 not available yet)
      'te-IN': 'te-IN-Wavenet-A'   // Telugu (Neural2 not available yet)
    };

    return neuralVoices[languageCode] || 'en-IN-Neural2-D';
  }

  /**
   * Send audio chunk to model
   */
  async sendAudio(sessionId, audioData) {
    const session = this.activeSessions.get(sessionId);

    if (!session || !session.isActive) {
      throw new Error(`Session ${sessionId} not active`);
    }

    // Convert audio to base64
    const base64Audio = audioData.toString('base64');

    const audioMessage = {
      realtimeInput: {
        mediaChunks: [{
          mimeType: 'audio/pcm',
          data: base64Audio
        }]
      }
    };

    logger.info('[VertexAILive] Sending audio', {
      sessionId,
      size: audioData.length
    });

    session.ws.send(JSON.stringify(audioMessage));
    session.lastActivityAt = Date.now();

    // Track turn start time for latency calculation (only set if not already set)
    if (!session.lastTurnStartTime) {
      session.lastTurnStartTime = Date.now();
    }

    // Reset warnings when user is active
    if (session.inactivityWarningSet) {
      session.inactivityWarningSet = false;
      session.inactivityWarningTime = null;
      logger.info('[VertexAILive] User activity detected, inactivity warning reset', { sessionId });
    }
    if (session.durationWarningSet) {
      session.durationWarningSet = false;
      session.durationWarningTime = null;
      logger.info('[VertexAILive] User activity detected, duration warning reset', { sessionId });
    }
  }

  /**
   * Send turn completion signal (user finished speaking)
   *
   * For Vertex AI Multimodal Live API, when using realtime_input streaming,
   * we don't need to send a separate turn completion message.
   * Instead, we just stop sending audio and the model will detect the end of turn
   * based on silence or we can send a special end-of-turn marker.
   *
   * However, to explicitly signal turn completion, we can send an empty
   * realtime_input message which signals the end of the audio stream for this turn.
   */
  async sendTurnComplete(sessionId) {
    const session = this.activeSessions.get(sessionId);

    if (!session || !session.isActive) {
      throw new Error(`Session ${sessionId} not active`);
    }

    // According to Vertex AI Multimodal Live API docs,
    // we need to send a message indicating the client turn is complete
    // Option 1: Use tool_response format to signal completion
    // Option 2: Just stop sending audio and model detects silence
    // Option 3: Send empty turn to signal completion

    // Let's use the proper format for ending a turn
    const turnCompleteMessage = {
      clientContent: {
        turnComplete: true
      }
    };

    logger.info('[VertexAILive] Sending turn complete', {
      sessionId
    });

    session.ws.send(JSON.stringify(turnCompleteMessage));
    session.lastActivityAt = Date.now();

    // Reset warnings when user completes turn
    if (session.inactivityWarningSet) {
      session.inactivityWarningSet = false;
      session.inactivityWarningTime = null;
      logger.info('[VertexAILive] Turn completed, inactivity warning reset', { sessionId });
    }
    if (session.durationWarningSet) {
      session.durationWarningSet = false;
      session.durationWarningTime = null;
      logger.info('[VertexAILive] Turn completed, duration warning reset', { sessionId });
    }
  }

  /**
   * Start keepalive to prevent WebSocket timeout during silence
   */
  startKeepalive(session) {
    const { id: sessionId } = session;

    // Clear any existing keepalive
    if (session.keepaliveInterval) {
      clearInterval(session.keepaliveInterval);
    }

    const checkInterval = this.sessionTimeoutConfig.checkInterval * 1000; // Convert to milliseconds

    session.keepaliveInterval = setInterval(() => {
      if (session.ws && session.ws.readyState === 1) { // OPEN
        const now = Date.now();
        const sessionDurationMs = now - session.createdAt;
        const sessionDurationSeconds = Math.floor(sessionDurationMs / 1000);
        const inactivityMs = now - session.lastActivityAt;
        const inactivitySeconds = Math.floor(inactivityMs / 1000);

        // PRIORITY 1: Check if no response to duration warning (after 2-min conversation + 1-min no response)
        const warningTimeoutMs = this.sessionTimeoutConfig.warningTimeout * 1000;
        if (session.durationWarningSet && (now - session.durationWarningTime) > warningTimeoutMs) {
          logger.warn('[VertexAILive] No response to duration warning, closing session', {
            sessionId,
            sessionDurationSeconds,
            warningTimeoutSeconds: Math.floor((now - session.durationWarningTime) / 1000)
          });

          // Send goodbye message before closing
          this.sendDurationGoodbye(session).catch(err => {
            logger.error('[VertexAILive] Error sending goodbye:', err);
          }).finally(() => {
            setTimeout(() => {
              this.closeSession(sessionId).catch(err => {
                logger.error('[VertexAILive] Error closing session after duration timeout:', err);
              });
            }, 2000);
          });
          return;
        }

        // PRIORITY 2: Check conversation duration - warn at 2 minutes
        const durationWarningMs = this.sessionTimeoutConfig.durationWarning * 1000;
        if (!session.durationWarningSet && sessionDurationMs > durationWarningMs) {
          logger.info('[VertexAILive] 2 minutes of conversation, asking if user wants to continue', {
            sessionId,
            sessionDurationSeconds
          });
          session.durationWarningSet = true;
          session.durationWarningTime = now;

          // Send prompt asking if user wants to continue
          this.sendDurationWarningPrompt(session).catch(err => {
            logger.error('[VertexAILive] Error sending duration warning:', err);
          });
        }

        // PRIORITY 3: Check inactivity - close if user goes silent for too long
        const inactivityTimeoutMs = this.sessionTimeoutConfig.inactivityTimeout * 1000;
        if (!session.durationWarningSet && inactivityMs > inactivityTimeoutMs) {
          logger.warn('[VertexAILive] Inactivity timeout, closing session', {
            sessionId,
            inactivitySeconds
          });

          // Send goodbye message before closing
          this.sendInactivityGoodbye(session).catch(err => {
            logger.error('[VertexAILive] Error sending goodbye:', err);
          }).finally(() => {
            setTimeout(() => {
              this.closeSession(sessionId).catch(err => {
                logger.error('[VertexAILive] Error closing inactive session:', err);
              });
            }, 2000);
          });
          return;
        }

        logger.debug('[VertexAILive] Keepalive check', {
          sessionId,
          sessionDurationSeconds,
          inactivitySeconds,
          durationWarningSet: session.durationWarningSet
        });
      } else {
        // Connection is closed, stop keepalive
        this.stopKeepalive(session);
      }
    }, checkInterval);

    logger.info('[VertexAILive] Keepalive started', {
      sessionId,
      interval: `${this.sessionTimeoutConfig.checkInterval}s`,
      durationWarning: `${this.sessionTimeoutConfig.durationWarning}s`,
      warningTimeout: `${this.sessionTimeoutConfig.warningTimeout}s`,
      inactivityTimeout: `${this.sessionTimeoutConfig.inactivityTimeout}s`
    });
  }

  /**
   * Stop keepalive timer
   */
  stopKeepalive(session) {
    if (session.keepaliveInterval) {
      clearInterval(session.keepaliveInterval);
      session.keepaliveInterval = null;
      logger.info('[VertexAILive] Keepalive stopped', { sessionId: session.id });
    }
  }

  /**
   * Send inactivity prompt to user
   */
  async sendInactivityPrompt(session) {
    try {
      logger.info('[VertexAILive] Sending inactivity prompt', { sessionId: session.id });

      // Create a text message asking if user is still there
      const languageMap = {
        'hi': 'क्या आप अभी भी वहाँ हैं?',
        'en': 'Are you still there?',
        'ta': 'நீங்கள் இன்னும் இருக்கிறீர்களா?',
        'te': 'మీరు ఇంకా ఉన్నారా?',
        'mr': 'तुम्ही अजूनही तिथे आहात का?',
        'bn': 'আপনি কি এখনও আছেন?',
        'gu': 'શું તમે હજી પણ ત્યાં છો?',
        'kn': 'ನೀವು ಇನ್ನೂ ಇದ್ದೀರಾ?',
        'ml': 'നിങ്ങൾ ഇപ്പോഴും ഉണ്ടോ?',
        'pa': 'ਕੀ ਤੁਸੀਂ ਅਜੇ ਵੀ ਉੱਥੇ ਹੋ?',
        'auto': 'Are you still there?'
      };

      const promptText = languageMap[session.language] || languageMap['en'];

      // Send as model turn to trigger immediate speech response
      const message = {
        clientContent: {
          turns: [{
            role: 'model',
            parts: [{ text: promptText }]
          }],
          turnComplete: true
        }
      };

      session.ws.send(JSON.stringify(message));
      logger.info('[VertexAILive] Inactivity prompt sent', {
        sessionId: session.id,
        language: session.language,
        prompt: promptText
      });

    } catch (error) {
      logger.error('[VertexAILive] Error sending inactivity prompt:', error);
    }
  }

  /**
   * Send goodbye message before closing due to inactivity
   */
  async sendInactivityGoodbye(session) {
    try {
      logger.info('[VertexAILive] Sending goodbye message', { sessionId: session.id });

      const languageMap = {
        'hi': 'ठीक है, बाद में बात करते हैं। धन्यवाद!',
        'en': 'Okay, talk to you later. Thank you!',
        'ta': 'சரி, பிறகு பேசுவோம். நன்றி!',
        'te': 'సరే, తర్వాత మాట్లాడుకుందాం. ధన్యవాదాలు!',
        'mr': 'ठीक आहे, नंतर बोलू. धन्यवाद!',
        'bn': 'ঠিক আছে, পরে কথা বলব। ধন্যবাদ!',
        'gu': 'બરાબર, પછી વાત કરીશું. આભાર!',
        'kn': 'ಸರಿ, ನಂತರ ಮಾತನಾಡೋಣ. ಧನ್ಯವಾದ!',
        'ml': 'ശരി, പിന്നെ സംസാരിക്കാം. നന്ദി!',
        'pa': 'ਠੀਕ ਹੈ, ਬਾਅਦ ਵਿੱਚ ਗੱਲ ਕਰਾਂਗੇ। ਧੰਨਵਾਦ!',
        'auto': 'Okay, talk to you later. Thank you!'
      };

      const goodbyeText = languageMap[session.language] || languageMap['en'];

      const message = {
        clientContent: {
          turns: [{
            role: 'model',
            parts: [{ text: goodbyeText }]
          }],
          turnComplete: true
        }
      };

      session.ws.send(JSON.stringify(message));
      logger.info('[VertexAILive] Goodbye message sent', {
        sessionId: session.id,
        language: session.language
      });

    } catch (error) {
      logger.error('[VertexAILive] Error sending goodbye:', error);
    }
  }

  /**
   * Send duration warning prompt - ask user if they want to continue after 2 minutes
   */
  async sendDurationWarningPrompt(session) {
    try {
      logger.info('[VertexAILive] Sending duration warning prompt', { sessionId: session.id });

      // Create a text message asking if user wants to continue
      const languageMap = {
        'hi': 'क्या आप बात जारी रखना चाहते हैं?',
        'en': 'Would you like to continue the conversation?',
        'ta': 'உங்களுக்கு உரையாடலைத் தொடர விருப்பமா?',
        'te': 'మీరు సంభాషణ కొనసాగించాలనుకుంటున్నారా?',
        'mr': 'तुम्हाला संभाषण सुरू ठेवायचे आहे का?',
        'bn': 'আপনি কি কথা চালিয়ে যেতে চান?',
        'gu': 'શું તમે વાતચીત ચાલુ રાખવા માંગો છો?',
        'kn': 'ನೀವು ಸಂವಾದವನ್ನು ಮುಂದುವರಿಸಲು ಬಯಸುವಿರಾ?',
        'ml': 'നിങ്ങൾ സംഭാഷണം തുടരാൻ ആഗ്രഹിക്കുന്നുണ്ടോ?',
        'pa': 'ਕੀ ਤੁਸੀਂ ਗੱਲਬਾਤ ਜਾਰੀ ਰੱਖਣਾ ਚਾਹੁੰਦੇ ਹੋ?',
        'auto': 'Would you like to continue the conversation?'
      };

      const promptText = languageMap[session.language] || languageMap['en'];

      // Send as model turn to trigger immediate speech response
      const message = {
        clientContent: {
          turns: [{
            role: 'model',
            parts: [{ text: promptText }]
          }],
          turnComplete: true
        }
      };

      session.ws.send(JSON.stringify(message));
      logger.info('[VertexAILive] Duration warning prompt sent', {
        sessionId: session.id,
        language: session.language,
        prompt: promptText
      });

    } catch (error) {
      logger.error('[VertexAILive] Error sending duration warning:', error);
    }
  }

  /**
   * Send goodbye message before closing due to no response to duration warning
   */
  async sendDurationGoodbye(session) {
    try {
      logger.info('[VertexAILive] Sending goodbye after duration timeout', { sessionId: session.id });

      const languageMap = {
        'hi': 'ठीक है, आपकी मदद करके खुशी हुई। फिर मिलेंगे!',
        'en': 'Alright, it was nice helping you. See you again!',
        'ta': 'சரி, உங்களுக்கு உதவியது மகிழ்ச்சி. மீண்டும் சந்திப்போம்!',
        'te': 'సరే, మీకు సహాయం చేయడం ఆనందంగా ఉంది. మళ్లీ కలుద్దాం!',
        'mr': 'ठीक आहे, तुम्हाला मदत करून आनंद झाला. पुन्हा भेटू!',
        'bn': 'ঠিক আছে, আপনাকে সাহায্য করে ভালো লাগলো। আবার দেখা হবে!',
        'gu': 'બરાબર, તમને મદદ કરીને આનંદ થયો. ફરી મળીશું!',
        'kn': 'ಸರಿ, ನಿಮಗೆ ಸಹಾಯ ಮಾಡಲು ಸಂತೋಷವಾಯಿತು. ಮತ್ತೆ ಭೇಟಿಯಾಗೋಣ!',
        'ml': 'ശരി, നിങ്ങളെ സഹായിക്കാൻ സന്തോഷം. വീണ്ടും കാണാം!',
        'pa': 'ਠੀਕ ਹੈ, ਤੁਹਾਡੀ ਮਦਦ ਕਰਕੇ ਖੁਸ਼ੀ ਹੋਈ। ਫਿਰ ਮਿਲਾਂਗੇ!',
        'auto': 'Alright, it was nice helping you. See you again!'
      };

      const goodbyeText = languageMap[session.language] || languageMap['en'];

      const message = {
        clientContent: {
          turns: [{
            role: 'model',
            parts: [{ text: goodbyeText }]
          }],
          turnComplete: true
        }
      };

      session.ws.send(JSON.stringify(message));
      logger.info('[VertexAILive] Duration goodbye sent', {
        sessionId: session.id,
        language: session.language
      });

    } catch (error) {
      logger.error('[VertexAILive] Error sending duration goodbye:', error);
    }
  }

  /**
   * Log conversation exchange to Opik (Gemini Live)
   */
  async logToOpik(session) {
    try {
      if (!OpikClient || !OpikClient.isEnabled()) {
        return;
      }

      const { currentUserInput, currentAIOutput, id: sessionId, language, userId } = session;

      // Add to conversation history
      if (currentUserInput || currentAIOutput) {
        if (currentUserInput) {
          session.conversation.push({
            role: 'user',
            content: currentUserInput
          });
        }
        if (currentAIOutput) {
          session.conversation.push({
            role: 'assistant',
            content: currentAIOutput
          });
        }
      }

      // Log trace to Opik using Gemini Live endpoint
      const traceId = await OpikClient.logGeminiLiveTrace({
        session_id: sessionId,
        user_id: userId || null,
        input: {
          language: language,
          turn_number: Math.floor(session.conversation.length / 2)
        },
        output: {
          text: currentAIOutput,
          language: language
        },
        metadata: {
          latency: session.lastLatency || 0,
          tokens: {
            total: session.usageMetadata.totalTokens,
            audioInput: session.usageMetadata.audioInputTokens,
            audioOutput: session.usageMetadata.audioOutputTokens,
            textInput: session.usageMetadata.textInputTokens,
            textOutput: session.usageMetadata.textOutputTokens
          },
          function_calls: []
        }
      });

      if (traceId) {
        session.traceIds.push(traceId);
      }

      // Reset current exchange
      session.currentUserInput = '';
      session.currentAIOutput = '';

      logger.info('[Opik] Gemini Live trace logged', {
        sessionId,
        traceId,
        conversationLength: session.conversation.length,
        tokens: session.usageMetadata.totalTokens
      });
    } catch (error) {
      logger.error('[Opik] Error logging Gemini Live trace:', error);
    }
  }

  /**
   * Close session
   */
  async closeSession(sessionId) {
    const session = this.activeSessions.get(sessionId);

    if (session) {
      // Stop keepalive
      this.stopKeepalive(session);

      // Evaluate conversation before closing
      if (OpikClient && OpikClient.isEnabled() && session.conversation.length > 0) {
        try {
          await OpikClient.evaluateConversation(
            sessionId,
            session.conversation,
            'conversation_coherence'
          );
          logger.info('[Opik] Conversation evaluated', {
            sessionId,
            turns: session.conversation.length
          });
        } catch (error) {
          logger.error('[Opik] Failed to evaluate conversation:', error);
        }
      }

      // Send context cleanup message before closing
      if (session.ws && session.ws.readyState === 1) { // 1 = OPEN
        try {
          // Send a reset/cleanup signal to clear conversation context
          const cleanupMessage = {
            clientContent: {
              turns: [],
              turnComplete: true
            }
          };
          session.ws.send(JSON.stringify(cleanupMessage));
          logger.info('[VertexAILive] Sent context cleanup', { sessionId });

          // Give it a moment to process before closing
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          logger.warn('[VertexAILive] Context cleanup failed:', error);
        }
      }

      // Close WebSocket
      if (session.ws) {
        session.ws.close();
      }

      // Save conversation history for context persistence
      if (session.userId && session.conversation.length > 0) {
        // Get existing history or create new array
        const existingHistory = this.conversationHistory.get(session.userId) || [];

        // Append current conversation to history
        const updatedHistory = [...existingHistory, ...session.conversation];

        // Keep only last 50 messages to prevent memory overflow
        const trimmedHistory = updatedHistory.slice(-50);

        // Save to in-memory cache (instant)
        this.conversationHistory.set(session.userId, trimmedHistory);

        logger.info('[VertexAILive] Conversation history saved to memory', {
          sessionId,
          userId: session.userId,
          messagesInSession: session.conversation.length,
          totalHistoryMessages: trimmedHistory.length
        });

        // Persist to Firestore in background (non-blocking)
        this.persistConversationToFirestore(session.userId, trimmedHistory)
          .catch(err => {
            logger.error('[VertexAILive] Failed to persist conversation to Firestore:', {
              sessionId,
              userId: session.userId,
              error: err.message
            });
          });
      }

      // Clear session data
      session.audioBuffer = [];
      session.isActive = false;
      session.isSetupComplete = false;

      this.activeSessions.delete(sessionId);
      logger.info('[VertexAILive] Session closed and context cleared', { sessionId });
    }
  }

  /**
   * Set audio chunk callback
   */
  setAudioCallback(sessionId, callback) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.onAudioChunk = callback;
    }
  }

  /**
   * Set text chunk callback
   */
  setTextCallback(sessionId, callback) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.onTextChunk = callback;
    }
  }

  /**
   * Get session
   */
  getSession(sessionId) {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Persist conversation history to Firestore (non-blocking background operation)
   */
  async persistConversationToFirestore(userId, conversationHistory) {
    try {
      // Save entire conversation history to Firestore
      // This replaces the existing history with the latest (last 50 messages)
      await sessionPersistenceService.saveUserProfile(userId, {
        conversationHistory: conversationHistory,
        lastUpdated: new Date().toISOString()
      });

      logger.info('[VertexAILive] Conversation persisted to Firestore', {
        userId,
        messagesCount: conversationHistory.length
      });
    } catch (error) {
      logger.error('[VertexAILive] Firestore persistence failed:', {
        userId,
        error: error.message
      });
      // Don't throw - let it fail gracefully
    }
  }

  /**
   * Cleanup
   */
  async cleanup() {
    for (const [sessionId, session] of this.activeSessions) {
      // Stop keepalive
      this.stopKeepalive(session);

      // Close WebSocket
      if (session.ws) {
        session.ws.close();
      }
    }
    this.activeSessions.clear();
    logger.info('[VertexAILive] Cleanup completed');
  }
}

module.exports = VertexAILiveService;
