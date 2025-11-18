/**
 * Gemini Live WebSocket Handler
 * Handles bidirectional audio streaming with Gemini 2.0 Multimodal Live API
 */

const { logger } = require('../utils/logger');
const GeminiLiveService = require('../services/GeminiLiveService');

class GeminiLiveWebSocketHandler {
  constructor() {
    this.geminiLiveService = new GeminiLiveService(process.env);
    this.activeSessions = new Map();
  }

  async initialize() {
    await this.geminiLiveService.initialize();
    logger.info('[GeminiLiveWebSocketHandler] Initialized');
  }

  /**
   * Handle new WebSocket connection
   */
  async handleConnection(ws, req) {
    const sessionId = this.generateSessionId();
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    logger.info('[GeminiLiveWS] New connection', {
      sessionId,
      clientIp
    });

    const sessionData = {
      ws,
      sessionId,
      language: 'en',
      isActive: true,
      audioChunks: [],
      connectedAt: Date.now(),
      lastActivityAt: Date.now()
    };

    this.activeSessions.set(sessionId, sessionData);

    // Send session ID to client
    this.sendMessage(ws, {
      type: 'session_started',
      sessionId,
      timestamp: Date.now()
    });

    // Setup message handlers
    ws.on('message', (data) => this.handleMessage(ws, sessionId, data));
    ws.on('close', () => this.handleClose(sessionId));
    ws.on('error', (error) => this.handleError(sessionId, error));
    ws.on('pong', () => this.handlePong(sessionId));

    // Start heartbeat
    this.startHeartbeat(ws, sessionId);
  }

  /**
   * Handle incoming WebSocket messages
   */
  async handleMessage(ws, sessionId, data) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      logger.warn('[GeminiLiveWS] Message for inactive session', { sessionId });
      return;
    }

    session.lastActivityAt = Date.now();

    try {
      // Parse message
      let message;
      if (Buffer.isBuffer(data)) {
        // Binary audio data
        await this.handleAudioChunk(ws, sessionId, data);
        return;
      } else {
        // JSON control message
        message = JSON.parse(data.toString());
      }

      logger.info('[GeminiLiveWS] Received message', {
        sessionId,
        type: message.type
      });

      switch (message.type) {
        case 'start_session':
          await this.startLiveSession(ws, sessionId, message.config);
          break;

        case 'audio_chunk':
          // Base64 encoded audio
          const audioBuffer = Buffer.from(message.data, 'base64');
          await this.handleAudioChunk(ws, sessionId, audioBuffer);
          break;

        case 'text_message':
          await this.handleTextMessage(ws, sessionId, message.text);
          break;

        case 'end_session':
          await this.endLiveSession(ws, sessionId);
          break;

        case 'ping':
          this.sendMessage(ws, { type: 'pong', timestamp: Date.now() });
          break;

        default:
          logger.warn('[GeminiLiveWS] Unknown message type', {
            sessionId,
            type: message.type
          });
      }
    } catch (error) {
      logger.error('[GeminiLiveWS] Message handling error:', error);
      this.sendError(ws, 'Message processing failed: ' + error.message);
    }
  }

  /**
   * Start a Gemini Live session
   */
  async startLiveSession(ws, sessionId, config = {}) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    try {
      const { language = 'en', systemInstruction } = config;
      session.language = language;

      // Create Gemini Live session
      const geminiSession = await this.geminiLiveService.createSession({
        sessionId,
        language,
        systemInstruction
      });

      session.geminiSession = geminiSession;

      this.sendMessage(ws, {
        type: 'session_ready',
        sessionId,
        language,
        timestamp: Date.now()
      });

      logger.info('[GeminiLiveWS] Live session started', {
        sessionId,
        language
      });

    } catch (error) {
      logger.error('[GeminiLiveWS] Session start failed:', error);
      this.sendError(ws, 'Failed to start session: ' + error.message);
    }
  }

  /**
   * Handle audio chunk from client
   */
  async handleAudioChunk(ws, sessionId, audioBuffer) {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.geminiSession) {
      logger.warn('[GeminiLiveWS] Audio chunk for session without Gemini session', {
        sessionId
      });
      return;
    }

    try {
      // Send to Gemini Live for processing
      const audioStream = this.geminiLiveService.processAudioStream(
        sessionId,
        audioBuffer,
        {
          mimeType: 'audio/pcm',
          sampleRate: 16000
        }
      );

      // Stream responses back to client
      for await (const response of audioStream) {
        if (response.type === 'audio') {
          // Send audio response
          this.sendMessage(ws, {
            type: 'audio_response',
            data: response.data.toString('base64'),
            mimeType: response.mimeType,
            timestamp: response.timestamp
          });
        } else if (response.type === 'text') {
          // Send text response (transcript or intermediate)
          this.sendMessage(ws, {
            type: 'text_response',
            text: response.data,
            timestamp: response.timestamp
          });
        }
      }

      logger.info('[GeminiLiveWS] Audio chunk processed', {
        sessionId,
        chunkSize: audioBuffer.length
      });

    } catch (error) {
      logger.error('[GeminiLiveWS] Audio processing error:', error);
      this.sendError(ws, 'Audio processing failed: ' + error.message);
    }
  }

  /**
   * Handle text message (fallback mode)
   */
  async handleTextMessage(ws, sessionId, text) {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.geminiSession) {
      return;
    }

    try {
      const textStream = this.geminiLiveService.processTextStream(sessionId, text);

      let fullResponse = '';
      for await (const chunk of textStream) {
        if (chunk.type === 'text') {
          fullResponse += chunk.data;
          
          // Send streaming text response
          this.sendMessage(ws, {
            type: 'text_chunk',
            text: chunk.data,
            timestamp: chunk.timestamp
          });
        }
      }

      // Send completion
      this.sendMessage(ws, {
        type: 'text_complete',
        text: fullResponse,
        timestamp: Date.now()
      });

      logger.info('[GeminiLiveWS] Text message processed', {
        sessionId,
        textLength: text.length,
        responseLength: fullResponse.length
      });

    } catch (error) {
      logger.error('[GeminiLiveWS] Text processing error:', error);
      this.sendError(ws, 'Text processing failed: ' + error.message);
    }
  }

  /**
   * End Gemini Live session
   */
  async endLiveSession(ws, sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    try {
      if (session.geminiSession) {
        await this.geminiLiveService.endSession(sessionId);
      }

      this.sendMessage(ws, {
        type: 'session_ended',
        sessionId,
        duration: Date.now() - session.connectedAt,
        timestamp: Date.now()
      });

      logger.info('[GeminiLiveWS] Live session ended', {
        sessionId,
        duration: Date.now() - session.connectedAt
      });

    } catch (error) {
      logger.error('[GeminiLiveWS] Session end error:', error);
    }
  }

  /**
   * Handle WebSocket close
   */
  handleClose(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    logger.info('[GeminiLiveWS] Connection closed', {
      sessionId,
      duration: Date.now() - session.connectedAt
    });

    // Cleanup
    if (session.heartbeatInterval) {
      clearInterval(session.heartbeatInterval);
    }

    if (session.geminiSession) {
      this.geminiLiveService.endSession(sessionId).catch(err => {
        logger.error('[GeminiLiveWS] Cleanup error:', err);
      });
    }

    this.activeSessions.delete(sessionId);
  }

  /**
   * Handle WebSocket error
   */
  handleError(sessionId, error) {
    logger.error('[GeminiLiveWS] WebSocket error', {
      sessionId,
      error: error.message
    });
  }

  /**
   * Handle pong response
   */
  handlePong(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      session.lastActivityAt = Date.now();
    }
  }

  /**
   * Start heartbeat ping/pong
   */
  startHeartbeat(ws, sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.heartbeatInterval = setInterval(() => {
      if (ws.readyState === ws.OPEN) {
        ws.ping();
      }
    }, 30000); // 30 seconds
  }

  /**
   * Send message to client
   */
  sendMessage(ws, message) {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error to client
   */
  sendError(ws, error) {
    this.sendMessage(ws, {
      type: 'error',
      error,
      timestamp: Date.now()
    });
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `gemini-live-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get active session count
   */
  getActiveSessionCount() {
    return this.activeSessions.size;
  }

  /**
   * Cleanup inactive sessions
   */
  cleanupInactiveSessions(timeoutMs = 5 * 60 * 1000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, session] of this.activeSessions.entries()) {
      if (now - session.lastActivityAt > timeoutMs) {
        if (session.ws.readyState === session.ws.OPEN) {
          session.ws.close();
        }
        this.handleClose(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info('[GeminiLiveWS] Cleaned inactive sessions', { count: cleaned });
    }
  }
}

module.exports = GeminiLiveWebSocketHandler;

