/**
 * Vertex AI Live WebSocket Handler
 * Handles bidirectional audio streaming with Vertex AI Multimodal Live API
 * Uses native audio-to-audio streaming (no STT/TTS)
 */

const { logger } = require('../utils/logger');
const VertexAILiveService = require('../services/VertexAILiveService');
const SharedFunctionSchema = require('../services/SharedFunctionSchema');

class VertexAILiveWebSocketHandler {
  constructor() {
    this.vertexAILiveService = new VertexAILiveService(process.env);
    this.activeSessions = new Map();
  }

  async initialize() {
    await this.vertexAILiveService.initialize();
    logger.info('[VertexAILiveWS] Initialized');
  }

  /**
   * Handle new WebSocket connection
   */
  async handleConnection(ws, req) {
    const sessionId = this.generateSessionId();
    const clientIp = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';

    logger.info('[VertexAILiveWS] New connection', {
      sessionId,
      clientIp
    });

    const sessionData = {
      ws,
      sessionId,
      language: 'en',
      isActive: false,
      vertexSession: null,
      connectedAt: Date.now(),
      lastActivityAt: Date.now(),
      opusDecoder: null,  // Will be initialized when session starts
      opusDemuxer: null
    };

    this.activeSessions.set(sessionId, sessionData);

    // Send session ID to client
    this.sendMessage(ws, {
      type: 'session_started',
      sessionId,
      workflow: 'vertex-ai-live',  // Identify workflow
      timestamp: Date.now()
    });

    // Note: Bun's WebSocket model uses server-level handlers, not ws.on()
    // Message, close, error handlers will be called from server.js
    // Start heartbeat
    this.startHeartbeat(ws, sessionId);

    // Return sessionId so server.js can store it
    return sessionId;
  }

  /**
   * Handle incoming WebSocket messages
   */
  async handleMessage(ws, sessionId, data) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      logger.warn('[VertexAILiveWS] Message for inactive session', { sessionId });
      return;
    }

    session.lastActivityAt = Date.now();

    try {
      // Parse message
      let message;
      if (Buffer.isBuffer(data) || data instanceof ArrayBuffer) {
        // Binary audio data (PCM) - send directly to Vertex AI
        await this.handleAudioChunk(ws, sessionId, data);
        return;
      } else {
        // JSON control message
        message = JSON.parse(data.toString());
      }

      logger.info('[VertexAILiveWS] Received message', {
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

        case 'turn_complete':
          await this.handleTurnComplete(ws, sessionId);
          break;

        case 'end_session':
          await this.endLiveSession(ws, sessionId);
          break;

        case 'ping':
          this.sendMessage(ws, { type: 'pong', timestamp: Date.now() });
          break;

        default:
          logger.warn('[VertexAILiveWS] Unknown message type', {
            sessionId,
            type: message.type
          });
      }
    } catch (error) {
      logger.error('[VertexAILiveWS] Message handling error:', error);
      this.sendError(ws, 'Message processing failed: ' + error.message);
    }
  }

  /**
   * Start a Vertex AI Live session
   */
  async startLiveSession(ws, sessionId, config = {}) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    try {
      const { language = 'en', systemInstruction, userId } = config;
      session.language = language;
      session.userId = userId; // Store userId for context persistence

      // Build system instruction with shared schema (fraud protection) and language context
      const fullSystemInstruction = systemInstruction ||
        SharedFunctionSchema.buildSystemPrompt('', {}, language);

      logger.info('[VertexAILiveWS] Creating Vertex AI Live session', {
        sessionId,
        language,
        userId: userId || 'anonymous',
        hasCustomInstruction: !!systemInstruction
      });

      // Create Vertex AI Live session with userId for context persistence
      const vertexSession = await this.vertexAILiveService.createSession(sessionId, {
        language,
        systemInstruction: fullSystemInstruction,
        userId // Pass userId for conversation history
      });

      session.vertexSession = vertexSession;

      // Set up audio callback to forward to client
      this.vertexAILiveService.setAudioCallback(sessionId, (audioData) => {
        // Send audio response back to client as binary
        if (ws.readyState === 1) {  // 1 = OPEN
          ws.send(audioData);

          logger.info('[VertexAILiveWS] Sent audio to client', {
            sessionId,
            size: audioData.length
          });
        }
      });

      session.isActive = true;

      this.sendMessage(ws, {
        type: 'session_ready',
        sessionId,
        language,
        workflow: 'vertex-ai-live',
        timestamp: Date.now()
      });

      logger.info('[VertexAILiveWS] Live session ready', {
        sessionId,
        language
      });

    } catch (error) {
      logger.error('[VertexAILiveWS] Session start failed:', error);
      this.sendError(ws, 'Failed to start session: ' + error.message);
    }
  }

  /**
   * Handle Opus/WebM audio chunk from client and decode to PCM
   */
  async handleOpusAudioChunk(ws, sessionId, audioData) {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.vertexSession) {
      logger.warn('[VertexAILiveWS] Audio chunk for session without Vertex session', {
        sessionId
      });
      return;
    }

    try {
      const buffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);

      // Initialize decoder pipeline on first chunk
      if (!session.opusDecoder) {
        const prism = require('prism-media');

        logger.info('[VertexAILiveWS] Initializing Opus decoder pipeline', { sessionId });

        // Create persistent decoder pipeline
        session.opusDemuxer = new prism.opus.WebmDemuxer();
        session.opusDecoder = new prism.opus.Decoder({
          rate: 16000,
          channels: 1,
          frameSize: 960
        });

        // Pipe demuxer -> decoder
        session.opusDemuxer.pipe(session.opusDecoder);

        // Handle decoded PCM chunks
        session.opusDecoder.on('data', async (pcmChunk) => {
          try {
            // Send each PCM chunk immediately to Vertex AI
            await this.vertexAILiveService.sendAudio(sessionId, pcmChunk);

            logger.info('[VertexAILiveWS] PCM sent to Vertex AI', {
              sessionId,
              pcmSize: pcmChunk.length
            });
          } catch (error) {
            logger.error('[VertexAILiveWS] Error sending PCM:', {
              error: error.message,
              sessionId
            });
          }
        });

        // Handle errors
        session.opusDecoder.on('error', (error) => {
          logger.error('[VertexAILiveWS] Opus decoder error:', {
            error: error.message,
            sessionId
          });
        });

        session.opusDemuxer.on('error', (error) => {
          logger.error('[VertexAILiveWS] WebM demuxer error:', {
            error: error.message,
            sessionId
          });
        });
      }

      // Write chunk to demuxer (persistent stream)
      if (session.opusDemuxer && !session.opusDemuxer.destroyed) {
        session.opusDemuxer.write(buffer);
      }

    } catch (error) {
      logger.error('[VertexAILiveWS] Audio processing error:', {
        error: error.message,
        stack: error.stack,
        sessionId
      });
      this.sendError(ws, 'Audio processing failed: ' + error.message);
    }
  }

  /**
   * Handle audio chunk from client (legacy PCM support)
   */
  async handleAudioChunk(ws, sessionId, audioBuffer) {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.vertexSession) {
      logger.warn('[VertexAILiveWS] Audio chunk for session without Vertex session', {
        sessionId
      });
      return;
    }

    try {
      // Ensure audioBuffer is a Buffer (convert from ArrayBuffer if needed)
      const buffer = Buffer.isBuffer(audioBuffer) ? audioBuffer : Buffer.from(audioBuffer);

      // Send audio directly to Vertex AI Live API
      await this.vertexAILiveService.sendAudio(sessionId, buffer);

      logger.info('[VertexAILiveWS] Audio sent to Vertex AI', {
        sessionId,
        chunkSize: buffer.length
      });

    } catch (error) {
      logger.error('[VertexAILiveWS] Audio processing error:', {
        error: error.message,
        stack: error.stack,
        sessionId
      });
      this.sendError(ws, 'Audio processing failed: ' + error.message);
    }
  }

  /**
   * Handle turn completion signal (user finished speaking)
   */
  async handleTurnComplete(ws, sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session || !session.vertexSession) {
      logger.warn('[VertexAILiveWS] Turn complete for session without Vertex session', {
        sessionId
      });
      return;
    }

    try {
      // Send turn completion to Vertex AI
      await this.vertexAILiveService.sendTurnComplete(sessionId);

      logger.info('[VertexAILiveWS] Turn completion sent to Vertex AI', {
        sessionId
      });

    } catch (error) {
      logger.error('[VertexAILiveWS] Turn completion error:', error);
      this.sendError(ws, 'Turn completion failed: ' + error.message);
    }
  }

  /**
   * End Vertex AI Live session
   */
  async endLiveSession(ws, sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    try {
      if (session.vertexSession) {
        await this.vertexAILiveService.closeSession(sessionId);
      }

      // Clean up Opus decoder
      if (session.opusDemuxer && !session.opusDemuxer.destroyed) {
        session.opusDemuxer.destroy();
      }
      if (session.opusDecoder && !session.opusDecoder.destroyed) {
        session.opusDecoder.destroy();
      }

      session.isActive = false;
      session.vertexSession = null;
      session.opusDemuxer = null;
      session.opusDecoder = null;

      this.sendMessage(ws, {
        type: 'session_ended',
        sessionId,
        timestamp: Date.now()
      });

      logger.info('[VertexAILiveWS] Session ended', { sessionId });

    } catch (error) {
      logger.error('[VertexAILiveWS] Session end error:', error);
    }
  }

  /**
   * Handle WebSocket close
   */
  async handleClose(sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      if (session.vertexSession) {
        await this.vertexAILiveService.closeSession(sessionId);
      }

      if (session.heartbeatInterval) {
        clearInterval(session.heartbeatInterval);
      }

      this.activeSessions.delete(sessionId);

      logger.info('[VertexAILiveWS] Connection closed', { sessionId });
    }
  }

  /**
   * Handle WebSocket error
   */
  handleError(sessionId, error) {
    logger.error('[VertexAILiveWS] WebSocket error:', {
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
   * Start heartbeat for connection
   */
  startHeartbeat(ws, sessionId) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    session.heartbeatInterval = setInterval(() => {
      if (ws.readyState === 1) {  // 1 = OPEN
        ws.ping();
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Send JSON message to client
   */
  sendMessage(ws, message) {
    // Bun WebSocket readyState: 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error message to client
   */
  sendError(ws, error) {
    this.sendMessage(ws, {
      type: 'error',
      error: error,
      timestamp: Date.now()
    });
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return 'vertex-live-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now();
  }

  /**
   * Cleanup
   */
  async cleanup() {
    for (const [sessionId, session] of this.activeSessions) {
      if (session.ws) {
        session.ws.close();
      }
      if (session.vertexSession) {
        await this.vertexAILiveService.closeSession(sessionId);
      }
      if (session.heartbeatInterval) {
        clearInterval(session.heartbeatInterval);
      }
    }
    this.activeSessions.clear();
    logger.info('[VertexAILiveWS] Cleanup completed');
  }
}

module.exports = VertexAILiveWebSocketHandler;
