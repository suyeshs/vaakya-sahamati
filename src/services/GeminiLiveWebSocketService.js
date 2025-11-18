/**
 * Gemini Live WebSocket Service
 * 
 * Handles WebSocket connections to Gemini Live API for real-time audio streaming
 * Uses Bun's native WebSocket support for optimal performance
 */

const { logger } = require('../utils/logger');
const config = require('../config');
const WebSocket = require('ws');
const EventEmitter = require('events');

class GeminiLiveWebSocketService extends EventEmitter {
  constructor(env = {}) {
    super();
    this.env = env;
    this.model = env.GEMINI_LIVE_MODEL || config.geminiLive.model;
    this.apiKey = env.GOOGLE_API_KEY || config.geminiLive.apiKey;
    this.baseUrl = 'wss://generativelanguage.googleapis.com/ws/v1beta';
    this.activeConnections = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    logger.info('[GeminiLiveWebSocket] Service initialized');
  }

  /**
   * Create a new WebSocket connection to Gemini Live API
   */
  async createConnection(sessionId, options = {}) {
    try {
      const wsUrl = `${this.baseUrl}/models/${this.model}:streamGenerateContent?key=${this.apiKey}`;
      
      logger.info('[GeminiLiveWebSocket] Creating connection', {
        sessionId,
        model: this.model,
        url: wsUrl.replace(this.apiKey, '***'),
        fullUrl: wsUrl,
        apiKeyPrefix: this.apiKey.substring(0, 10) + '...'
      });

      // Create WebSocket connection
      const ws = new WebSocket(wsUrl);
      
      // Store connection
      this.activeConnections.set(sessionId, {
        ws,
        sessionId,
        status: 'connecting',
        createdAt: Date.now(),
        options
      });

      // Set up event handlers
      ws.onopen = () => {
        logger.info('[GeminiLiveWebSocket] Connection opened', { sessionId });
        const conn = this.activeConnections.get(sessionId);
        conn.status = 'connected';

        // Send initial setup message
        this.sendSetupMessage(sessionId, options);

        // Give Gemini a moment to process the setup message before marking as active
        // Use 1 second delay to ensure Gemini WebSocket is truly ready
        setTimeout(() => {
          const connection = this.activeConnections.get(sessionId);
          if (connection && connection.status === 'connected') {
            connection.status = 'active';
            this.emit('sessionReady', { sessionId });
            logger.info('[GeminiLiveWebSocket] Session active and ready', { sessionId });
          }
        }, 1000); // 1 second to allow Gemini to fully initialize
      };

      ws.onmessage = (event) => {
        this.handleMessage(sessionId, event);
      };

      ws.onclose = (event) => {
        logger.error('[GeminiLiveWebSocket] Connection closed', { 
          sessionId, 
          code: event.code, 
          reason: event.reason,
          wasClean: event.wasClean,
          url: wsUrl.replace(this.apiKey, '***')
        });
        this.activeConnections.get(sessionId).status = 'closed';
      };

      ws.onerror = (error) => {
        logger.error('[GeminiLiveWebSocket] Connection error', { 
          sessionId, 
          error: error.message,
          errorType: error.type,
          url: wsUrl.replace(this.apiKey, '***')
        });
        this.activeConnections.get(sessionId).status = 'error';
      };

      return ws;

    } catch (error) {
      logger.error('[GeminiLiveWebSocket] Failed to create connection', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Send setup message to configure the session
   */
  sendSetupMessage(sessionId, options) {
    const connection = this.activeConnections.get(sessionId);
    if (!connection || connection.status !== 'connected') {
      throw new Error('Connection not ready');
    }

    const setupMessage = {
      setup: {
        model: this.model,
        generation_config: {
          temperature: config.geminiLive.temperature,
          top_p: config.geminiLive.topP,
          top_k: config.geminiLive.topK,
          max_output_tokens: config.geminiLive.maxOutputTokens,
          response_modalities: ['TEXT', 'AUDIO']
        },
        system_instruction: {
          parts: [{
            text: options.systemInstruction || 'You are a helpful AI assistant with multilingual capabilities. AUTOMATICALLY DETECT the language the user speaks and ALWAYS respond in THE EXACT SAME LANGUAGE.'
          }]
        }
      }
    };

    logger.info('[GeminiLiveWebSocket] Sending setup message', { 
      sessionId,
      setupMessage: JSON.stringify(setupMessage, null, 2)
    });
    connection.ws.send(JSON.stringify(setupMessage));
  }

  /**
   * Send audio data to the Live API
   */
  sendAudioData(sessionId, audioBuffer, options = {}) {
    const connection = this.activeConnections.get(sessionId);
    if (!connection || connection.status !== 'active') {
      throw new Error('Connection not ready');
    }

    logger.info('[GeminiLiveWebSocket] Sending audio data', {
      sessionId,
      audioBufferType: typeof audioBuffer,
      audioBufferLength: audioBuffer.length || audioBuffer.byteLength,
      mimeType: options.mimeType || 'audio/opus'
    });

    let base64Data;
    try {
      // Handle different buffer types
      if (Buffer.isBuffer(audioBuffer)) {
        base64Data = audioBuffer.toString('base64');
      } else if (audioBuffer instanceof Uint8Array) {
        base64Data = Buffer.from(audioBuffer).toString('base64');
      } else if (audioBuffer instanceof ArrayBuffer) {
        base64Data = Buffer.from(audioBuffer).toString('base64');
      } else {
        // Assume it's already a string or can be converted
        base64Data = Buffer.from(audioBuffer).toString('base64');
      }
      
      logger.info('[GeminiLiveWebSocket] Audio data converted to base64', {
        sessionId,
        base64Length: base64Data.length
      });
    } catch (conversionError) {
      logger.error('[GeminiLiveWebSocket] Failed to convert audio to base64', {
        sessionId,
        error: conversionError.message,
        audioBufferType: typeof audioBuffer
      });
      throw new Error(`Failed to convert audio data: ${conversionError.message}`);
    }

    const audioMessage = {
      realtimeInput: {
        mediaChunks: [{
          mimeType: options.mimeType || 'audio/opus',
          data: base64Data
        }]
      }
    };

    logger.info('[GeminiLiveWebSocket] Sending audio data', {
      sessionId,
      audioSize: audioBuffer.length,
      mimeType: options.mimeType
    });

    connection.ws.send(JSON.stringify(audioMessage));
  }

  /**
   * Send text input to the Live API
   */
  sendTextInput(sessionId, text) {
    const connection = this.activeConnections.get(sessionId);
    if (!connection || connection.status !== 'connected') {
      throw new Error('Connection not ready');
    }

    const textMessage = {
      clientContent: {
        turn: {
          userInput: {
            parts: [{
              text: text
            }]
          }
        }
      }
    };

    logger.info('[GeminiLiveWebSocket] Sending text input', { sessionId, text });
    connection.ws.send(JSON.stringify(textMessage));
  }

  /**
   * Handle incoming messages from the Live API
   */
  handleMessage(sessionId, event) {
    try {
      const data = JSON.parse(event.data);
      
      logger.info('[GeminiLiveWebSocket] Received message', {
        sessionId,
        messageType: Object.keys(data)[0]
      });

      // Handle different message types
      if (data.serverContent) {
        this.handleServerContent(sessionId, data.serverContent);
      } else if (data.turnComplete) {
        this.handleTurnComplete(sessionId, data.turnComplete);
      } else if (data.error) {
        this.handleError(sessionId, data.error);
      }

    } catch (error) {
      logger.error('[GeminiLiveWebSocket] Error handling message', {
        sessionId,
        error: error.message
      });
    }
  }

  /**
   * Handle server content (audio/text responses)
   */
  handleServerContent(sessionId, serverContent) {
    if (serverContent.modelTurn && serverContent.modelTurn.parts) {
      for (const part of serverContent.modelTurn.parts) {
        if (part.inlineData && part.inlineData.mimeType.startsWith('audio/')) {
          // Handle audio response
          logger.info('[GeminiLiveWebSocket] Received audio response', {
            sessionId,
            mimeType: part.inlineData.mimeType,
            dataSize: part.inlineData.data.length
          });
          
          // Emit audio response event
          this.emit('audioResponse', {
            sessionId,
            audio: part.inlineData.data,
            mimeType: part.inlineData.mimeType
          });
          
        } else if (part.text) {
          // Handle text response
          logger.info('[GeminiLiveWebSocket] Received text response', {
            sessionId,
            text: part.text.substring(0, 100) + '...'
          });
          
          // Emit text response event
          this.emit('textResponse', {
            sessionId,
            text: part.text
          });
        }
      }
    }
  }

  /**
   * Handle turn completion
   */
  handleTurnComplete(sessionId, turnComplete) {
    logger.info('[GeminiLiveWebSocket] Turn completed', { sessionId });
    this.emit('turnComplete', { sessionId, turnComplete });
  }

  /**
   * Handle errors
   */
  handleError(sessionId, error) {
    logger.error('[GeminiLiveWebSocket] API error', { sessionId, error });
    this.emit('error', { sessionId, error });
  }

  /**
   * Close a connection
   */
  closeConnection(sessionId) {
    const connection = this.activeConnections.get(sessionId);
    if (connection && connection.ws) {
      connection.ws.close();
      this.activeConnections.delete(sessionId);
      logger.info('[GeminiLiveWebSocket] Connection closed', { sessionId });
    }
  }

  /**
   * Get connection status
   */
  getConnectionStatus(sessionId) {
    const connection = this.activeConnections.get(sessionId);
    return connection ? connection.status : 'not_found';
  }

  /**
   * Get all active connections
   */
  getActiveConnections() {
    return Array.from(this.activeConnections.keys());
  }

  /**
   * Clean up inactive connections
   */
  cleanupInactiveConnections(timeoutMs = 300000) { // 5 minutes
    const now = Date.now();
    for (const [sessionId, connection] of this.activeConnections) {
      if (now - connection.createdAt > timeoutMs) {
        this.closeConnection(sessionId);
      }
    }
  }
}

module.exports = GeminiLiveWebSocketService;
