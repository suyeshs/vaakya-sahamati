/**
 * Enhanced Gemini Live WebSocket Handler
 * Extends the base handler with advanced conversational AI features:
 * - STT quality analysis and polyfilling
 * - Interruption handling with context preservation
 * - Adaptive conversation management
 */

const GeminiLiveWebSocketHandler = require('./GeminiLiveWebSocketHandler');
const ServiceFactory = require('../services/ServiceFactory');
const InterruptionContextManager = require('../services/InterruptionContextManager');
const { logger } = require('../utils/logger');

class EnhancedGeminiLiveWebSocketHandler extends GeminiLiveWebSocketHandler {
  constructor(services) {
    super();

    // Inject new services
    this.sttService = services.sttService;
    this.sttAnalyzer = services.sttAnalyzer;
    this.polyfillSelector = services.polyfillSelector;
    this.responseGenerator = services.responseGenerator;
    this.pipelineService = services.pipelineService;
    this.multiLangService = services.multiLangService;
    this.llmService = services.llmService;

    // Per-session managers
    this.sessionManagers = new Map(); // sessionId -> { adaptive, interruption }
  }

  /**
   * Override handleConnection to add per-session managers
   */
  async handleConnection(ws, req) {
    // Call parent implementation
    await super.handleConnection(ws, req);

    // Get session data
    const sessions = Array.from(this.activeSessions.values());
    const session = sessions[sessions.length - 1];

    if (session) {
      // Create per-session managers
      const adaptiveManager = ServiceFactory.createAdaptiveManager(session.sessionId);
      const interruptionManager = new InterruptionContextManager();

      this.sessionManagers.set(session.sessionId, {
        adaptive: adaptiveManager,
        interruption: interruptionManager
      });

      logger.info('[EnhancedGeminiLiveWS] Session managers created', {
        sessionId: session.sessionId
      });
    }
  }

  /**
   * Override handleClose to clean up session managers
   */
  handleClose(sessionId) {
    // Clean up session managers
    this.sessionManagers.delete(sessionId);

    // Call parent implementation
    super.handleClose(sessionId);

    logger.info('[EnhancedGeminiLiveWS] Session managers cleaned up', { sessionId });
  }

  /**
   * Override handleMessage to add enhanced features
   */
  async handleMessage(ws, sessionId, data) {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return super.handleMessage(ws, sessionId, data);
    }

    // Handle JSON control messages
    if (!Buffer.isBuffer(data)) {
      try {
        const message = JSON.parse(data.toString());

        // Handle new message types
        switch (message.type) {
          case 'handle_conversation_issue':
            return await this.handleConversationIssue(ws, sessionId, message.issue);

          case 'handle_interruption':
            return await this.handleInterruption(ws, sessionId, message.interruption);

          case 'get_adaptive_recommendations':
            return await this.getAdaptiveRecommendations(ws, sessionId);

          default:
            // Fall back to parent handler
            return await super.handleMessage(ws, sessionId, data);
        }
      } catch (error) {
        // Fall back to parent handler if parsing fails
        return await super.handleMessage(ws, sessionId, data);
      }
    }

    // Binary audio data - pass to parent
    return await super.handleMessage(ws, sessionId, data);
  }

  /**
   * Handle conversation issue (pauses, noise, etc.)
   */
  async handleConversationIssue(ws, sessionId, issue) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    logger.info('[EnhancedGeminiLiveWS] Handling conversation issue', {
      sessionId,
      type: issue.type,
      severity: issue.severity
    });

    try {
      const managers = this.sessionManagers.get(sessionId);

      // Update adaptive manager
      if (managers && managers.adaptive) {
        if (issue.type === 'BACKGROUND_NOISE') {
          managers.adaptive.recordEvent('noise_detected', { level: issue.level });
        } else if (issue.type === 'LONG_PAUSE') {
          managers.adaptive.recordEvent('long_pause', { duration: issue.duration });
        }
      }

      // Select appropriate polyfill
      const polyfill = await this.polyfillSelector.selectPolyfill(issue, {
        language: session.language || 'en',
        userProfile: managers?.adaptive?.userProfile
      });

      // Send polyfill audio to client
      if (polyfill.audio) {
        this.sendMessage(ws, {
          type: 'polyfill_audio',
          issue: issue.type,
          audio: polyfill.audio.toString('base64'),
          text: polyfill.text,
          source: polyfill.source,
          timestamp: Date.now()
        });

        logger.info('[EnhancedGeminiLiveWS] Polyfill audio sent', {
          sessionId,
          source: polyfill.source,
          latency: polyfill.latency
        });
      }

      // Send acknowledgment
      this.sendMessage(ws, {
        type: 'conversation_issue_handled',
        issue: issue.type,
        severity: issue.severity,
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error('[EnhancedGeminiLiveWS] Error handling conversation issue:', error);
      this.sendMessage(ws, {
        type: 'error',
        error: 'Failed to handle conversation issue',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Handle user interruption
   */
  async handleInterruption(ws, sessionId, interruption) {
    const session = this.activeSessions.get(sessionId);
    if (!session) return;

    logger.info('[EnhancedGeminiLiveWS] Handling interruption', {
      sessionId,
      type: interruption.type,
      progress: interruption.timing.progress
    });

    try {
      const managers = this.sessionManagers.get(sessionId);

      // Save interruption context
      if (managers && managers.interruption) {
        const context = managers.interruption.saveInterruptionContext(
          interruption,
          session.currentAIResponse || {}
        );

        logger.info('[EnhancedGeminiLiveWS] Interruption context saved', {
          sessionId,
          canResume: context.canResume
        });
      }

      // Update adaptive manager
      if (managers && managers.adaptive) {
        managers.adaptive.recordEvent('interruption', {
          type: interruption.type,
          progress: interruption.timing.progress
        });
      }

      // Send acknowledgment
      this.sendMessage(ws, {
        type: 'interruption_handled',
        interruption: interruption.type,
        action: interruption.action,
        timestamp: Date.now()
      });

    } catch (error) {
      logger.error('[EnhancedGeminiLiveWS] Error handling interruption:', error);
      this.sendMessage(ws, {
        type: 'error',
        error: 'Failed to handle interruption',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Get adaptive recommendations for session
   */
  async getAdaptiveRecommendations(ws, sessionId) {
    const managers = this.sessionManagers.get(sessionId);

    if (!managers || !managers.adaptive) {
      this.sendMessage(ws, {
        type: 'adaptive_recommendations',
        recommendations: [],
        timestamp: Date.now()
      });
      return;
    }

    try {
      const recommendations = managers.adaptive.adapt();

      this.sendMessage(ws, {
        type: 'adaptive_recommendations',
        recommendations: recommendations,
        userProfile: managers.adaptive.userProfile,
        timestamp: Date.now()
      });

      logger.info('[EnhancedGeminiLiveWS] Adaptive recommendations sent', {
        sessionId,
        count: recommendations.length
      });

    } catch (error) {
      logger.error('[EnhancedGeminiLiveWS] Error getting adaptive recommendations:', error);
      this.sendMessage(ws, {
        type: 'error',
        error: 'Failed to get adaptive recommendations',
        timestamp: Date.now()
      });
    }
  }

  /**
   * Helper to send JSON messages
   */
  sendMessage(ws, message) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify(message));
    }
  }
}

module.exports = EnhancedGeminiLiveWebSocketHandler;
