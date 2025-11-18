/**
 * Service Container for Google Cloud Platform
 * Manages service lifecycle and dependency injection
 */

const ConversationManager = require('./ConversationManager');
const RAGService = require('./RAGService');
const AudioService = require('./AudioService');
const MultiLanguageService = require('./MultiLanguageService');
const LLMService = require('./LLMService');
const PipelineOrchestrator = require('./PipelineOrchestrator');
const { PromptService } = require('./PromptService');
const { ConversationFlowService } = require('./ConversationFlowService');
const WebSocketHandler = require('./WebSocketHandler');

class ServiceContainer {
  constructor(env, webSocket = null) {
    this.env = env;
    this.webSocket = webSocket;
    this.services = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    console.log('[ServiceContainer] Initializing services...');
    
    // Initialize core services
    await this.getConversationService();
    await this.getRAGService();
    await this.getAudioService();
    await this.getMultiLanguageService();
    await this.getLLMService();
    await this.getPromptService();
    await this.getPipelineOrchestrator();
    
    this.initialized = true;
    console.log('[ServiceContainer] All services initialized');
  }

  async getConversationService(sessionId = 'default') {
    const serviceKey = `conversation_${sessionId}`;
    if (!this.services.has(serviceKey)) {
      const service = new ConversationManager(this.env, sessionId);
      await service.initialize();
      this.services.set(serviceKey, service);
    }
    return this.services.get(serviceKey);
  }

  async getRAGService() {
    if (!this.services.has('rag')) {
      const service = new RAGService(this.env);
      await service.initialize();
      this.services.set('rag', service);
    }
    return this.services.get('rag');
  }

  async getAudioService() {
    if (!this.services.has('audio')) {
      const service = new AudioService(this.env, this.webSocket);
      await service.initialize();
      this.services.set('audio', service);
    }
    return this.services.get('audio');
  }

  async getMultiLanguageService() {
    if (!this.services.has('multilang')) {
      const service = new MultiLanguageService(this.env);
      await service.initialize();
      this.services.set('multilang', service);
    }
    return this.services.get('multilang');
  }

  async getLLMService() {
    if (!this.services.has('llm')) {
      const service = new LLMService(this.env);
      await service.initialize();
      this.services.set('llm', service);
    }
    return this.services.get('llm');
  }

  async getPromptService() {
    if (!this.services.has('prompt')) {
      const multiLanguageService = await this.getMultiLanguageService();
      const conversationFlowService = await this.getConversationFlowService();
      const service = new PromptService(multiLanguageService, conversationFlowService);
      this.services.set('prompt', service);
    }
    return this.services.get('prompt');
  }

  async getConversationFlowService() {
    if (!this.services.has('conversationFlow')) {
      const service = new ConversationFlowService();
      this.services.set('conversationFlow', service);
    }
    return this.services.get('conversationFlow');
  }

  async getWebSocketHandler(sessionId = 'default') {
    const serviceKey = `websocket_${sessionId}`;
    if (!this.services.has(serviceKey)) {
      const conversationManager = await this.getConversationService(sessionId);
      const service = new WebSocketHandler(conversationManager, sessionId);
      await service.initialize();
      this.services.set(serviceKey, service);
    }
    return this.services.get(serviceKey);
  }

  async getPipelineOrchestrator() {
    if (!this.services.has('pipeline')) {
      const conversationService = await this.getConversationService();
      const ragService = await this.getRAGService();
      const llmService = await this.getLLMService();
      const multiLanguageService = await this.getMultiLanguageService();
      const promptService = await this.getPromptService();
      
      const service = new PipelineOrchestrator({
        conversationManager: conversationService,
        ragService,
        llmService,
        multiLanguageService,
        promptService
      });
      
      this.services.set('pipeline', service);
    }
    return this.services.get('pipeline');
  }

  async cleanup() {
    console.log('[ServiceContainer] Cleaning up services...');
    
    for (const [name, service] of this.services) {
      if (service.cleanup && typeof service.cleanup === 'function') {
        try {
          await service.cleanup();
        } catch (error) {
          console.error(`[ServiceContainer] Error cleaning up ${name}:`, error);
        }
      }
    }
    
    this.services.clear();
    this.initialized = false;
  }
}

module.exports = ServiceContainer;