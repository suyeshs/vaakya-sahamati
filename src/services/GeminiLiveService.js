/**
 * Gemini Live Service - Bidirectional Audio Streaming with Gemini 2.0
 * Implements speech-to-speech conversations using Vertex AI Multimodal Live API
 */

const { VertexAI } = require('@google-cloud/vertexai');
const { GoogleAuth } = require('google-auth-library');
const { logger } = require('../utils/logger');
const { Readable, Writable } = require('stream');
const config = require('../config');

class GeminiLiveService {
  constructor(env) {
    this.env = env;
    this.projectId = env.PROJECT_ID || config.googleCloud.projectId || 'sahamati-labs';
    this.location = env.LOCATION || config.vertexAI.location || 'us-central1';
    this.model = env.GEMINI_LIVE_MODEL || config.geminiLive.model || 'gemini-live-2.5-flash';
    this.apiKey = env.GOOGLE_API_KEY || config.geminiLive.apiKey;
    this.baseUrl = config.geminiLive.baseUrl;
    this.supportsAudioOutput = config.geminiLive.supportsAudioOutput;
    this.supportsRealTime = config.geminiLive.supportsRealTime;
    this.vertexAI = null;
    this.activeSessions = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize Vertex AI client
      this.vertexAI = new VertexAI({
        project: this.projectId,
        location: this.location
      });

      // Initialize Google Auth for REST API calls
      this.auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform']
      });

      logger.info('[GeminiLiveService] Initialized', {
        projectId: this.projectId,
        location: this.location,
        model: this.model
      });

      this.initialized = true;
    } catch (error) {
      logger.error('[GeminiLiveService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get access token for REST API calls
   */
  async getAccessToken() {
    // Use API key instead of service account authentication
    const apiKey = this.env.GOOGLE_API_KEY;
    
    // Debug: Log all environment variables
    logger.info('[GeminiLiveService] Environment debug:', {
      hasApiKey: !!apiKey,
      keyPrefix: apiKey ? apiKey.substring(0, 10) + '...' : 'undefined',
      keyLength: apiKey ? apiKey.length : 0,
      allEnvKeys: Object.keys(this.env).filter(key => key.includes('GOOGLE') || key.includes('GEMINI')),
      model: this.env.GEMINI_LIVE_MODEL
    });
    
    if (!apiKey) {
      throw new Error('GOOGLE_API_KEY environment variable is not set');
    }
    
    return apiKey;
  }

  /**
   * Create a new live session
   * @param {Object} options - Session options
   * @param {string} options.sessionId - Unique session identifier
   * @param {string} options.language - Language code (e.g., 'hi', 'en')
   * @param {string} options.systemInstruction - System prompt for the AI
   * @param {Object} options.conversationContext - Previous conversation history
   * @returns {Object} Session object
   */
  async createSession(options = {}) {
    const {
      sessionId,
      language = 'en',
      systemInstruction,
      conversationContext = {}
    } = options;

    if (!this.initialized) {
      await this.initialize();
    }

    try {
      // Get language-specific configuration
      const langConfig = this.getLanguageConfig(language);

      // Build system instruction with context
      const fullSystemInstruction = this.buildSystemInstruction(
        systemInstruction,
        language,
        conversationContext
      );

      // Create generative model with Live API configuration
      const generativeModel = this.vertexAI.getGenerativeModel({
        model: this.model,
        systemInstruction: fullSystemInstruction,
        generationConfig: {
          temperature: 0.8,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 2048,
          // responseMimeType for audio will be set per request
        },
        safetySettings: [
          {
            category: 'HARM_CATEGORY_HATE_SPEECH',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          },
          {
            category: 'HARM_CATEGORY_HARASSMENT',
            threshold: 'BLOCK_MEDIUM_AND_ABOVE'
          }
        ]
      });

      // Create session object
      const session = {
        id: sessionId,
        language,
        langConfig,
        model: generativeModel,
        systemInstruction: fullSystemInstruction,
        createdAt: Date.now(),
        lastActivityAt: Date.now(),
        audioBuffer: [],
        responseBuffer: [],
        isActive: true
      };

      // Store session
      this.activeSessions.set(sessionId, session);

      logger.info('[GeminiLiveService] Session created', {
        sessionId,
        language,
        languageName: langConfig.name
      });

      return session;
    } catch (error) {
      logger.error('[GeminiLiveService] Session creation failed:', error);
      throw error;
    }
  }

  /**
   * Send audio chunk to Gemini Live for processing
   * @param {string} sessionId - Session identifier
   * @param {Buffer} audioChunk - Audio data chunk
   * @param {Object} options - Audio options
   * @returns {AsyncGenerator} Stream of audio responses
   */
  async* processAudioStream(sessionId, audioChunk, options = {}) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      // Update session activity
      session.lastActivityAt = Date.now();

      logger.info('[GeminiLiveService] Processing audio with Gemini Live REST API', {
        sessionId,
        chunkSize: audioChunk.length,
        mimeType: options.mimeType || 'audio/opus',
        model: this.model
      });

      // Get access token for REST API
      const accessToken = await this.getAccessToken();

      // Prepare request body for Gemini REST API with audio output
      const requestBody = {
        contents: [{
          role: 'user',
          parts: [{
            inline_data: {
              mime_type: 'audio/mp3',
              data: audioChunk.toString('base64')
            }
          }]
        }],
        systemInstruction: {
          parts: [{ text: session.systemInstruction }]
        },
        generationConfig: {
          temperature: config.geminiLive.temperature,
          topP: config.geminiLive.topP,
          topK: config.geminiLive.topK,
          maxOutputTokens: config.geminiLive.maxOutputTokens,
          // Enable audio output for Live API
          responseModalities: this.supportsAudioOutput ? ['AUDIO'] : undefined,
          speechConfig: this.supportsAudioOutput ? {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName: 'Puck' // Multilingual voice optimized for Indian languages
              }
            }
          } : undefined
        }
      };

      // Call Gemini Live API with API key
      const apiUrl = `${this.baseUrl}/models/${this.model}:streamGenerateContent?key=${accessToken}`;

      logger.info('[GeminiLiveService] Calling Gemini REST API', {
        url: apiUrl,
        sessionId,
        model: this.model,
        requestBodySize: JSON.stringify(requestBody).length
      });

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      // Process streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponseText = '';
      let hasAudioResponse = false;

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (!line.trim() || line.trim() === 'data:') continue;

          try {
            // Parse JSON response
            const jsonLine = line.replace(/^data:\s*/, '');
            const chunk = JSON.parse(jsonLine);

            if (chunk.candidates && chunk.candidates[0]) {
              const candidate = chunk.candidates[0];
              
              if (candidate.content && candidate.content.parts) {
                for (const part of candidate.content.parts) {
                  // Check for text
                  if (part.text) {
                    fullResponseText += part.text;
                    
                    yield {
                      type: 'text_response',
                      data: {
                        text: part.text,
                        fullText: fullResponseText
                      },
                      timestamp: Date.now()
                    };
                  }

                  // Check for audio response
                  if (part.inlineData && part.inlineData.mimeType && part.inlineData.mimeType.startsWith('audio/')) {
                    hasAudioResponse = true;
                    
                    yield {
                      type: 'audio_response',
                      data: {
                        audio: part.inlineData.data,
                        format: 'opus',
                        mimeType: part.inlineData.mimeType
                      },
                      timestamp: Date.now()
                    };

                    logger.info('[GeminiLiveService] Audio response received', {
                      sessionId,
                      mimeType: part.inlineData.mimeType,
                      dataLength: part.inlineData.data.length
                    });
                  }
                }
              }
            }
          } catch (parseError) {
            logger.warn('[GeminiLiveService] Failed to parse chunk:', parseError.message);
          }
        }
      }

      logger.info('[GeminiLiveService] Audio stream processed via REST API', {
        sessionId,
        hasAudio: hasAudioResponse,
        hasText: fullResponseText.length > 0,
        textLength: fullResponseText.length
      });

    } catch (error) {
      logger.error('[GeminiLiveService] Audio processing failed:', {
        sessionId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Process text message (fallback for text-only interactions)
   * @param {string} sessionId - Session identifier
   * @param {string} text - Text message
   * @returns {AsyncGenerator} Stream of responses
   */
  async* processTextStream(sessionId, text) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    try {
      session.lastActivityAt = Date.now();

      const streamingResp = await session.model.generateContentStream({
        contents: [
          {
            role: 'user',
            parts: [{ text }]
          }
        ]
      });

      for await (const chunk of streamingResp.stream) {
        // Handle different response structures
        let chunkText = '';
        
        if (typeof chunk.text === 'function') {
          chunkText = chunk.text();
        } else if (chunk.candidates && chunk.candidates[0]?.content?.parts) {
          chunkText = chunk.candidates[0].content.parts.map(part => part.text || '').join('');
        } else if (chunk.text) {
          chunkText = chunk.text;
        } else {
          logger.warn('[GeminiLiveService] Unknown chunk format:', JSON.stringify(chunk));
          continue;
        }
        
        if (chunkText) {
          yield {
            type: 'text',
            data: chunkText,
            timestamp: Date.now()
          };
        }
      }

      logger.info('[GeminiLiveService] Text processed', {
        sessionId,
        textLength: text.length
      });

    } catch (error) {
      logger.error('[GeminiLiveService] Text processing failed:', error);
      throw error;
    }
  }

  /**
   * End a live session
   * @param {string} sessionId - Session identifier
   */
  async endSession(sessionId) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      logger.warn('[GeminiLiveService] Session not found for ending', { sessionId });
      return;
    }

    try {
      session.isActive = false;
      this.activeSessions.delete(sessionId);

      logger.info('[GeminiLiveService] Session ended', {
        sessionId,
        duration: Date.now() - session.createdAt
      });

    } catch (error) {
      logger.error('[GeminiLiveService] Session ending failed:', error);
    }
  }

  /**
   * Get language-specific configuration
   * @param {string} languageCode - Language code
   * @returns {Object} Language configuration
   */
  getLanguageConfig(languageCode) {
    const languages = {
      'auto': { name: 'Auto-Detect', code: 'auto', voiceGender: 'FEMALE' },
      'en': { name: 'English', code: 'en-US', voiceGender: 'FEMALE' },
      'hi': { name: 'Hindi', code: 'hi-IN', voiceGender: 'FEMALE' },
      'ta': { name: 'Tamil', code: 'ta-IN', voiceGender: 'FEMALE' },
      'te': { name: 'Telugu', code: 'te-IN', voiceGender: 'FEMALE' },
      'bn': { name: 'Bengali', code: 'bn-IN', voiceGender: 'FEMALE' },
      'mr': { name: 'Marathi', code: 'mr-IN', voiceGender: 'FEMALE' },
      'kn': { name: 'Kannada', code: 'kn-IN', voiceGender: 'FEMALE' },
      'gu': { name: 'Gujarati', code: 'gu-IN', voiceGender: 'FEMALE' },
      'ml': { name: 'Malayalam', code: 'ml-IN', voiceGender: 'FEMALE' },
      'pa': { name: 'Punjabi', code: 'pa-IN', voiceGender: 'FEMALE' }
    };

    return languages[languageCode] || languages['auto'];
  }

  /**
   * Build system instruction with context
   * @param {string} baseInstruction - Base system instruction
   * @param {string} language - Language code
   * @param {Object} context - Conversation context
   * @returns {string} Full system instruction
   */
  buildSystemInstruction(baseInstruction, language, context) {
    const langConfig = this.getLanguageConfig(language);
    
    let instruction = baseInstruction || `You are a helpful, friendly AI assistant with multilingual capabilities.`;
    
    // Add AUTO-DETECTION and language matching instructions
    instruction += `\n\nIMPORTANT LANGUAGE INSTRUCTIONS:
- AUTOMATICALLY DETECT the language the user is speaking in
- ALWAYS respond in THE EXACT SAME LANGUAGE as the user
- If user speaks Hindi, respond in Hindi
- If user speaks Tamil, respond in Tamil  
- If user speaks English, respond in English
- If user speaks Telugu, respond in Telugu
- Match the user's dialect, formality, and speaking style
- Be conversational and natural in whichever language is being used
- Keep responses concise but informative
- Use appropriate cultural context for the language being spoken
- For voice responses, use clear pronunciation and natural pacing in the detected language`;

    // Add language hint if provided
    if (language && language !== 'auto') {
      instruction += `\n\nLanguage hint: User may be speaking ${langConfig.name}, but always detect and match their actual language.`;
    }

    // Add conversation context if available
    if (context.conversationSummary) {
      instruction += `\n\nConversation context: ${context.conversationSummary}`;
    }

    if (context.userPreferences) {
      instruction += `\n\nUser preferences: ${JSON.stringify(context.userPreferences)}`;
    }

    return instruction;
  }

  /**
   * Clean up inactive sessions
   * @param {number} timeoutMs - Timeout in milliseconds (default: 5 minutes)
   */
  cleanupInactiveSessions(timeoutMs = 5 * 60 * 1000) {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivityAt > timeoutMs) {
        this.endSession(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.info('[GeminiLiveService] Cleaned up inactive sessions', {
        count: cleanedCount
      });
    }
  }

  /**
   * Get active session count
   * @returns {number} Number of active sessions
   */
  getActiveSessionCount() {
    return this.activeSessions.size;
  }

  /**
   * Get session info
   * @param {string} sessionId - Session identifier
   * @returns {Object} Session information
   */
  getSessionInfo(sessionId) {
    const session = this.activeSessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    return {
      id: session.id,
      language: session.language,
      languageName: session.langConfig.name,
      createdAt: session.createdAt,
      lastActivityAt: session.lastActivityAt,
      duration: Date.now() - session.createdAt,
      isActive: session.isActive
    };
  }
}

module.exports = GeminiLiveService;

