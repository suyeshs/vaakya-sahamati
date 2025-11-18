/**
 * Pipeline Orchestrator for Google Cloud Platform
 * Orchestrates the complete text processing pipeline
 */

const { logger } = require('../utils/logger');

class PipelineOrchestrator {
  constructor(services) {
    this.conversationManager = services.conversationManager;
    this.ragService = services.ragService;
    this.llmService = services.llmService;
    this.multiLanguageService = services.multiLanguageService;
    this.promptService = services.promptService;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    this.initialized = true;
    logger.info('[PipelineOrchestrator] Initialized');
  }

  async processTextPipeline(inputText, language = 'en') {
    try {
      logger.info('[PipelineOrchestrator] Starting text pipeline', { 
        inputLength: inputText.length,
        language 
      });

      // Step 1: Language detection and validation
      const detectedLanguage = await this.multiLanguageService.detectLanguage(inputText);
      const finalLanguage = language || detectedLanguage;
      
      logger.info('[PipelineOrchestrator] Language processed', { 
        detected: detectedLanguage,
        final: finalLanguage 
      });

      // Step 2: Build context using RAG
      const conversationHistory = this.conversationManager.getHistory();
      const ragContext = await this.ragService.buildContextFromSearch(
        inputText, 
        conversationHistory, 
        2000
      );

      logger.info('[PipelineOrchestrator] RAG context built', { 
        contextLength: ragContext.length 
      });

      // Step 3: Build conversation context
      const conversationContext = {
        history: conversationHistory,
        facts: this.conversationManager.getConversationFacts(),
        currentLanguage: finalLanguage
      };

      // Step 4: Build prompt using PromptService
      const prompt = this.promptService.buildPrompt(
        inputText,
        ragContext,
        conversationContext
      );

      logger.info('[PipelineOrchestrator] Prompt built', { 
        promptLength: prompt.length 
      });

      // Step 5: Generate response using LLM
      const llmResponse = await this.llmService.generateResponse(
        prompt,
        ragContext,
        { country: 'in', region: 'india', city: 'mumbai' }
      );

      logger.info('[PipelineOrchestrator] LLM response generated', { 
        responseLength: llmResponse.length 
      });

      // Step 6: Extract metadata using PromptService
      const metadata = this.promptService.extractResponseMetadata(llmResponse);
      
      const result = {
        response: llmResponse,
        metadata: {
          ...metadata,
          language: finalLanguage,
          contextLength: ragContext.length,
          provider: this.llmService.getCurrentProvider()
        }
      };

      logger.info('[PipelineOrchestrator] Pipeline completed successfully', { 
        responseLength: result.response.length,
        metadataKeys: Object.keys(result.metadata)
      });

      return result;
    } catch (error) {
      logger.error('[PipelineOrchestrator] Pipeline error:', error);
      throw error;
    }
  }


  async cleanup() {
    logger.info('[PipelineOrchestrator] Cleanup completed');
  }
}

module.exports = PipelineOrchestrator;