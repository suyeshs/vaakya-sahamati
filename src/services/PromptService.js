// Prompt Service - Handles prompt construction and response parsing
// Separates prompt logic from LLM service for better testability

class PromptService {
  constructor(multiLanguageService, conversationFlowService = null) {
    this.multiLanguageService = multiLanguageService;
    this.conversationFlowService = conversationFlowService;
  }

  buildPrompt(query, ragContext, conversationContext) {
    const { history, facts, currentLanguage } = conversationContext;
    const { content: context, sources } = ragContext;
    
    // Build facts context
    const factsContext = this.buildFactsContext(facts);
    
    // Build conversation history
    const fullHistory = history.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    
    // Get language-specific instructions
    const languageInstructions = this.getLanguageInstructions(currentLanguage);
    
    // Build category-specific instructions
    const categoryInstruction = this.buildCategoryInstruction(facts.lastLoanType);
    
    // Construct the full prompt
    const prompt = `You are a helpful multilingual finance assistant. Use this context: ${context}${factsContext}

History: ${fullHistory}

Query: ${query}

Instructions:
${languageInstructions}
- Keep your answer short and conversational.
- Translate numbers into words in the spoken language.
- Provide helpful, educational advice.
- CRITICAL: Always verify mathematical calculations. For loans: Loan Amount = Property Cost - Down Payment. Never suggest a loan amount higher than the property cost.
- Double-check all financial calculations before responding.
- IMPORTANT: For generic loan requests (like "I need a loan"), ask exploratory questions to understand the type, amount, and purpose before making assumptions.
- Don't assume loan type (personal, home, car, etc.) unless explicitly mentioned.
- Ask clarifying questions to understand the user's specific needs.
${categoryInstruction}

Response:`;

    return prompt;
  }

  extractResponseMetadata(response) {
    // Extract metadata from response if it contains structured information
    try {
      // Look for confidence indicators
      const confidenceMatch = response.match(/confidence[:\s]+(\d+\.?\d*)/i);
      const confidence = confidenceMatch ? parseFloat(confidenceMatch[1]) : 0.8;
      
      // Look for topic indicators
      const topicMatches = response.match(/topics?[:\s]+\[([^\]]+)\]/i);
      const topics = topicMatches ? 
        topicMatches[1].split(',').map(t => t.trim().replace(/['"]/g, '')) : 
        ['general'];
      
      // Determine tone from response style
      const tone = this.detectTone(response);
      
      // Determine length
      const length = this.detectLength(response);
      
      return {
        confidence,
        topics,
        tone,
        length,
        language: 'en',
        metadata: {
          provider: 'unknown',
          model: 'unknown',
          tokens: 0,
          latency: 0,
          timestamp: new Date().toISOString(),
          jsonParseSuccess: false,
          fallbackUsed: true
        }
      };
    } catch (error) {
      console.warn('[PromptService] Failed to extract metadata:', error);
      return {
        confidence: 0.6,
        topics: ['general'],
        tone: 'educational',
        length: 'short',
        language: 'en',
        metadata: {
          provider: 'unknown',
          model: 'unknown',
          tokens: 0,
          latency: 0,
          timestamp: new Date().toISOString(),
          jsonParseSuccess: false,
          fallbackUsed: true
        }
      };
    }
  }

  /**
   * Enhance response with leading questions using ConversationFlowService
   */
  enhanceResponseWithLeadingQuestion(response, query, conversationContext) {
    if (!this.conversationFlowService) {
      return response;
    }

    try {
      // Analyze conversation context
      const flowContext = this.conversationFlowService.analyzeConversationContext(
        query, 
        conversationContext.history || []
      );

      // Generate leading question
      const enhancedResponse = this.conversationFlowService.generateLeadingQuestion(
        flowContext, 
        response
      );

      return enhancedResponse;
    } catch (error) {
      console.warn('[PromptService] Failed to enhance response with leading question:', error);
      return response;
    }
  }

  buildFactsContext(facts) {
    if (!facts || Object.keys(facts).length === 0) {
      return '';
    }

    const parts = [];
    if (facts.lastLoanAmount) {
      parts.push(`Last mentioned loan amount: ${facts.lastLoanAmount}`);
    }
    if (facts.lastLoanPurpose) {
      parts.push(`Loan purpose: ${facts.lastLoanPurpose}`);
    }
    if (facts.lastLoanType) {
      parts.push(`Loan type: ${facts.lastLoanType}`);
    }

    return parts.length > 0 ? `\nFACTS: ${parts.join(' | ')}` : '';
  }

  getLanguageInstructions(language) {
    if (language === 'en') {
      return '- Respond in English with clear, professional language.';
    }
    
    const languageConfig = this.multiLanguageService?.getLanguageConfig(language);
    const languageName = languageConfig?.name || language;
    
    return `- Respond in ${languageName} with clear, professional language.`;
  }

  buildCategoryInstruction(loanType) {
    if (!loanType) return '';
    
    switch (loanType) {
      case 'personal_two_wheeler':
        return '\n- Treat this as a personal/two-wheeler loan, not a home loan.';
      case 'auto':
        return '\n- Treat this as an auto loan, not a home loan.';
      case 'education':
        return '\n- Treat this as an education loan, not a home loan.';
      case 'personal':
      case 'personal_medical':
        return '\n- Treat this as a personal loan, not a home loan.';
      default:
        return '';
    }
  }

  detectTone(response) {
    const lower = response.toLowerCase();
    
    if (lower.includes('i recommend') || lower.includes('you should') || lower.includes('consider')) {
      return 'professional';
    }
    
    if (lower.includes('great!') || lower.includes('wonderful') || lower.includes('excellent')) {
      return 'friendly';
    }
    
    if (lower.includes('let me explain') || lower.includes('here\'s how') || lower.includes('the key is')) {
      return 'educational';
    }
    
    return 'conversational';
  }

  detectLength(response) {
    const wordCount = response.split(/\s+/).length;
    
    if (wordCount <= 10) return 'ultra-short';
    if (wordCount <= 25) return 'short';
    if (wordCount <= 50) return 'moderate';
    return 'long';
  }
}

module.exports = { PromptService };