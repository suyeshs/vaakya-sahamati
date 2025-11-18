/**
 * LLM Configuration Service
 * Manages LLM response generation settings including tone, guardrails, and response length
 */

const { logger } = require('../utils/logger');

class LLMConfigService {
  constructor() {
    // Default configuration
    this.defaultConfig = {
      // Response tone settings
      tone: {
        style: 'professional', // professional, friendly, casual, formal, empathetic
        personality: 'helpful', // helpful, enthusiastic, calm, authoritative
        formality: 'balanced' // formal, balanced, casual
      },
      
      // Response length settings
      responseLength: {
        preference: 'moderate', // concise, moderate, detailed, comprehensive
        maxTokens: 2048, // Increased default to account for Gemini 2.5 thinking tokens
        minTokens: 50,
        targetSentences: 3 // Target number of sentences for moderate responses
      },
      
      // Guardrails settings
      guardrails: {
        enabled: true,
        contentFilters: {
          offensive: true,
          personal_info: true,
          financial_advice_disclaimer: true,
          medical_advice_disclaimer: true
        },
        topicRestrictions: {
          allowedTopics: ['finance', 'loans', 'credit', 'banking', 'investment', 'general'],
          restrictedTopics: ['gambling', 'illegal_activities'],
          requireDisclaimer: ['investment', 'medical', 'legal']
        },
        responseValidation: {
          ensureRelevance: true,
          preventHallucination: true,
          factualityCheck: true
        }
      },
      
      // Generation parameters
      generation: {
        temperature: 0.7, // 0.0 to 1.0 - creativity vs consistency
        topP: 0.9, // 0.0 to 1.0 - diversity of responses
        topK: 40, // Number of top tokens to consider
        frequencyPenalty: 0.0, // -2.0 to 2.0 - reduce repetition
        presencePenalty: 0.0 // -2.0 to 2.0 - encourage new topics
      },
      
      // Language and localization
      language: {
        primary: 'en',
        supportMultilingual: true,
        translationEnabled: false
      }
    };
    
    // Store configurations per session
    this.sessionConfigs = new Map();
    
    logger.info('[LLMConfigService] Initialized with default configuration');
  }
  
  /**
   * Get configuration for a session (or default if not set)
   */
  getConfig(sessionId = 'default') {
    if (this.sessionConfigs.has(sessionId)) {
      return this.sessionConfigs.get(sessionId);
    }
    return { ...this.defaultConfig };
  }
  
  /**
   * Update configuration for a session
   */
  updateConfig(sessionId, updates) {
    try {
      const currentConfig = this.getConfig(sessionId);
      const updatedConfig = this.mergeConfig(currentConfig, updates);
      
      // Validate the configuration
      this.validateConfig(updatedConfig);
      
      this.sessionConfigs.set(sessionId, updatedConfig);
      
      logger.info('[LLMConfigService] Configuration updated', { 
        sessionId,
        updates: Object.keys(updates)
      });
      
      return updatedConfig;
    } catch (error) {
      logger.error('[LLMConfigService] Error updating configuration:', {
        sessionId,
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Reset configuration for a session to default
   */
  resetConfig(sessionId) {
    this.sessionConfigs.delete(sessionId);
    logger.info('[LLMConfigService] Configuration reset to default', { sessionId });
    return { ...this.defaultConfig };
  }
  
  /**
   * Merge configuration updates with existing config
   */
  mergeConfig(currentConfig, updates) {
    const merged = { ...currentConfig };
    
    // Deep merge each section
    if (updates.tone) {
      merged.tone = { ...merged.tone, ...updates.tone };
    }
    if (updates.responseLength) {
      merged.responseLength = { ...merged.responseLength, ...updates.responseLength };
    }
    if (updates.guardrails) {
      merged.guardrails = {
        ...merged.guardrails,
        ...updates.guardrails,
        contentFilters: {
          ...merged.guardrails.contentFilters,
          ...(updates.guardrails.contentFilters || {})
        },
        topicRestrictions: {
          ...merged.guardrails.topicRestrictions,
          ...(updates.guardrails.topicRestrictions || {})
        },
        responseValidation: {
          ...merged.guardrails.responseValidation,
          ...(updates.guardrails.responseValidation || {})
        }
      };
    }
    if (updates.generation) {
      merged.generation = { ...merged.generation, ...updates.generation };
    }
    if (updates.language) {
      merged.language = { ...merged.language, ...updates.language };
    }
    
    return merged;
  }
  
  /**
   * Validate configuration values
   */
  validateConfig(config) {
    // Validate tone
    const validStyles = ['professional', 'friendly', 'casual', 'formal', 'empathetic'];
    if (!validStyles.includes(config.tone.style)) {
      throw new Error(`Invalid tone style. Must be one of: ${validStyles.join(', ')}`);
    }
    
    // Validate response length
    const validLengths = ['concise', 'moderate', 'detailed', 'comprehensive'];
    if (!validLengths.includes(config.responseLength.preference)) {
      throw new Error(`Invalid response length. Must be one of: ${validLengths.join(', ')}`);
    }
    
    if (config.responseLength.maxTokens < 50 || config.responseLength.maxTokens > 8192) {
      throw new Error('maxTokens must be between 50 and 8192');
    }
    
    // Validate generation parameters
    if (config.generation.temperature < 0 || config.generation.temperature > 1) {
      throw new Error('temperature must be between 0 and 1');
    }
    
    if (config.generation.topP < 0 || config.generation.topP > 1) {
      throw new Error('topP must be between 0 and 1');
    }
    
    return true;
  }
  
  /**
   * Build system instructions based on configuration
   */
  buildSystemInstructions(config) {
    let instructions = [];
    
    // Tone instructions
    instructions.push(`Tone: ${config.tone.style}, ${config.tone.personality}, ${config.tone.formality}`);
    
    // Response length instructions
    const lengthInstructions = {
      concise: 'Keep responses brief and to the point (1-2 sentences).',
      moderate: 'Provide balanced responses (2-4 sentences).',
      detailed: 'Provide detailed explanations (5-8 sentences).',
      comprehensive: 'Provide comprehensive, thorough responses with examples.'
    };
    instructions.push(lengthInstructions[config.responseLength.preference]);
    
    // Guardrails instructions
    if (config.guardrails.enabled) {
      instructions.push('Apply content safety filters and ensure responses are appropriate.');
      
      if (config.guardrails.contentFilters.financial_advice_disclaimer) {
        instructions.push('When providing financial information, include appropriate disclaimers about seeking professional advice.');
      }
      
      if (config.guardrails.responseValidation.ensureRelevance) {
        instructions.push('Ensure all responses are relevant to the user\'s question.');
      }
    }
    
    return instructions.join(' ');
  }
  
  /**
   * Get generation config for API calls
   */
  getGenerationConfig(config) {
    return {
      maxOutputTokens: config.responseLength.maxTokens,
      temperature: config.generation.temperature,
      topP: config.generation.topP,
      topK: config.generation.topK
    };
  }
  
  /**
   * Get all session configurations (for admin/debugging)
   */
  getAllConfigs() {
    const configs = {};
    this.sessionConfigs.forEach((config, sessionId) => {
      configs[sessionId] = config;
    });
    return configs;
  }
  
  /**
   * Clear old session configurations (cleanup)
   */
  clearOldSessions(maxAge = 24 * 60 * 60 * 1000) {
    // TODO: Implement session age tracking if needed
    logger.info('[LLMConfigService] Session cleanup executed');
  }
}

// Singleton instance
const llmConfigService = new LLMConfigService();

module.exports = { LLMConfigService, llmConfigService };