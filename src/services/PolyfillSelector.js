/**
 * Polyfill Selector
 * Selects and generates appropriate polyfill responses for conversation issues
 */

const { logger } = require('../utils/logger');
const path = require('path');
const fs = require('fs').promises;

class PolyfillSelector {
  constructor(multiLangService) {
    this.multiLangService = multiLangService;
    this.audioCache = new Map();
    this.usageStats = new Map();
    this.libraryPath = path.join(__dirname, '../../audio-polyfills');
    this.manifestLoaded = false;
    this.manifest = null;
  }

  /**
   * Initialize by loading audio manifest
   */
  async initialize() {
    try {
      const manifestPath = path.join(this.libraryPath, 'manifest.json');
      const manifestData = await fs.readFile(manifestPath, 'utf-8');
      this.manifest = JSON.parse(manifestData);
      this.manifestLoaded = true;

      logger.info('[PolyfillSelector] Initialized', {
        totalFiles: this.manifest.totalFiles,
        languages: Object.keys(this.manifest.languages).length
      });
    } catch (error) {
      logger.warn('[PolyfillSelector] No manifest found, will use TTS generation', {
        error: error.message
      });
      this.manifestLoaded = false;
    }
  }

  /**
   * Select appropriate polyfill response
   * @param {object} issue - Issue object
   * @param {object} context - Conversation context
   * @returns {Promise<object>} Polyfill response
   */
  async selectPolyfill(issue, context = {}) {
    const { type, severity, language = 'en' } = issue;
    const { attemptCount = 0, userFrustrationLevel = 0 } = context;

    // 1. Check for pre-cached audio (instant response)
    const cacheKey = `${language}:${type}:${severity}`;
    if (this.audioCache.has(cacheKey)) {
      this.recordUsage(cacheKey, 'cache');
      return {
        source: 'cache',
        audio: this.audioCache.get(cacheKey).audio,
        text: this.audioCache.get(cacheKey).text,
        latency: 0
      };
    }

    // 2. Try pre-generated audio library (fast)
    if (this.manifestLoaded) {
      const audioFile = await this.getAudioFromLibrary(type, language, context);
      if (audioFile) {
        this.recordUsage(cacheKey, 'library');
        // Cache for future use
        this.audioCache.set(cacheKey, {
          audio: audioFile.audio,
          text: audioFile.text
        });
        return {
          source: 'library',
          audio: audioFile.audio,
          text: audioFile.text,
          latency: audioFile.latency
        };
      }
    }

    // 3. Generate on-the-fly with TTS (slower, but flexible)
    const text = this.generateContextualPolyfill(issue, context);
    const startTime = Date.now();
    const audio = await this.generateTTS(text, language);
    const latency = Date.now() - startTime;

    // Cache for future use
    this.audioCache.set(cacheKey, { audio, text });
    this.recordUsage(cacheKey, 'generated');

    return {
      source: 'generated',
      audio: audio,
      text: text,
      latency: latency
    };
  }

  /**
   * Get audio from pre-generated library
   */
  async getAudioFromLibrary(type, language, context) {
    try {
      const langData = this.manifest.languages[language];
      if (!langData || !langData[type]) {
        return null;
      }

      const variations = langData[type];
      if (!variations || variations.length === 0) {
        return null;
      }

      // Select variation (rotate based on attempt count to avoid repetition)
      const variation = variations[context.attemptCount % variations.length];

      const audioPath = path.join(this.libraryPath, language, variation.file);
      const startTime = Date.now();
      const audioBuffer = await fs.readFile(audioPath);
      const latency = Date.now() - startTime;

      return {
        audio: audioBuffer,
        text: variation.text,
        latency: latency
      };
    } catch (error) {
      logger.warn('[PolyfillSelector] Failed to load from library', {
        type,
        language,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Generate contextual polyfill text
   */
  generateContextualPolyfill(issue, context) {
    const { type, language = 'en' } = issue;
    const { attemptCount = 0, userFrustrationLevel = 0 } = context;

    // Check for empathetic response after multiple attempts
    if (attemptCount > 2) {
      return this.getEmpatheticResponse(type, language);
    }

    // Apologetic tone for frustrated users
    if (userFrustrationLevel > 0.7) {
      return this.getApologeticResponse(type, language);
    }

    // Get standard polyfill phrases
    const templates = this.getPolyfillTemplates(language, type);

    // Random selection to avoid repetition
    const randomIndex = Math.floor(Math.random() * templates.length);
    return templates[randomIndex];
  }

  /**
   * Get polyfill templates
   */
  getPolyfillTemplates(language, type) {
    const templates = {
      en: {
        LONG_PAUSE: [
          "I'm listening, please take your time.",
          "Are you still there? I'm here to help.",
          "No worries, whenever you're ready."
        ],
        LOW_CONFIDENCE: [
          "I didn't quite catch that. Could you please repeat?",
          "Sorry, I couldn't hear you clearly. Can you say that again?",
          "Could you please speak a bit more clearly?"
        ],
        INCOHERENT_SPEECH: [
          "I'm having trouble understanding. Can you try again?",
          "Sorry, that didn't come through clearly. One more time?",
          "Could you rephrase that for me?"
        ],
        BACKGROUND_NOISE: [
          "There seems to be some background noise. Could you move to a quieter place?",
          "I'm having trouble hearing you due to noise. Can you reduce the background sound?",
          "The audio quality isn't great. Could you try from a quieter location?"
        ],
        NO_SPEECH: [
          "I haven't heard anything yet. Are you there?",
          "Hello? I don't seem to be receiving any audio.",
          "Can you hear me? I'm not getting any sound from your end."
        ],
        CONNECTION_ISSUE: [
          "I think we lost connection for a moment. Are you still there?",
          "Sorry, there was a technical glitch. Could you repeat that?",
          "We had a brief connection issue. Please continue."
        ],
        LANGUAGE_MISMATCH: [
          "I detected a different language. Let me switch modes.",
          "Would you prefer to continue in a different language?",
          "I can switch languages if that helps."
        ],
        PARTIAL_RECOGNITION: [
          "I only caught part of that. Could you continue?",
          "Please go on, I'm listening.",
          "I heard you, but I'd like to hear more. Please continue."
        ],
        EMPTY_TRANSCRIPT: [
          "I didn't catch anything. Could you try again?",
          "I'm not receiving any audio. Please speak again.",
          "Nothing came through. Can you repeat that?"
        ]
      },
      hi: {
        LONG_PAUSE: [
          "मैं सुन रहा हूं, अपना समय लें।",
          "क्या आप अभी भी हैं? मैं मदद के लिए यहां हूं।",
          "कोई बात नहीं, जब भी आप तैयार हों।"
        ],
        LOW_CONFIDENCE: [
          "मैं ठीक से सुन नहीं पाया। क्या आप दोहरा सकते हैं?",
          "माफ़ करें, मुझे स्पष्ट रूप से नहीं सुनाई दिया। फिर से बताएं?",
          "क्या आप थोड़ा स्पष्ट बोल सकते हैं?"
        ],
        INCOHERENT_SPEECH: [
          "मुझे समझने में परेशानी हो रही है। क्या आप फिर से कोशिश कर सकते हैं?",
          "माफ़ करें, वह स्पष्ट नहीं आया। एक बार और?",
          "क्या आप इसे दूसरे तरीके से बता सकते हैं?"
        ],
        BACKGROUND_NOISE: [
          "पृष्ठभूमि में कुछ शोर है। क्या आप शांत जगह पर जा सकते हैं?",
          "शोर के कारण मुझे सुनने में परेशानी हो रही है।",
          "ऑडियो क्वालिटी अच्छी नहीं है। शांत जगह से कोशिश करें?"
        ],
        NO_SPEECH: [
          "मैंने अभी तक कुछ नहीं सुना। क्या आप हैं?",
          "हेलो? मुझे कोई ऑडियो नहीं मिल रहा।",
          "क्या आप मुझे सुन सकते हैं? मुझे आपकी आवाज़ नहीं मिल रही।"
        ],
        PARTIAL_RECOGNITION: [
          "मैंने केवल कुछ हिस्सा सुना। कृपया जारी रखें।",
          "कृपया आगे बढ़ें, मैं सुन रहा हूं।"
        ]
      },
      ta: {
        LONG_PAUSE: [
          "நான் கேட்டுக்கொண்டிருக்கிறேன், உங்கள் நேரத்தை எடுத்துக் கொள்ளுங்கள்.",
          "நீங்கள் இன்னும் இருக்கிறீர்களா? நான் உதவ இங்கே இருக்கிறேன்."
        ],
        LOW_CONFIDENCE: [
          "நான் அதை சரியாகக் கேட்கவில்லை. தயவுசெய்து மீண்டும் சொல்ல முடியுமா?",
          "மன்னிக்கவும், எனக்கு தெளிவாகக் கேட்கவில்லை."
        ],
        BACKGROUND_NOISE: [
          "பின்னணியில் சில சத்தம் இருக்கிறது. அமைதியான இடத்திற்கு செல்ல முடியுமா?"
        ]
      }
    };

    const langTemplates = templates[language] || templates.en;
    return langTemplates[type] || langTemplates.LOW_CONFIDENCE;
  }

  /**
   * Get empathetic response for repeated issues
   */
  getEmpatheticResponse(type, language) {
    const empathetic = {
      en: {
        LOW_CONFIDENCE: "I understand it's frustrating. Let's try once more, and I'll listen carefully.",
        BACKGROUND_NOISE: "I know the noise is bothersome. Take your time to find a quieter spot.",
        NO_SPEECH: "No problem at all. Whenever you're ready to speak, I'm here.",
        INCOHERENT_SPEECH: "I'm sorry for the difficulty. Let's take it slow - what would you like to tell me?"
      },
      hi: {
        LOW_CONFIDENCE: "मैं समझता हूं यह निराशाजनक है। चलिए एक बार और कोशिश करते हैं।",
        BACKGROUND_NOISE: "मुझे पता है शोर परेशान कर रहा है। शांत जगह खोजने के लिए अपना समय लें।",
        NO_SPEECH: "कोई समस्या नहीं। जब भी आप तैयार हों, मैं यहाँ हूँ।"
      }
    };

    const langEmpathetic = empathetic[language] || empathetic.en;
    return langEmpathetic[type] || langEmpathetic.LOW_CONFIDENCE;
  }

  /**
   * Get apologetic response for frustrated users
   */
  getApologeticResponse(type, language) {
    const apologetic = {
      en: {
        LOW_CONFIDENCE: "I apologize for the trouble. Let me try my best to understand you.",
        BACKGROUND_NOISE: "I'm sorry about the audio issues. Would you like to try typing instead?",
        INCOHERENT_SPEECH: "I'm really sorry for the confusion. Let's start fresh - what can I help you with?"
      },
      hi: {
        LOW_CONFIDENCE: "परेशानी के लिए मैं माफी चाहता हूं। मैं आपको समझने की पूरी कोशिश करूंगा।",
        BACKGROUND_NOISE: "ऑडियो समस्याओं के लिए मुझे खेद है। क्या आप टाइप करना पसंद करेंगे?"
      }
    };

    const langApologetic = apologetic[language] || apologetic.en;
    return langApologetic[type] || langApologetic.LOW_CONFIDENCE;
  }

  /**
   * Generate TTS audio
   */
  async generateTTS(text, language) {
    if (!this.multiLangService) {
      logger.warn('[PolyfillSelector] No TTS service available');
      return Buffer.from(text); // Fallback
    }

    try {
      const audioBuffer = await this.multiLangService.synthesizeSpeech(
        text,
        language,
        null,
        { preferredType: 'neural' }
      );

      return audioBuffer;
    } catch (error) {
      logger.error('[PolyfillSelector] TTS generation failed', {
        text: text.substring(0, 50),
        language,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Record usage statistics
   */
  recordUsage(cacheKey, source) {
    if (!this.usageStats.has(cacheKey)) {
      this.usageStats.set(cacheKey, {
        cache: 0,
        library: 0,
        generated: 0,
        total: 0
      });
    }

    const stats = this.usageStats.get(cacheKey);
    stats[source]++;
    stats.total++;
  }

  /**
   * Get usage statistics
   */
  getUsageStats() {
    const stats = {};
    for (const [key, value] of this.usageStats) {
      stats[key] = value;
    }
    return stats;
  }

  /**
   * Clear audio cache
   */
  clearCache() {
    this.audioCache.clear();
    logger.info('[PolyfillSelector] Cache cleared');
  }

  /**
   * Get cache size
   */
  getCacheSize() {
    return this.audioCache.size;
  }
}

module.exports = PolyfillSelector;
