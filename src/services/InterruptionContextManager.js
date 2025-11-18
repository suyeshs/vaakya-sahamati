/**
 * Interruption Context Manager
 * Manages conversation context across interruptions
 */

const { logger } = require('../utils/logger');

class InterruptionContextManager {
  constructor() {
    this.interruptionStack = [];
    this.maxStackSize = 3; // Remember last 3 interruptions
  }

  /**
   * Save context when interrupted
   * @param {object} interruption - Interruption event
   * @param {object} aiResponse - AI's response that was interrupted
   * @returns {object} Saved context
   */
  saveInterruptionContext(interruption, aiResponse) {
    const context = {
      timestamp: Date.now(),
      interruptionType: interruption.type,
      aiResponse: {
        fullText: aiResponse?.text || '',
        spokenText: interruption.partialText?.spoken || '',
        remainingText: interruption.partialText?.remaining || '',
        progress: interruption.timing?.progress || 0
      },
      userInterruption: {
        partialText: interruption.partialText,
        confidence: interruption.confidence,
        audioIntensity: interruption.audioIntensity
      },
      canResume: this.shouldAllowResume(interruption)
    };

    this.interruptionStack.push(context);

    // Maintain stack size
    if (this.interruptionStack.length > this.maxStackSize) {
      this.interruptionStack.shift();
    }

    logger.info('[InterruptionContext] Context saved', {
      type: interruption.type,
      progress: context.aiResponse.progress,
      canResume: context.canResume
    });

    return context;
  }

  /**
   * Decide if we should offer to resume
   */
  shouldAllowResume(interruption) {
    // Don't resume for corrections (user wants fresh response)
    if (interruption.type === 'CORRECTION') return false;

    // Don't resume if urgent (user has priority)
    if (interruption.type === 'URGENT') return false;

    // Don't resume if very early interruption (< 20%)
    if (interruption.timing && interruption.timing.progress < 0.2) return false;

    // Don't resume if almost done (> 90%)
    if (interruption.timing && interruption.timing.progress > 0.9) return false;

    // Allow resume for clarifications and mid-conversation barge-ins
    return true;
  }

  /**
   * Get most recent interruptible context
   */
  getLastInterruptibleContext() {
    for (let i = this.interruptionStack.length - 1; i >= 0; i--) {
      if (this.interruptionStack[i].canResume) {
        return this.interruptionStack[i];
      }
    }
    return null;
  }

  /**
   * Build context-aware prompt for LLM
   */
  buildContextualPrompt(userMessage, lastContext) {
    if (!lastContext) {
      return {
        prompt: userMessage,
        hasContext: false
      };
    }

    const contextPrompt = `[CONVERSATION CONTEXT]
I was saying: "${lastContext.aiResponse.spokenText}"
I was interrupted at ${(lastContext.aiResponse.progress * 100).toFixed(0)}% through my response.
The user interrupted to say: "${userMessage}"
Interruption type: ${lastContext.interruptionType}

[INSTRUCTIONS]
- If the user wants clarification on what I said, explain that part clearly
- If the user is correcting me, acknowledge gracefully and provide corrected response
- If the user wants me to continue, offer to resume or rephrase
- If the user has a new question, answer it directly while being aware of the context

User's message: ${userMessage}`;

    return {
      prompt: contextPrompt,
      hasContext: true,
      context: lastContext
    };
  }

  /**
   * Generate natural resume response
   */
  generateResumeResponse(context, language = 'en') {
    const resumePhrases = {
      en: [
        `Should I continue from where I left off? I was saying: "${this.truncate(context.aiResponse.spokenText, 50)}..."`,
        `Let me continue. ${context.aiResponse.remainingText}`,
        `To finish my previous point: ${context.aiResponse.remainingText}`
      ],
      hi: [
        `क्या मैं जहाँ से रुका था वहां से जारी रखूं? मैं कह रहा था: "${this.truncate(context.aiResponse.spokenText, 50)}..."`,
        `मुझे जारी रखने दें। ${context.aiResponse.remainingText}`,
        `अपनी पिछली बात पूरी करने के लिए: ${context.aiResponse.remainingText}`
      ],
      ta: [
        `நான் விட்ட இடத்தில் இருந்து தொடரட்டுமா? நான் சொல்லிக் கொண்டிருந்தது: "${this.truncate(context.aiResponse.spokenText, 50)}..."`,
        `தொடர அனுமதிக்கவும். ${context.aiResponse.remainingText}`
      ],
      te: [
        `నేను ఆగిపోయిన చోటు నుండి కొనసాగించాలా? నేను చెబుతున్నది: "${this.truncate(context.aiResponse.spokenText, 50)}..."`,
        `కొనసాగించనివ్వండి। ${context.aiResponse.remainingText}`
      ],
      bn: [
        `আমি কি থেমে গিয়েছিলাম যেখানে সেখান থেকে চালিয়ে যাবো? আমি বলছিলাম: "${this.truncate(context.aiResponse.spokenText, 50)}..."`,
        `আমাকে চালিয়ে যেতে দিন। ${context.aiResponse.remainingText}`
      ]
    };

    const phrases = resumePhrases[language] || resumePhrases.en;
    return phrases[Math.floor(Math.random() * phrases.length)];
  }

  /**
   * Get interruption pattern analysis
   */
  getInterruptionPattern() {
    if (this.interruptionStack.length === 0) {
      return {
        frequency: 'none',
        mostCommonType: null,
        trend: 'stable'
      };
    }

    // Count interruption types
    const typeCounts = {};
    this.interruptionStack.forEach(ctx => {
      const type = ctx.interruptionType;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    });

    // Find most common type
    let mostCommonType = null;
    let maxCount = 0;
    for (const [type, count] of Object.entries(typeCounts)) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonType = type;
      }
    }

    // Determine frequency
    let frequency = 'low';
    if (this.interruptionStack.length >= 2) frequency = 'medium';
    if (this.interruptionStack.length >= 3) frequency = 'high';

    // Analyze trend (are interruptions increasing?)
    let trend = 'stable';
    if (this.interruptionStack.length >= 2) {
      const recentInterval = this.interruptionStack[this.interruptionStack.length - 1].timestamp -
                            this.interruptionStack[this.interruptionStack.length - 2].timestamp;
      const oldInterval = this.interruptionStack.length >= 3 ?
                         this.interruptionStack[this.interruptionStack.length - 2].timestamp -
                         this.interruptionStack[this.interruptionStack.length - 3].timestamp : null;

      if (oldInterval) {
        if (recentInterval < oldInterval * 0.7) {
          trend = 'increasing';
        } else if (recentInterval > oldInterval * 1.5) {
          trend = 'decreasing';
        }
      }
    }

    return {
      frequency,
      mostCommonType,
      trend,
      totalCount: this.interruptionStack.length
    };
  }

  /**
   * Truncate text to max length
   */
  truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(text.length - maxLength);
  }

  /**
   * Clear stack
   */
  clear() {
    this.interruptionStack = [];
    logger.info('[InterruptionContext] Stack cleared');
  }

  /**
   * Get stack size
   */
  getStackSize() {
    return this.interruptionStack.length;
  }
}

module.exports = InterruptionContextManager;
