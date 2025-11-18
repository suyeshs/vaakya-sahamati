/**
 * Interruption-Aware Response Generator
 * Generates LLM responses that acknowledge and handle interruptions naturally
 */

const { logger } = require('../utils/logger');
const InterruptionContextManager = require('./InterruptionContextManager');

class InterruptionAwareResponseGenerator {
  constructor(llmService) {
    this.llmService = llmService;
    this.contextManager = new InterruptionContextManager();
  }

  /**
   * Generate response that acknowledges interruption
   * @param {string} userMessage - User's message after interruption
   * @param {object} interruption - Interruption event
   * @param {object} session - Session data
   * @returns {Promise<object>} Generated response
   */
  async generateResponse(userMessage, interruption, session) {
    // 1. Check if we need to acknowledge the interruption
    const needsAcknowledgment = this.needsInterruptionAcknowledgment(interruption);

    // 2. Get last interrupted context
    const lastContext = this.contextManager.getLastInterruptibleContext();

    // 3. Build contextual prompt
    let prompt = userMessage;
    let hasContext = false;

    if (lastContext) {
      const contextualPrompt = this.contextManager.buildContextualPrompt(userMessage, lastContext);
      prompt = contextualPrompt.prompt;
      hasContext = contextualPrompt.hasContext;
    }

    // 4. Build interruption-aware system instruction
    const systemInstruction = this.buildInterruptionAwareInstruction(
      interruption,
      needsAcknowledgment,
      session.responseStyle
    );

    // 5. Generate response using LLM
    const response = await this.llmService.generateResponse(prompt, {
      sessionId: session.id,
      language: session.language,
      systemInstruction: systemInstruction,
      context: lastContext,
      maxTokens: this.getMaxTokens(session.responseStyle)
    });

    // 6. Add natural acknowledgment if needed
    let finalText = response.text;
    if (needsAcknowledgment) {
      finalText = this.prependAcknowledgment(response.text, interruption, session.language);
    }

    logger.info('[InterruptionAwareResponse] Generated', {
      sessionId: session.id,
      interruptionType: interruption.type,
      hasContext,
      needsAck: needsAcknowledgment,
      responseLength: finalText.length
    });

    return {
      text: finalText,
      originalText: response.text,
      hasAcknowledgment: needsAcknowledgment,
      hasContext: hasContext,
      interruptionType: interruption.type
    };
  }

  /**
   * Determine if interruption needs acknowledgment
   */
  needsInterruptionAcknowledgment(interruption) {
    // Acknowledge clarifications and corrections
    if (interruption.type === 'CLARIFICATION') return true;
    if (interruption.type === 'CORRECTION') return true;
    if (interruption.type === 'URGENT') return true;

    // Don't explicitly acknowledge smooth barge-ins
    return false;
  }

  /**
   * Build interruption-aware system instruction
   */
  buildInterruptionAwareInstruction(interruption, needsAck, responseStyle = {}) {
    const baseInstruction = `You are a helpful AI assistant in a natural voice conversation.`;

    // Interruption-specific instructions
    const interruptionInstructions = {
      CLARIFICATION: `
The user interrupted to ask for clarification.
- Be concise and clear
- Repeat the relevant part they asked about
- Don't be defensive or apologetic beyond a brief acknowledgment
- Focus on answering their question directly
      `,
      CORRECTION: `
The user interrupted to correct something.
- Acknowledge their correction gracefully ("Oh, I understand now...", "You're right...")
- Provide the corrected information immediately
- Don't repeat the wrong information
- Move forward with the correct understanding
      `,
      URGENT: `
The user urgently interrupted.
- Respond promptly and directly
- Be concise - they wanted your attention for a reason
- Ask if they need immediate help
- Don't continue your previous point unless they ask
      `,
      BARGE_IN: `
The user interrupted mid-conversation.
- Continue naturally as if in a normal conversation
- Don't mention the interruption
- Be flexible and adaptive to their new direction
- If they're changing topics, follow their lead
      `,
      CUT_OFF: `
The user stopped you and started over.
- Treat this as a fresh start
- Don't reference what you were saying before
- Focus entirely on their new message
      `
    };

    // Response style instructions
    let styleInstruction = '';
    if (responseStyle.style === 'concise') {
      styleInstruction = `\n- Keep responses under ${responseStyle.maxWords || 50} words\n- Be direct and to the point\n- Avoid unnecessary elaboration`;
    } else if (responseStyle.style === 'detailed') {
      styleInstruction = `\n- Provide detailed explanations\n- Include examples when helpful\n- Be thorough but organized`;
    } else if (responseStyle.style === 'simple') {
      styleInstruction = `\n- Use simple, clear language\n- Avoid jargon and technical terms\n- Be patient and reassuring`;
    }

    const typeInstruction = interruptionInstructions[interruption.type] || interruptionInstructions.BARGE_IN;

    return baseInstruction + '\n' + typeInstruction + styleInstruction;
  }

  /**
   * Prepend acknowledgment to response
   */
  prependAcknowledgment(responseText, interruption, language = 'en') {
    const acknowledgments = {
      en: {
        CLARIFICATION: ['Let me clarify: ', 'Sure, ', 'Of course - ', 'To explain that - '],
        CORRECTION: ['Oh, I understand now. ', "You're right, ", 'Got it - ', 'I see, '],
        URGENT: ["Yes, I'm here. ", 'What do you need? ', "I'm listening - ", 'Yes? ']
      },
      hi: {
        CLARIFICATION: ['मुझे स्पष्ट करने दें: ', 'ज़रूर, ', 'बिल्कुल - ', 'समझाने के लिए - '],
        CORRECTION: ['ओह, अब मैं समझा। ', 'आप सही हैं, ', 'समझ गया - ', 'मैं समझा, '],
        URGENT: ['हाँ, मैं यहाँ हूँ। ', 'आपको क्या चाहिए? ', 'मैं सुन रहा हूँ - ', 'हाँ? ']
      },
      ta: {
        CLARIFICATION: ['தெளிவுபடுத்துகிறேன்: ', 'நிச்சயமாக, ', 'நிச்சயமாக - '],
        CORRECTION: ['ஓ, இப்போது புரிகிறது. ', 'நீங்கள் சரி, ', 'புரிந்தது - '],
        URGENT: ['ஆமா, நான் இங்கே இருக்கிறேன். ', 'உங்களுக்கு என்ன வேண்டும்? ', 'கேட்கிறேன் - ']
      },
      te: {
        CLARIFICATION: ['స్పష్టం చేస్తాను: ', 'ఖచ్చితంగా, ', 'ఖచ్చితంగా - '],
        CORRECTION: ['ఓహ్, ఇప్పుడు అర్థమైంది. ', 'మీరు సరి, ', 'అర్థమైంది - '],
        URGENT: ['అవును, నేను ఇక్కడ ఉన్నాను। ', 'మీకు ఏమి కావాలి? ', 'వింటున్నాను - ']
      },
      bn: {
        CLARIFICATION: ['আমি স্পষ্ট করছি: ', 'অবশ্যই, ', 'অবশ্যই - '],
        CORRECTION: ['ওহ, এখন বুঝলাম। ', 'আপনি ঠিক বলেছেন, ', 'বুঝেছি - '],
        URGENT: ['হ্যাঁ, আমি এখানে আছি। ', 'আপনার কি দরকার? ', 'শুনছি - ']
      }
    };

    const langAcks = acknowledgments[language] || acknowledgments.en;
    const typeAcks = langAcks[interruption.type];

    if (!typeAcks) {
      return responseText;
    }

    const ack = typeAcks[Math.floor(Math.random() * typeAcks.length)];
    return ack + responseText;
  }

  /**
   * Get max tokens based on response style
   */
  getMaxTokens(responseStyle = {}) {
    const styleTokens = {
      concise: 100,
      detailed: 300,
      simple: 150,
      normal: 200
    };

    return styleTokens[responseStyle.style] || styleTokens.normal;
  }

  /**
   * Save interruption context for future reference
   */
  saveInterruptionContext(interruption, aiResponse) {
    return this.contextManager.saveInterruptionContext(interruption, aiResponse);
  }

  /**
   * Get interruption pattern analysis
   */
  getInterruptionPattern() {
    return this.contextManager.getInterruptionPattern();
  }

  /**
   * Clear context
   */
  clearContext() {
    this.contextManager.clear();
  }

  /**
   * Get context manager (for external access)
   */
  getContextManager() {
    return this.contextManager;
  }
}

module.exports = InterruptionAwareResponseGenerator;
