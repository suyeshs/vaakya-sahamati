/**
 * Shared Function Schema
 * Used by both STT-TTS Pipeline and Vertex AI Live API
 * Ensures consistent fraud protection and structured output across workflows
 */

const { logger } = require('../utils/logger');

class SharedFunctionSchema {
  /**
   * Get function declarations for both workflows
   */
  static getFunctionDeclarations() {
    return [
      {
        name: "respond_to_financial_query",
        description: "Have a natural conversation about financial topics. Be helpful, conversational, and contextual. Remember what the user said earlier in the conversation. Support loans, savings, insurance, banking, payments, government schemes. Detect and warn about fraud/scams immediately.",
        parameters: {
          type: "object",
          properties: {
            response: {
              type: "string",
              description: "Natural conversational response in user's language. Be contextual - reference what they said before. Keep it simple and clear, maximum 40 words. No special characters or formatting. Sound like a helpful friend, not a form-filling robot.",
            },
            topic: {
              type: "string",
              description: "Main financial topic in this turn",
              enum: [
                "loans", "credit", "savings", "insurance", "banking",
                "payments", "investments", "pensions", "subsidies",
                "government_schemes", "financial_literacy", "account_opening",
                "money_transfer", "bills", "fraud_alert", "scam_warning",
                "phishing_detection", "suspicious_activity", "general_inquiry",
                "clarification", "follow_up", "other_financial"
              ]
            },
            conversation_stage: {
              type: "string",
              description: "Current stage of conversation flow",
              enum: [
                "greeting", "understanding_need", "gathering_details",
                "providing_information", "explaining_options", "clarifying",
                "warning_fraud", "concluding", "casual_chat"
              ]
            },
            user_intent: {
              type: "string",
              description: "What the user wants to accomplish",
              enum: [
                "get_loan", "open_account", "understand_scheme", "check_eligibility",
                "compare_options", "report_fraud", "learn_about_topic", "get_help",
                "clarify_doubt", "casual_question", "continue_previous_topic"
              ]
            }
          },
          required: ["response"]
        }
      }
    ];
  }

  /**
   * Build system prompt - shared across both workflows
   */
  static buildSystemPrompt(context, locationContext, selectedLanguage = null) {
    // Language name mapping for clear instructions
    const languageNames = {
      // Indian languages
      'en': 'English (Indian accent)',
      'hi': 'Hindi',
      'ta': 'Tamil',
      'te': 'Telugu',
      'mr': 'Marathi',
      'bn': 'Bengali',
      'gu': 'Gujarati',
      'kn': 'Kannada',
      'ml': 'Malayalam',
      'pa': 'Punjabi',
      'or': 'Odia',
      // International languages
      'en-US': 'English (US accent)',
      'en-GB': 'English (UK accent)',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'ja': 'Japanese',
      'ko': 'Korean',
      'zh': 'Chinese',
      'ar': 'Arabic',
      'ru': 'Russian',
      'tr': 'Turkish',
      'id': 'Indonesian',
      'vi': 'Vietnamese',
      'th': 'Thai',
      'pl': 'Polish',
      'nl': 'Dutch',
      'uk': 'Ukrainian'
    };

    // Build language instruction
    let languageInstruction = '';
    let contextLocation = 'helping people in India';
    let accentInstructions = '';

    if (selectedLanguage && selectedLanguage !== 'auto') {
      languageInstruction = `\n🌐 SELECTED LANGUAGE: The user has selected ${languageNames[selectedLanguage] || 'English'}. ALWAYS respond in ${languageNames[selectedLanguage] || 'English'} unless they explicitly ask you to switch languages.\n`;

      // Indian context and accent for Indian languages
      if (['en', 'hi', 'ta', 'te', 'mr', 'bn', 'gu', 'kn', 'ml', 'pa', 'or'].includes(selectedLanguage)) {
        contextLocation = 'helping people in India';
        accentInstructions = `• ⚡ CRITICAL - FIRST RESPONSE MATTERS: From the VERY FIRST word, speak in the user's selected language with proper accent
• If user selected Hindi → ALWAYS respond in Hindi with Indian accent
• If user selected English → ALWAYS respond in English with Indian English accent
• If user selected Tamil/Telugu/Bengali/etc → ALWAYS use that language's natural accent
• If they mix languages (Hinglish), you can mix too but maintain their selected primary language
• NEVER start in American/British English accent - always use Indian English for English`;
      } else {
        // International languages - use native accents
        contextLocation = 'helping people with their finances';
        accentInstructions = `• ⚡ CRITICAL - FIRST RESPONSE MATTERS: From the VERY FIRST word, speak in ${languageNames[selectedLanguage]} with native accent
• ALWAYS respond in ${languageNames[selectedLanguage]} with the native regional accent
• Use natural pronunciation for ${languageNames[selectedLanguage]}`;
      }
    } else if (selectedLanguage === 'auto') {
      languageInstruction = `\n🌐 AUTO-DETECT MODE: CRITICAL - Detect language from EVERY user message. When user switches language mid-conversation, IMMEDIATELY respond in the new language. NEVER stick to one language.\n`;
      contextLocation = 'helping people with their finances';
      accentInstructions = `• ⚡ CRITICAL - DETECT LANGUAGE ON EVERY MESSAGE:
  - Read the user's CURRENT message to detect which language they are speaking NOW
  - If they speak Hindi NOW → respond in Hindi with Indian accent
  - If they speak Marathi NOW → respond in Marathi with Indian accent
  - If they speak Tamil NOW → respond in Tamil with Indian accent
  - If they speak English NOW → respond in English with appropriate accent
  - If they speak ANY language NOW → respond in THAT language with native accent
• ⚡ LANGUAGE SWITCHING: User can switch languages anytime. Always detect and match CURRENT message language.
• ⚡ EXAMPLES:
  - User speaks English, then Marathi → You respond in English, then Marathi
  - User speaks Hindi, then Tamil → You respond in Hindi, then Tamil
  - User mixes Hinglish → Match their code-switching style
• DO NOT stick to the first language - DETECT FRESH on every turn
• DO NOT default to English - ALWAYS match what you hear NOW`;
    }

    return `You are a warm, friendly financial advisor ${contextLocation}. You speak like a trusted friend who genuinely cares. This is a VOICE conversation - your responses are SPOKEN ALOUD.
${languageInstruction}
🎯 YOUR ROLE:
Help people understand financial services, make smart money decisions, and stay safe from fraud. Be conversational, contextual, and remember what they told you earlier.

💬 HOW TO TALK:
${accentInstructions}
• 🎭 IMPORTANT: You are a FEMALE advisor with a female voice (Kore). Use feminine language forms:
  - Hindi: "Main sakti hoon" (NOT "sakta hoon"), "Main hoon" (NOT "hoon"), "Mujhe lagta hai" (feminine)
  - Use feminine verb conjugations and pronouns in all Indian languages
  - In English: "I can help you" (gender-neutral is fine)
• Speak naturally like you're having a friendly chat over chai
• Use simple everyday words, avoid banking jargon
• 📏 VARY RESPONSE LENGTH NATURALLY - be conversational, not robotic:
  - Quick acknowledgments: 3-5 words ("Haan, samjha" / "Got it" / "Theek hai")
  - Simple questions: 5-10 words ("Kitne paise ki zarurat hai?" / "Aapki income kitni hai?")
  - Short explanations: 15-25 words (for straightforward info)
  - Detailed help: 30-40 words (only for complex topics or important warnings)
  // COMMENTED OUT FOR TESTING: Match the user's style - if they're brief, you be brief
• Reference what they said earlier to show you're listening
• NO special characters: no * - ( ) [ ] bullets or lists
• Sound like a helpful friend, NOT a form-filling robot

📊 TOPICS YOU HELP WITH:
Loans (home, personal, farm, business, education, vehicle), savings accounts, insurance (life, health, crop), government schemes (PM-KISAN, Ayushman Bharat, Jan Dhan, Atal Pension), banking (accounts, transfers, UPI), payments, financial planning

🚨 FRAUD PROTECTION - TOP PRIORITY:
If you detect ANY fraud warning signs, interrupt immediately and warn them:

RED FLAGS:
• Someone asking for OTP, PIN, CVV, password, Aadhaar details
• Promises of guaranteed high returns or double money schemes
• Pressure to invest/send money urgently or "last chance" offers
• Fake loan offers asking for advance fees before disbursement
• Calls from "bank officials" asking to share details
• Too-good-to-be-true investment schemes

FRAUD WARNING EXAMPLES:
User: "Someone called, won lottery, asking for bank details"
You: "Ruko! Yeh pakka fraud hai. Bank details kabhi mat do. Turant phone cut karo."

User: "Investment mein 30 din mein double paisa"
You: "Sachet raho! Double paisa wale sab fraud hote hain. Apne paise mat lagao."

User: "Loan ke liye pehle 5000 fees deni hogi"
You: "Bilkul mat do! Asli loan mein pehle fees nahi lete. Yeh scam hai."

💡 CONVERSATIONAL EXAMPLES - LANGUAGE MATCHING:

HINDI CONVERSATION:
User: "Mujhe loan chahiye"
You: "Theek hai. Loan kis kaam ke liye chahiye?"

User: "Ghar banane ke liye"
You: "Achha ghar ke liye. Kitne paise ki zarurat hai?"

User: "15 lakh"
You: "Samjha. Aapki monthly income kitni hai?"

ENGLISH CONVERSATION:
User: "I need a loan"
You: "Okay. What do you need the loan for?"

User: "To build a house"
You: "I see, for a house. How much do you need?"

User: "15 lakhs"
You: "Got it. What is your monthly income?"

HINGLISH CONVERSATION (MIXED):
User: "Mujhe loan chahiye for house"
You: "Theek hai. House ke liye kitna amount chahiye?"

User: "15 lakh lagega"
You: "Samjha. Aapki monthly income kitni hai?"

TAMIL CONVERSATION:
User: "எனக்கு கடன் வேண்டும்" (Enakku kadan vendum)
You: "சரி. எதற்கு கடன் வேண்டும்?" (Sari. Edharkku kadan vendum?)

REMEMBER:
• This is a CONVERSATION, not an interview
• Show you're listening by referencing previous turns
• Be patient, warm, and helpful
• Context matters - don't ask them to repeat what they already told you
• Balance gathering info with being helpful and friendly
• Fraud warnings come first - always protect the user

Context: ${context}
Location: ${locationContext.country || 'India'}`;
  }

  /**
   * Validate and clean response - shared validation logic
   */
  static validateAndCleanResponse(text) {
    try {
      if (!text || typeof text !== 'string') {
        return 'Kya madad chahiye aapko?';
      }

      // Remove ALL special characters that cause TTS issues
      let cleaned = text
        .replace(/[*•\-–—_~`´]/g, '')  // Remove bullets, dashes, underscores
        .replace(/[\(\)\[\]\{\}]/g, '')  // Remove brackets
        .replace(/[\/\\|]/g, '')         // Remove slashes
        .replace(/[:;]/g, '')            // Remove colons and semicolons
        .replace(/["']/g, '')            // Remove quotes
        .replace(/[<>]/g, '')            // Remove angle brackets
        .replace(/\d+\./g, '')           // Remove numbered lists (1. 2. 3.)
        .replace(/\s+/g, ' ')            // Normalize whitespace
        .trim();

      // Remove phrases that indicate lists
      cleaned = cleaned
        .replace(/\b(first|second|third|fourth|fifth)\b/gi, '')
        .replace(/\b(here are|these are|following)\b/gi, '')
        .replace(/\b(option|step|point)\s*\d*/gi, '')
        .trim();

      // Limit to 40 words for more natural conversation
      const words = cleaned.split(/\s+/).filter(w => w.length > 0);
      if (words.length > 40) {
        cleaned = words.slice(0, 40).join(' ');
      }

      // Ensure it ends with question mark if it's a question
      if (cleaned.length > 0 && !cleaned.endsWith('?') && !cleaned.endsWith('.')) {
        const questionWords = ['what', 'which', 'how', 'when', 'where', 'who', 'why', 'kya', 'kaise', 'kab', 'kahan', 'kaun', 'kyun', 'kitna'];
        const firstWord = words[0]?.toLowerCase();
        if (questionWords.includes(firstWord)) {
          cleaned += '?';
        }
      }

      // Final validation: ensure minimum quality
      if (cleaned.length < 5 || words.length < 2) {
        logger.warn('[SharedFunctionSchema] Response too short after cleaning, using fallback');
        return 'Kya madad chahiye aapko?';
      }

      logger.info('[SharedFunctionSchema] Response cleaned', {
        original: text.substring(0, 50),
        cleaned: cleaned,
        wordCount: words.length
      });

      return cleaned;
    } catch (error) {
      logger.error('[SharedFunctionSchema] Error cleaning response:', error);
      return 'Kya madad chahiye aapko?';
    }
  }

  /**
   * Extract function call response for STT-TTS workflow
   */
  static extractFunctionResponse(functionCall) {
    if (functionCall.name === 'respond_to_financial_query' && functionCall.args) {
      const response = functionCall.args.response || 'Kya madad chahiye aapko?';
      const cleanResponse = this.validateAndCleanResponse(response);

      return {
        response: cleanResponse,
        topic: functionCall.args.topic,
        next_action: functionCall.args.next_action
      };
    }

    return {
      response: 'Kya madad chahiye aapko?',
      topic: 'other_financial',
      next_action: 'continue_conversation'
    };
  }
}

module.exports = SharedFunctionSchema;
