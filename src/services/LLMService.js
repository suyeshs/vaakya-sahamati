/**
 * LLM Service for Google Cloud Platform
 * Manages multiple LLM providers and response generation
 */

const { logger } = require('../utils/logger');
const { VertexAI } = require('@google-cloud/vertexai');
const SharedFunctionSchema = require('./SharedFunctionSchema');

class LLMService {
  constructor(env) {
    this.env = env;
    this.providers = new Map();
    this.currentProvider = null; // Will be set to first available provider
    this.initialized = false;
    this.vertexAI = null;
  }

  async initialize() {
    if (this.initialized) return;

    // Initialize providers
    await this.initializeProviders();

    // Set current provider to first available if not already set
    if (!this.currentProvider && this.providers.size > 0) {
      this.currentProvider = Array.from(this.providers.keys())[0];
    }

    this.initialized = true;
    logger.info('[LLMService] Initialized', {
      currentProvider: this.currentProvider,
      availableProviders: Array.from(this.providers.keys())
    });
  }

  async initializeProviders() {
    // Initialize Vertex AI provider (highest priority) - uses Application Default Credentials
    const projectId = this.env.GOOGLE_CLOUD_PROJECT_ID || this.env.PROJECT_ID || 'sahamati-labs';
    const location = this.env.VERTEX_AI_LOCATION || this.env.LOCATION || 'us-central1';

    try {
      this.vertexAI = new VertexAI({
        project: projectId,
        location: location
      });

      this.providers.set('vertex', {
        name: 'Vertex AI (Gemini)',
        model: this.env.VERTEX_AI_MODEL || 'gemini-2.0-flash-lite',
        projectId: projectId,
        location: location
      });

      logger.info('[LLMService] Vertex AI initialized', { projectId, location });
    } catch (error) {
      logger.warn('[LLMService] Failed to initialize Vertex AI:', error.message);
    }

    // Initialize Sarvam provider
    if (this.env.SARVAM_API_KEY) {
      this.providers.set('sarvam', {
        name: 'Sarvam',
        baseUrl: 'https://api.sarvam.ai/v1',
        apiKey: this.env.SARVAM_API_KEY,
        model: 'sarvam-m'
      });
    }

    // Initialize OpenAI provider (if available)
    if (this.env.OPENAI_API_KEY) {
      this.providers.set('openai', {
        name: 'OpenAI',
        baseUrl: 'https://api.openai.com/v1',
        apiKey: this.env.OPENAI_API_KEY,
        model: 'gpt-3.5-turbo'
      });
    }
  }

  getCurrentProvider() {
    return this.currentProvider;
  }

  setProvider(providerName) {
    if (!this.providers.has(providerName)) {
      throw new Error(`Provider ${providerName} not available`);
    }
    this.currentProvider = providerName;
    logger.info('[LLMService] Provider changed', { provider: providerName });
  }

  getAvailableProviders() {
    return Array.from(this.providers.keys());
  }

  async generateResponse(prompt, context = '', locationContext = {}, options = {}) {
    try {
      const provider = this.providers.get(this.currentProvider);
      if (!provider) {
        throw new Error(`Provider ${this.currentProvider} not found`);
      }

      let response;
      switch (this.currentProvider) {
        case 'sarvam':
          response = await this.generateSarvamResponse(prompt, context, locationContext, provider);
          break;
        case 'vertex':
          response = await this.generateVertexResponse(prompt, context, locationContext, provider, options);
          break;
        case 'openai':
          response = await this.generateOpenAIResponse(prompt, context, locationContext, provider);
          break;
        default:
          throw new Error(`Unsupported provider: ${this.currentProvider}`);
      }

      logger.info('[LLMService] Response generated', { 
        provider: this.currentProvider,
        responseLength: response.length 
      });

      return response;
    } catch (error) {
      // Extract safe error information for logging
      const errorInfo = {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        stack: error.stack
      };
      logger.error('[LLMService] Response generation error:', errorInfo);
      throw error;
    }
  }

  async generateJsonResponse(prompt, context = '', locationContext = {}) {
    try {
      const provider = this.providers.get(this.currentProvider);
      if (!provider) {
        throw new Error(`Provider ${this.currentProvider} not found`);
      }

      let response;
      switch (this.currentProvider) {
        case 'sarvam':
          response = await this.generateSarvamJsonResponse(prompt, context, locationContext, provider);
          break;
        case 'vertex':
          response = await this.generateVertexJsonResponse(prompt, context, locationContext, provider);
          break;
        case 'openai':
          response = await this.generateOpenAIJsonResponse(prompt, context, locationContext, provider);
          break;
        default:
          throw new Error(`Unsupported provider: ${this.currentProvider}`);
      }

      logger.info('[LLMService] JSON response generated', { 
        provider: this.currentProvider,
        responseLength: JSON.stringify(response).length 
      });

      return response;
    } catch (error) {
      // Extract safe error information for logging
      const errorInfo = {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        stack: error.stack
      };
      logger.error('[LLMService] JSON response generation error:', errorInfo);
      throw error;
    }
  }

  async generateSarvamResponse(prompt, context, locationContext, provider) {
    try {
      const response = await fetch(
        `${provider.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              {
                role: 'system',
                content: this.buildSystemPrompt(context, locationContext)
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 512
          })
        }
      );

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      // Extract safe error information for logging
      const errorInfo = {
        message: error.message,
        code: error.code
      };
      logger.error('[LLMService] Sarvam API error:', errorInfo);
      throw error;
    }
  }

  async generateSarvamJsonResponse(prompt, context, locationContext, provider) {
    try {
      const response = await fetch(
        `${provider.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              {
                role: 'system',
                content: this.buildJsonSystemPrompt(context, locationContext)
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 512
          })
        }
      );

      const data = await response.json();
      const content = data.choices[0].message.content;
      return {
        response: content,
        metadata: this.extractMetadata(content)
      };
    } catch (error) {
      // Extract safe error information for logging
      const errorInfo = {
        message: error.message,
        code: error.code
      };
      logger.error('[LLMService] Sarvam JSON API error:', errorInfo);
      throw error;
    }
  }

  async generateVertexResponse(prompt, context, locationContext, provider, options = {}) {
    try {
      if (!this.vertexAI) {
        throw new Error('Vertex AI not initialized');
      }

      const modelToUse = options.modelOverride || provider.model;

      // Use shared function calling schema for consistency across workflows
      const tools = [{
        functionDeclarations: SharedFunctionSchema.getFunctionDeclarations()
      }];

      const generationConfig = {
        maxOutputTokens: 50,
        temperature: 0.3,  // Lower for more deterministic
        topP: 0.8,
        topK: 20
      };

      // Get generative model with function calling
      const model = this.vertexAI.getGenerativeModel({
        model: modelToUse,
        generationConfig,
        tools
      });

      // Build system instruction using shared schema
      const systemInstruction = SharedFunctionSchema.buildSystemPrompt(context, locationContext);

      // Generate content with function calling
      const result = await model.generateContent({
        contents: [
          { role: 'user', parts: [{ text: systemInstruction + "\n\nUser query: " + prompt }] }
        ]
      });

      const response = result.response;

      // Check if model wants to call function
      if (!response.candidates || response.candidates.length === 0) {
        throw new Error('Vertex AI returned no response candidates');
      }

      const candidate = response.candidates[0];

      // Try to extract function call first
      if (candidate.content && candidate.content.parts) {
        for (const part of candidate.content.parts) {
          if (part.functionCall) {
            const funcCall = part.functionCall;
            if (funcCall.name === 'respond_to_financial_query' && funcCall.args) {
              // Use shared function schema for extraction and validation
              const extracted = SharedFunctionSchema.extractFunctionResponse(funcCall);

              logger.info('[LLMService] Function call extracted', {
                response: extracted.response,
                topic: extracted.topic,
                next_action: extracted.next_action
              });

              return extracted.response;
            }
          }
        }
      }

      // Fallback: extract text if no function call
      if (candidate.content && candidate.content.parts && candidate.content.parts.length > 0) {
        const text = candidate.content.parts[0].text;
        if (text && text.trim().length > 0) {
          return SharedFunctionSchema.validateAndCleanResponse(text);
        }
      }

      // Ultimate fallback
      logger.warn('[LLMService] No valid response, using fallback');
      return 'Kya madad chahiye aapko?';
    } catch (error) {
      // Extract safe error information for logging
      const errorInfo = {
        message: error.message,
        code: error.code
      };
      logger.error('[LLMService] Vertex AI error:', errorInfo);

      // Fallback to a more informative error response
      if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error('Vertex AI service unavailable. Please check your network connection.');
      } else {
        throw new Error(`Vertex AI error: ${error.message}`);
      }
    }
  }

  async generateVertexJsonResponse(prompt, context, locationContext, provider) {
    try {
      // Create a JSON-formatted prompt
      const jsonPrompt = `${prompt}

Please respond in the following JSON format:
{
  "response": "your response here",
  "metadata": {
    "confidence": 0.0-1.0,
    "topics": ["topic1", "topic2"],
    "tone": "professional|friendly|educational|conversational",
    "length": "short|moderate|long"
  }
}`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${provider.model}:generateContent?key=${provider.apiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: jsonPrompt
              }]
            }],
            generationConfig: {
              maxOutputTokens: 2048,
              temperature: 0.7,
              topP: 0.8,
              topK: 40
            }
          })
        }
      );

      const data = await response.json();

      // Validate response structure and handle various response formats
      if (!data) {
        logger.error('[LLMService] No response data from Gemini API');
        throw new Error('Gemini API returned no data');
      }

      // Check for API errors in response
      if (data.error) {
        logger.error('[LLMService] Gemini API error in response:', data.error);
        throw new Error(`Gemini API error: ${data.error.message || 'Unknown error'}`);
      }

      // Check for candidates
      if (!data.candidates || data.candidates.length === 0) {
        logger.error('[LLMService] No candidates in Gemini response:', data);
        throw new Error('Gemini API returned no response candidates. This may be due to content filters or safety settings.');
      }

      const candidate = data.candidates[0];
      
      // Check for finish reason (safety filters, etc.)
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        logger.warn('[LLMService] Unusual finish reason:', candidate.finishReason);
        if (candidate.finishReason === 'SAFETY') {
          throw new Error('Response was blocked by safety filters. Please try rephrasing your question.');
        } else if (candidate.finishReason === 'MAX_TOKENS' || candidate.finishReason === 'MAX_OUTPUT_TOKENS') {
          // For MAX_TOKENS, still return the response if we have content
          logger.warn('[LLMService] JSON response hit token limit, returning partial response');
        }
      }
      
      // Validate content structure
      if (!candidate.content || !candidate.content.parts || candidate.content.parts.length === 0) {
        logger.error('[LLMService] Malformed candidate content:', candidate);
        throw new Error('Gemini API response format is not supported. Please try again.');
      }
      
      const responseText = candidate.content.parts[0].text;
      if (!responseText || responseText.trim().length === 0) {
        throw new Error('Gemini API returned empty text response');
      }
      
      // Try to parse JSON response
      try {
        const jsonResponse = JSON.parse(responseText);
        return jsonResponse;
      } catch (parseError) {
        // If JSON parsing fails, return the text response with default metadata
        return {
          response: responseText,
          metadata: {
            confidence: 0.8,
            topics: ['general'],
            tone: 'professional',
            length: 'moderate'
          }
        };
      }
    } catch (error) {
      // Extract safe error information for logging
      const errorInfo = {
        message: error.message,
        code: error.code
      };
      logger.error('[LLMService] Gemini API JSON error:', errorInfo);
      throw error;
    }
  }

  async generateOpenAIResponse(prompt, context, locationContext, provider) {
    try {
      const response = await fetch(
        `${provider.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              {
                role: 'system',
                content: this.buildSystemPrompt(context, locationContext)
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 512
          })
        }
      );

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      // Extract safe error information for logging
      const errorInfo = {
        message: error.message,
        code: error.code
      };
      logger.error('[LLMService] OpenAI API error:', errorInfo);
      throw error;
    }
  }

  async generateOpenAIJsonResponse(prompt, context, locationContext, provider) {
    try {
      const response = await fetch(
        `${provider.baseUrl}/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: provider.model,
            messages: [
              {
                role: 'system',
                content: this.buildJsonSystemPrompt(context, locationContext)
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.7,
            max_tokens: 512
          })
        }
      );

      const data = await response.json();
      const content = data.choices[0].message.content;
      return {
        response: content,
        metadata: this.extractMetadata(content)
      };
    } catch (error) {
      // Extract safe error information for logging
      const errorInfo = {
        message: error.message,
        code: error.code
      };
      logger.error('[LLMService] OpenAI JSON API error:', errorInfo);
      throw error;
    }
  }

  buildSystemPrompt(context, locationContext) {
    return `You are a helpful financial assistant for people in India, especially those from rural areas and vernacular language backgrounds. Your responses are SPOKEN ALOUD.

YOUR MISSION:
Help financially marginalized communities access safe financial services and protect them from fraud. Provide information about loans, savings, insurance, banking, government schemes, and warn about scams.

COMMUNICATION RULES:
1. Speak in simple conversational language - use Hindi, English, or mix as the user does
2. Use everyday words, not technical jargon
3. Keep responses SHORT - maximum 20 words
4. NO special characters: no * - ( ) [ ] etc
5. NO numbered lists or bullet points
6. Ask ONE clear question or give ONE clear answer

FINANCIAL TOPICS YOU HELP WITH:
✓ Loans (home, personal, agriculture, business, education, vehicle)
✓ Savings accounts, fixed deposits, recurring deposits
✓ Insurance (life, health, crop, livestock)
✓ Government schemes (PM-KISAN, Ayushman Bharat, Jan Dhan, pension schemes)
✓ Banking services (account opening, money transfer, ATM, mobile banking)
✓ Payments (UPI, digital payments, bill payments)
✓ Financial literacy and planning

FRAUD PROTECTION - WARN IMMEDIATELY IF USER MENTIONS:
⚠ Someone asking for OTP, PIN, CVV, password
⚠ Calls/SMS asking to share Aadhaar or bank details
⚠ Promises of guaranteed high returns or quick money schemes
⚠ Pressure to invest immediately or send money urgently
⚠ Fake loan offers asking for advance fees
⚠ Phishing links or suspicious apps
⚠ Ponzi schemes, MLM investment schemes
⚠ Impersonation of bank officials or government officers

FRAUD WARNING EXAMPLES:
User: "Someone called saying I won lottery, asking for bank details"
You: "Yeh fraud hai. Apni bank details kabhi na den. Phone cut kar den."

User: "Investment mein double paisa milega"
You: "Sachet rahen. Guaranteed double return fraud hota hai. Mat invest karen."

User: "Loan milega but pehle fees deni hogi"
You: "Sahi loan mein advance fees nahi lete. Yeh scam hai."

NORMAL CONVERSATION STYLE:
User: "Mujhe paise chahiye"
You: "Kya kaam ke liye paise chahiye?"

User: "Ghar banane ke liye"
You: "Kitne paise chahiye?"

User: "Pension scheme ke baare mein batao"
You: "Aapki umar kitni hai?"

Be patient, respectful, helpful, and ALWAYS protect users from fraud.

Context: ${context}
Location: ${locationContext.country || 'India'}`;
  }

  buildJsonSystemPrompt(context, locationContext) {
    return `You are a helpful financial assistant. Respond with a JSON object containing:
{
  "response": "Your helpful response",
  "confidence": 0.0-1.0,
  "topics": ["topic1", "topic2"],
  "tone": "professional|friendly|urgent",
  "length": "short|medium|long",
  "sentiment": "positive|neutral|negative",
  "urgency": "low|medium|high"
}

Context: ${context}
Location: ${locationContext.country || 'India'}, ${locationContext.region || 'India'}, ${locationContext.city || 'Mumbai'}`;
  }

  extractMetadata(content) {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          confidence: parsed.confidence || 0.7,
          topics: parsed.topics || ['general'],
          tone: parsed.tone || 'professional',
          length: parsed.length || 'medium',
          sentiment: parsed.sentiment || 'neutral',
          urgency: parsed.urgency || 'low'
        };
      }
    } catch (error) {
      logger.warn('[LLMService] Failed to parse JSON metadata:', error);
    }

    return {
      confidence: 0.7,
      topics: ['general'],
      tone: 'professional',
      length: 'medium',
      sentiment: 'neutral',
      urgency: 'low'
    };
  }

  validateAndCleanResponse(text) {
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

      // Limit to 15 words
      const words = cleaned.split(/\s+/).filter(w => w.length > 0);
      if (words.length > 15) {
        cleaned = words.slice(0, 15).join(' ');
      }

      // Ensure it ends with question mark if it's a question
      if (cleaned.length > 0 && !cleaned.endsWith('?') && !cleaned.endsWith('.')) {
        // Check if it's likely a question
        const questionWords = ['what', 'which', 'how', 'when', 'where', 'who', 'why', 'kya', 'kaise', 'kab', 'kahan', 'kaun', 'kyun', 'kitna'];
        const firstWord = words[0]?.toLowerCase();
        if (questionWords.includes(firstWord)) {
          cleaned += '?';
        }
      }

      // Final validation: ensure minimum quality
      if (cleaned.length < 5 || words.length < 2) {
        logger.warn('[LLMService] Response too short after cleaning, using fallback');
        return 'Kya madad chahiye aapko?';
      }

      logger.info('[LLMService] Response cleaned', {
        original: text.substring(0, 50),
        cleaned: cleaned,
        wordCount: words.length
      });

      return cleaned;
    } catch (error) {
      logger.error('[LLMService] Error cleaning response:', error);
      return 'Kya madad chahiye aapko?';
    }
  }

  async cleanup() {
    logger.info('[LLMService] Cleanup completed');
  }
}

module.exports = LLMService;