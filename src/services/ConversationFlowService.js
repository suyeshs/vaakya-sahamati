// Conversation Flow Service - Handles leading questions and conversation progression
// This service ensures the assistant always asks relevant follow-up questions

class ConversationFlowService {
  
  /**
   * Generate a leading question based on the current conversation context
   */
  generateLeadingQuestion(context, response) {
    const { currentTopic, userIntent, conversationStage, userProfile } = context;
    
    // If response already ends with a question, return as is
    if (response.trim().endsWith('?')) {
      return response;
    }
    
    // Generate appropriate follow-up question based on context
    const leadingQuestion = this.getLeadingQuestionForContext(context);
    
    // Append the leading question to the response
    return `${response} ${leadingQuestion}`;
  }
  
  /**
   * Get the appropriate leading question based on conversation context
   */
  getLeadingQuestionForContext(context) {
    const { currentTopic, userIntent, conversationStage, userProfile } = context;
    
    // Loan-related questions
    if (currentTopic.includes('loan') || userIntent.includes('loan')) {
      return this.getLoanLeadingQuestion(context);
    }
    
    // Credit score questions
    if (currentTopic.includes('credit') || currentTopic.includes('cibil')) {
      return this.getCreditLeadingQuestion(context);
    }
    
    // Banking questions
    if (currentTopic.includes('bank') || currentTopic.includes('account')) {
      return this.getBankingLeadingQuestion(context);
    }
    
    // Investment questions
    if (currentTopic.includes('investment') || currentTopic.includes('savings')) {
      return this.getInvestmentLeadingQuestion(context);
    }
    
    // Default general question
    return this.getGeneralLeadingQuestion(context);
  }
  
  /**
   * Get loan-specific leading questions
   */
  getLoanLeadingQuestion(context) {
    const { userProfile, conversationStage } = context;
    
    // If we can infer the loan type from purpose (e.g., "for a car"), don't ask generic type
    if (!userProfile?.hasLoanType && userProfile?.inferredLoanType) {
      // Fall through to type-specific follow-ups below
    } else if (conversationStage === 'initial' && !userProfile?.hasLoanType) {
      return "What type of loan are you looking for - home loan, personal loan, car loan, or something else?";
    }

    // Type-specific leading questions
    if (userProfile?.inferredLoanType === 'car' || /car loan/i.test(userProfile?.explicitLoanType || '')) {
      // If amount known but price/down payment unknown, ask those next
      if (!userProfile?.hasOnRoadPrice || !userProfile?.hasDownPayment) {
        return "What is the total on-road price of the car, and how much down payment have you planned?";
      }
      // Next, ask about tenure or CIBIL
      if (!userProfile?.hasCIBILScore) {
        return "What's your current CIBIL score?";
      }
      if (!userProfile?.hasTenure) {
        return "Over how many years would you like to repay the loan (tenure)?";
      }
    }
    
    if (!userProfile?.hasLoanAmount) {
      return "What loan amount are you looking for?";
    }
    
    if (!userProfile?.hasLoanPurpose) {
      return "What will you use this loan for?";
    }
    
    if (!userProfile?.hasCIBILScore) {
      return "What's your current CIBIL score?";
    }
    
    if (!userProfile?.hasIncome) {
      return "What's your monthly income?";
    }
    
    if (!userProfile?.hasBankPreference) {
      return "Which bank would you prefer for the loan?";
    }
    
    if (conversationStage === 'initial') {
      return "Would you like to know about the application process?";
    }
    
    if (conversationStage === 'exploring') {
      return "Do you need help with the documentation required?";
    }
    
    return "Is there anything else you'd like to know about loans?";
  }
  
  /**
   * Get credit score-specific leading questions
   */
  getCreditLeadingQuestion(context) {
    const { userProfile, conversationStage } = context;
    
    if (!userProfile?.hasCIBILScore) {
      return "What's your current CIBIL score?";
    }
    
    if (conversationStage === 'initial') {
      return "Would you like to know how to improve your credit score?";
    }
    
    if (conversationStage === 'exploring') {
      return "Do you know what factors affect your credit score?";
    }
    
    return "Would you like to know about credit monitoring services?";
  }
  
  /**
   * Get banking-specific leading questions
   */
  getBankingLeadingQuestion(context) {
    const { conversationStage } = context;
    
    if (conversationStage === 'initial') {
      return "Which type of bank account are you interested in?";
    }
    
    if (conversationStage === 'exploring') {
      return "Would you like to know about the benefits of different account types?";
    }
    
    return "Do you need help with online banking setup?";
  }
  
  /**
   * Get investment-specific leading questions
   */
  getInvestmentLeadingQuestion(context) {
    const { conversationStage } = context;
    
    if (conversationStage === 'initial') {
      return "What's your investment goal and timeline?";
    }
    
    if (conversationStage === 'exploring') {
      return "Would you like to know about different investment options?";
    }
    
    return "Do you need help with portfolio diversification?";
  }
  
  /**
   * Get general leading questions
   */
  getGeneralLeadingQuestion(context) {
    const { conversationStage } = context;
    
    const generalQuestions = [
      "Is there anything specific you'd like to know more about?",
      "Would you like me to explain this in more detail?",
      "Do you have any other financial questions?",
      "Is there a particular aspect you'd like to focus on?",
      "Would you like to know about related financial topics?"
    ];
    
    // Return a random general question
    return generalQuestions[Math.floor(Math.random() * generalQuestions.length)];
  }
  
  /**
   * Analyze conversation context to determine user profile
   */
  analyzeConversationContext(transcript, history) {
    const currentTopic = this.extractTopic(transcript);
    const userIntent = this.extractIntent(transcript);
    const conversationStage = this.determineConversationStage(history);
    const userProfile = this.extractUserProfile(transcript, history);
    
    return {
      currentTopic,
      userIntent,
      conversationStage,
      userProfile
    };
  }
  
  /**
   * Extract topic from transcript
   */
  extractTopic(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    if (lowerTranscript.includes('loan') || lowerTranscript.includes('borrow')) {
      return 'loan';
    }
    
    if (lowerTranscript.includes('credit') || lowerTranscript.includes('cibil')) {
      return 'credit_score';
    }
    
    if (lowerTranscript.includes('bank') || lowerTranscript.includes('account')) {
      return 'banking';
    }
    
    if (lowerTranscript.includes('investment') || lowerTranscript.includes('savings')) {
      return 'investment';
    }
    
    if (lowerTranscript.includes('insurance')) {
      return 'insurance';
    }
    
    if (lowerTranscript.includes('tax') || lowerTranscript.includes('gst')) {
      return 'tax';
    }
    
    return 'general';
  }
  
  /**
   * Extract user intent from transcript
   */
  extractIntent(transcript) {
    const lowerTranscript = transcript.toLowerCase();
    
    if (lowerTranscript.includes('how') || lowerTranscript.includes('what') || lowerTranscript.includes('can i')) {
      return 'inquiry';
    }
    
    if (lowerTranscript.includes('want') || lowerTranscript.includes('need') || lowerTranscript.includes('looking for')) {
      return 'request';
    }
    
    if (lowerTranscript.includes('compare') || lowerTranscript.includes('difference')) {
      return 'comparison';
    }
    
    if (lowerTranscript.includes('best') || lowerTranscript.includes('recommend')) {
      return 'recommendation';
    }
    
    return 'general';
  }
  
  /**
   * Determine conversation stage based on history
   */
  determineConversationStage(history) {
    const messageCount = history.length;
    
    if (messageCount <= 2) {
      return 'initial';
    } else if (messageCount <= 4) {
      return 'exploring';
    } else if (messageCount <= 6) {
      return 'detailed';
    } else {
      return 'actionable';
    }
  }
  
  /**
   * Extract user profile information from conversation
   */
  extractUserProfile(transcript, history) {
    const fullText = [...history.map(h => h.content), transcript].join(' ').toLowerCase();
    
    const inferredLoanType = this.inferLoanTypeFromPurpose(fullText);
    const hasExplicitLoanType = this.hasLoanType(fullText);
    
    return {
      hasLoanAmount: this.hasLoanAmount(fullText),
      hasLoanPurpose: this.hasLoanPurpose(fullText),
      hasLoanType: hasExplicitLoanType || !!inferredLoanType,
      explicitLoanType: hasExplicitLoanType ? this.extractExplicitLoanType(fullText) : undefined,
      inferredLoanType,
      hasOnRoadPrice: /(on[-\s]?road|onroad).*(price|cost)/i.test(fullText) || /\b₹|rs|rupee|lakh\b/i.test(fullText),
      hasDownPayment: /(down\s*payment|dp)/i.test(fullText),
      hasTenure: /(tenure|years|months)\s*\d+/i.test(fullText),
      hasCIBILScore: this.hasCIBILScore(fullText),
      hasIncome: this.hasIncome(fullText),
      hasBankPreference: this.hasBankPreference(fullText)
    };
  }
  
  hasLoanAmount(text) {
    return /\d+.*(lakh|thousand|rupee|rs|₹)/i.test(text) || 
           /\d+.*(loan|borrow)/i.test(text);
  }
  
  hasLoanPurpose(text) {
    return /(home|house|car|bike|motorcycle|education|personal|medical|business)/i.test(text);
  }

  inferLoanTypeFromPurpose(text) {
    if (/(car|vehicle|auto)\b/.test(text)) return 'car';
    if (/(home|house|property|mortgage)\b/.test(text)) return 'home';
    if (/(education|student)\b/.test(text)) return 'education';
    if (/(medical|personal)\b/.test(text)) return 'personal';
    if (/(business|working capital|term loan)\b/.test(text)) return 'business';
    return null;
  }

  extractExplicitLoanType(text) {
    const match = /(home loan|personal loan|car loan|bike loan|education loan|business loan)/i.exec(text);
    return match ? match[1].toLowerCase() : undefined;
  }
  
  hasLoanType(text) {
    return /(home loan|personal loan|car loan|bike loan|education loan|business loan)/i.test(text);
  }
  
  hasCIBILScore(text) {
    return /(cibil|credit score|\d{3,4})/i.test(text);
  }
  
  hasIncome(text) {
    return /(income|salary|earning|\d+.*(lakh|thousand).*(per month|monthly))/i.test(text);
  }
  
  hasBankPreference(text) {
    return /(sbi|hdfc|icici|axis|pnb|bob|bank)/i.test(text);
  }
}

module.exports = { ConversationFlowService };