/**
 * Guardrails Service for Google Cloud Platform
 * Handles input validation, output filtering, and rate limiting
 */

const { logger } = require('../utils/logger');

class Guardrails {
  constructor(config) {
    this.config = config;
    this.rateLimitMap = new Map();
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    this.initialized = true;
    logger.info('[Guardrails] Initialized', { 
      maxResponseLength: this.config.maxResponseLength,
      maxHistoryLength: this.config.maxHistoryLength,
      allowedLanguages: this.config.allowedLanguages.length
    });
  }

  async validateInput(input, sessionId, language = 'en') {
    try {
      // Check input length
      if (input.length > this.config.maxResponseLength) {
        return {
          passed: false,
          reason: 'Input too long',
          action: 'block'
        };
      }

      // Check for empty input
      if (!input.trim()) {
        return {
          passed: false,
          reason: 'Empty input',
          action: 'block'
        };
      }

      // Check language support
      if (!this.config.allowedLanguages.includes(language)) {
        return {
          passed: false,
          reason: `Language ${language} not supported`,
          action: 'block'
        };
      }

      // Check for malicious content
      const maliciousPatterns = [
        /<script/i,
        /javascript:/i,
        /on\w+\s*=/i,
        /eval\s*\(/i,
        /expression\s*\(/i
      ];

      for (const pattern of maliciousPatterns) {
        if (pattern.test(input)) {
          return {
            passed: false,
            reason: 'Potentially malicious content detected',
            action: 'block'
          };
        }
      }

      // Check rate limiting
      const rateLimitResult = this.checkRateLimit(sessionId);
      if (!rateLimitResult.allowed) {
        return {
          passed: false,
          reason: 'Rate limit exceeded',
          action: 'block'
        };
      }

      logger.info('[Guardrails] Input validation passed', { 
        inputLength: input.length,
        language,
        sessionId 
      });

      return {
        passed: true,
        reason: 'Input validation passed'
      };
    } catch (error) {
      logger.error('[Guardrails] Input validation error:', error);
      return {
        passed: false,
        reason: 'Validation error',
        action: 'block'
      };
    }
  }

  async validateResponse(response, input, conversationHistory = []) {
    try {
      // Check response length
      if (response.length > this.config.maxResponseLength) {
        return {
          passed: false,
          reason: 'Response too long',
          action: 'modify',
          modifications: {
            response: response.substring(0, this.config.maxResponseLength) + '...'
          }
        };
      }

      // Check for empty response
      if (!response.trim()) {
        return {
          passed: false,
          reason: 'Empty response',
          action: 'block'
        };
      }

      // Check for inappropriate content
      const inappropriatePatterns = [
        /hate speech/i,
        /discrimination/i,
        /violence/i,
        /illegal activities/i
      ];

      for (const pattern of inappropriatePatterns) {
        if (pattern.test(response)) {
          return {
            passed: false,
            reason: 'Inappropriate content detected',
            action: 'block'
          };
        }
      }

      // Check for personal information leakage
      const personalInfoPatterns = [
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/, // Credit card
        /\b\d{3}-\d{2}-\d{4}\b/, // SSN
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Email
        /\b\d{10}\b/ // Phone number
      ];

      for (const pattern of personalInfoPatterns) {
        if (pattern.test(response)) {
          return {
            passed: false,
            reason: 'Personal information detected',
            action: 'modify',
            modifications: {
              response: this.sanitizePersonalInfo(response)
            }
          };
        }
      }

      // Check conversation history length
      if (conversationHistory.length > this.config.maxHistoryLength) {
        logger.warn('[Guardrails] Conversation history too long', { 
          historyLength: conversationHistory.length 
        });
      }

      logger.info('[Guardrails] Response validation passed', { 
        responseLength: response.length,
        historyLength: conversationHistory.length 
      });

      return {
        passed: true,
        reason: 'Response validation passed'
      };
    } catch (error) {
      logger.error('[Guardrails] Response validation error:', error);
      return {
        passed: false,
        reason: 'Validation error',
        action: 'block'
      };
    }
  }

  checkRateLimit(sessionId) {
    const now = Date.now();
    const windowStart = now - this.config.rateLimitWindow;
    
    if (!this.rateLimitMap.has(sessionId)) {
      this.rateLimitMap.set(sessionId, []);
    }
    
    const requests = this.rateLimitMap.get(sessionId);
    
    // Remove old requests outside the window
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    this.rateLimitMap.set(sessionId, validRequests);
    
    // Check if under limit
    if (validRequests.length >= this.config.maxRequestsPerWindow) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: validRequests[0] + this.config.rateLimitWindow
      };
    }
    
    // Add current request
    validRequests.push(now);
    this.rateLimitMap.set(sessionId, validRequests);
    
    return {
      allowed: true,
      remaining: this.config.maxRequestsPerWindow - validRequests.length,
      resetTime: now + this.config.rateLimitWindow
    };
  }

  sanitizePersonalInfo(text) {
    return text
      .replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[CARD NUMBER]')
      .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
      .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]')
      .replace(/\b\d{10}\b/g, '[PHONE]');
  }

  async cleanup() {
    // Clear rate limit map
    this.rateLimitMap.clear();
    logger.info('[Guardrails] Cleanup completed');
  }
}

module.exports = Guardrails;