/**
 * Service Factory
 * Initializes and provides all services for advanced conversational AI
 */

const STTService = require('./STTService');
const STTQualityAnalyzer = require('./STTQualityAnalyzer');
const PolyfillSelector = require('./PolyfillSelector');
const AdaptiveConversationManager = require('./AdaptiveConversationManager');
const InterruptionAwareResponseGenerator = require('./InterruptionAwareResponseGenerator');
const PipelineService = require('./PipelineService');
const MultiLanguageService = require('./MultiLanguageService');
const GeminiLiveService = require('./GeminiLiveService');
const LLMService = require('./LLMService');
const { logger } = require('../utils/logger');

class ServiceFactory {
  static instance = null;
  static services = null;

  /**
   * Get singleton instance
   */
  static async getInstance(env) {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory();
      ServiceFactory.services = await ServiceFactory.instance.createServices(env);
    }
    return ServiceFactory.instance;
  }

  /**
   * Create and initialize all services
   */
  async createServices(env) {
    logger.info('[ServiceFactory] Initializing services...');

    try {
      // Initialize base services
      logger.info('[ServiceFactory] Initializing MultiLanguageService...');
      const multiLangService = new MultiLanguageService(env);
      await multiLangService.initialize();

      logger.info('[ServiceFactory] Initializing STTService...');
      const sttService = new STTService(env);
      await sttService.initialize();

      logger.info('[ServiceFactory] Initializing GeminiLiveService...');
      const geminiLiveService = new GeminiLiveService(env);
      await geminiLiveService.initialize();

      logger.info('[ServiceFactory] Initializing LLMService...');
      const llmService = new LLMService(env);
      await llmService.initialize();

      // Initialize analysis and support services
      logger.info('[ServiceFactory] Initializing STTQualityAnalyzer...');
      const sttAnalyzer = new STTQualityAnalyzer();

      logger.info('[ServiceFactory] Initializing PolyfillSelector...');
      const polyfillSelector = new PolyfillSelector(multiLangService);
      await polyfillSelector.initialize();

      logger.info('[ServiceFactory] Initializing InterruptionAwareResponseGenerator...');
      const responseGenerator = new InterruptionAwareResponseGenerator(llmService);

      // Initialize pipeline service
      logger.info('[ServiceFactory] Initializing PipelineService...');
      const pipelineService = new PipelineService({
        stt: sttService,
        llm: llmService,
        tts: multiLangService,
        sttAnalyzer: sttAnalyzer,
        polyfillSelector: polyfillSelector,
        responseGenerator: responseGenerator,
        adaptiveManager: null // Will be set per-session
      });

      logger.info('[ServiceFactory] ✅ All services initialized successfully');

      return {
        sttService,
        multiLangService,
        geminiLiveService,
        llmService,
        sttAnalyzer,
        polyfillSelector,
        responseGenerator,
        pipelineService
      };
    } catch (error) {
      logger.error('[ServiceFactory] ❌ Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * Get all services
   */
  static getServices() {
    if (!ServiceFactory.services) {
      throw new Error('Services not initialized. Call getInstance() first.');
    }
    return ServiceFactory.services;
  }

  /**
   * Create per-session adaptive conversation manager
   */
  static createAdaptiveManager(sessionId) {
    return new AdaptiveConversationManager(sessionId);
  }
}

module.exports = ServiceFactory;
