/**
 * Multi-Language Service for Google Cloud Platform
 * Handles language detection, TTS/STT for multiple languages
 */

const { logger } = require('../utils/logger');
const textToSpeech = require('@google-cloud/text-to-speech');

class MultiLanguageService {
  constructor(env) {
    this.env = env;
    this.ttsClient = null;
    this.sttClient = null;
    this.supportedLanguages = {
      // GCP Supported 9 Indic Languages (Primary)
      'en': {
        name: 'English',
        code: 'en-IN', // Using Indian English for Indian accent
        gcpSupported: true,
        voices: {
          neural: ['en-IN-Neural2-A', 'en-IN-Neural2-D', 'en-IN-Neural2-B', 'en-IN-Neural2-C'], // Prioritize female voices (A, D)
          wavenet: ['en-IN-Wavenet-A', 'en-IN-Wavenet-D', 'en-IN-Wavenet-B', 'en-IN-Wavenet-C'],
          standard: ['en-IN-Standard-A', 'en-IN-Standard-D', 'en-IN-Standard-B', 'en-IN-Standard-C']
        }
      },
      'hi': { 
        name: 'Hindi', 
        code: 'hi-IN', 
        gcpSupported: true,
        voices: {
          neural: ['hi-IN-Neural2-A', 'hi-IN-Neural2-B', 'hi-IN-Neural2-C', 'hi-IN-Neural2-D'],
          wavenet: ['hi-IN-Wavenet-A', 'hi-IN-Wavenet-B', 'hi-IN-Wavenet-C', 'hi-IN-Wavenet-D'],
          standard: ['hi-IN-Standard-A', 'hi-IN-Standard-B', 'hi-IN-Standard-C', 'hi-IN-Standard-D']
        }
      },
      'ta': { 
        name: 'Tamil', 
        code: 'ta-IN', 
        gcpSupported: true,
        voices: {
          neural: ['ta-IN-Neural2-A', 'ta-IN-Neural2-B', 'ta-IN-Neural2-C', 'ta-IN-Neural2-D'],
          wavenet: ['ta-IN-Wavenet-A', 'ta-IN-Wavenet-B', 'ta-IN-Wavenet-C', 'ta-IN-Wavenet-D'],
          standard: ['ta-IN-Standard-A', 'ta-IN-Standard-B', 'ta-IN-Standard-C', 'ta-IN-Standard-D']
        }
      },
      'te': { 
        name: 'Telugu', 
        code: 'te-IN', 
        gcpSupported: true,
        voices: {
          neural: ['te-IN-Neural2-A', 'te-IN-Neural2-B', 'te-IN-Neural2-C', 'te-IN-Neural2-D'],
          wavenet: ['te-IN-Wavenet-A', 'te-IN-Wavenet-B', 'te-IN-Wavenet-C', 'te-IN-Wavenet-D'],
          standard: ['te-IN-Standard-A', 'te-IN-Standard-B', 'te-IN-Standard-C', 'te-IN-Standard-D']
        }
      },
      'bn': { 
        name: 'Bengali', 
        code: 'bn-IN', 
        gcpSupported: true,
        voices: {
          neural: ['bn-IN-Neural2-A', 'bn-IN-Neural2-B', 'bn-IN-Neural2-C', 'bn-IN-Neural2-D'],
          wavenet: ['bn-IN-Wavenet-A', 'bn-IN-Wavenet-B', 'bn-IN-Wavenet-C', 'bn-IN-Wavenet-D'],
          standard: ['bn-IN-Standard-A', 'bn-IN-Standard-B', 'bn-IN-Standard-C', 'bn-IN-Standard-D']
        }
      },
      'mr': { 
        name: 'Marathi', 
        code: 'mr-IN', 
        gcpSupported: true,
        voices: {
          neural: ['mr-IN-Neural2-A', 'mr-IN-Neural2-B', 'mr-IN-Neural2-C', 'mr-IN-Neural2-D'],
          wavenet: ['mr-IN-Wavenet-A', 'mr-IN-Wavenet-B', 'mr-IN-Wavenet-C', 'mr-IN-Wavenet-D'],
          standard: ['mr-IN-Standard-A', 'mr-IN-Standard-B', 'mr-IN-Standard-C', 'mr-IN-Standard-D']
        }
      },
      'kn': { 
        name: 'Kannada', 
        code: 'kn-IN', 
        gcpSupported: true,
        voices: {
          neural: ['kn-IN-Neural2-A', 'kn-IN-Neural2-B', 'kn-IN-Neural2-C', 'kn-IN-Neural2-D'],
          wavenet: ['kn-IN-Wavenet-A', 'kn-IN-Wavenet-B', 'kn-IN-Wavenet-C', 'kn-IN-Wavenet-D'],
          standard: ['kn-IN-Standard-A', 'kn-IN-Standard-B', 'kn-IN-Standard-C', 'kn-IN-Standard-D']
        }
      },
      'gu': { 
        name: 'Gujarati', 
        code: 'gu-IN', 
        gcpSupported: true,
        voices: {
          neural: ['gu-IN-Neural2-A', 'gu-IN-Neural2-B', 'gu-IN-Neural2-C', 'gu-IN-Neural2-D'],
          wavenet: ['gu-IN-Wavenet-A', 'gu-IN-Wavenet-B', 'gu-IN-Wavenet-C', 'gu-IN-Wavenet-D'],
          standard: ['gu-IN-Standard-A', 'gu-IN-Standard-B', 'gu-IN-Standard-C', 'gu-IN-Standard-D']
        }
      },
      'ml': { 
        name: 'Malayalam', 
        code: 'ml-IN', 
        gcpSupported: true,
        voices: {
          neural: ['ml-IN-Neural2-A', 'ml-IN-Neural2-B', 'ml-IN-Neural2-C', 'ml-IN-Neural2-D'],
          wavenet: ['ml-IN-Wavenet-A', 'ml-IN-Wavenet-B', 'ml-IN-Wavenet-C', 'ml-IN-Wavenet-D'],
          standard: ['ml-IN-Standard-A', 'ml-IN-Standard-B', 'ml-IN-Standard-C', 'ml-IN-Standard-D']
        }
      },
      'pa': { 
        name: 'Punjabi', 
        code: 'pa-IN', 
        gcpSupported: true,
        voices: {
          neural: ['pa-IN-Neural2-A', 'pa-IN-Neural2-B', 'pa-IN-Neural2-C', 'pa-IN-Neural2-D'],
          wavenet: ['pa-IN-Wavenet-A', 'pa-IN-Wavenet-B', 'pa-IN-Wavenet-C', 'pa-IN-Wavenet-D'],
          standard: ['pa-IN-Standard-A', 'pa-IN-Standard-B', 'pa-IN-Standard-C', 'pa-IN-Standard-D']
        }
      },
      
      // Additional Indian Languages
      'or': { name: 'Odia', code: 'or-IN', gcpSupported: false },
      'as': { name: 'Assamese', code: 'as-IN', gcpSupported: false },
      'ur': { name: 'Urdu', code: 'ur-IN', gcpSupported: false },
      
      // Regional Languages
      'ne': { name: 'Nepali', code: 'ne-NP', gcpSupported: false },
      'si': { name: 'Sinhala', code: 'si-LK', gcpSupported: false },
      'my': { name: 'Burmese', code: 'my-MM', gcpSupported: false },
      'th': { name: 'Thai', code: 'th-TH', gcpSupported: false },
      'vi': { name: 'Vietnamese', code: 'vi-VN', gcpSupported: false },
      'id': { name: 'Indonesian', code: 'id-ID', gcpSupported: false },
      'ms': { name: 'Malay', code: 'ms-MY', gcpSupported: false },
      'tl': { name: 'Filipino', code: 'tl-PH', gcpSupported: false },
      'km': { name: 'Khmer', code: 'km-KH', gcpSupported: false },
      'lo': { name: 'Lao', code: 'lo-LA', gcpSupported: false },
      'zh': { name: 'Chinese', code: 'zh-CN', gcpSupported: false },
      'ja': { name: 'Japanese', code: 'ja-JP', gcpSupported: false },
      'ko': { name: 'Korean', code: 'ko-KR', gcpSupported: false },
      'ar': { name: 'Arabic', code: 'ar-SA', gcpSupported: false },
      'fa': { name: 'Persian', code: 'fa-IR', gcpSupported: false },
      'tr': { name: 'Turkish', code: 'tr-TR', gcpSupported: false },
      'ru': { name: 'Russian', code: 'ru-RU', gcpSupported: false },
      'de': { name: 'German', code: 'de-DE', gcpSupported: false },
      'fr': { name: 'French', code: 'fr-FR', gcpSupported: false },
      'es': { name: 'Spanish', code: 'es-ES', gcpSupported: false },
      'pt': { name: 'Portuguese', code: 'pt-PT', gcpSupported: false },
      'it': { name: 'Italian', code: 'it-IT', gcpSupported: false },
      'nl': { name: 'Dutch', code: 'nl-NL', gcpSupported: false },
      'sv': { name: 'Swedish', code: 'sv-SE', gcpSupported: false },
      'da': { name: 'Danish', code: 'da-DK', gcpSupported: false },
      'no': { name: 'Norwegian', code: 'no-NO', gcpSupported: false },
      'fi': { name: 'Finnish', code: 'fi-FI', gcpSupported: false },
      'pl': { name: 'Polish', code: 'pl-PL', gcpSupported: false },
      'cs': { name: 'Czech', code: 'cs-CZ', gcpSupported: false },
      'sk': { name: 'Slovak', code: 'sk-SK', gcpSupported: false },
      'hu': { name: 'Hungarian', code: 'hu-HU', gcpSupported: false },
      'ro': { name: 'Romanian', code: 'ro-RO', gcpSupported: false },
      'bg': { name: 'Bulgarian', code: 'bg-BG', gcpSupported: false },
      'hr': { name: 'Croatian', code: 'hr-HR', gcpSupported: false },
      'sr': { name: 'Serbian', code: 'sr-RS', gcpSupported: false },
      'sl': { name: 'Slovenian', code: 'sl-SI', gcpSupported: false },
      'et': { name: 'Estonian', code: 'et-EE', gcpSupported: false },
      'lv': { name: 'Latvian', code: 'lv-LV', gcpSupported: false },
      'lt': { name: 'Lithuanian', code: 'lt-LT', gcpSupported: false },
      'mt': { name: 'Maltese', code: 'mt-MT', gcpSupported: false },
      'ga': { name: 'Irish', code: 'ga-IE', gcpSupported: false },
      'cy': { name: 'Welsh', code: 'cy-GB', gcpSupported: false },
      'is': { name: 'Icelandic', code: 'is-IS', gcpSupported: false },
      'he': { name: 'Hebrew', code: 'he-IL', gcpSupported: false },
      'el': { name: 'Greek', code: 'el-GR', gcpSupported: false },
      'uk': { name: 'Ukrainian', code: 'uk-UA', gcpSupported: false },
      'be': { name: 'Belarusian', code: 'be-BY', gcpSupported: false },
      'mk': { name: 'Macedonian', code: 'mk-MK', gcpSupported: false },
      'sq': { name: 'Albanian', code: 'sq-AL', gcpSupported: false },
      'bs': { name: 'Bosnian', code: 'bs-BA', gcpSupported: false },
      'me': { name: 'Montenegrin', code: 'me-ME', gcpSupported: false },
      'ka': { name: 'Georgian', code: 'ka-GE', gcpSupported: false },
      'hy': { name: 'Armenian', code: 'hy-AM', gcpSupported: false },
      'az': { name: 'Azerbaijani', code: 'az-AZ', gcpSupported: false },
      'kk': { name: 'Kazakh', code: 'kk-KZ', gcpSupported: false },
      'ky': { name: 'Kyrgyz', code: 'ky-KG', gcpSupported: false },
      'uz': { name: 'Uzbek', code: 'uz-UZ', gcpSupported: false },
      'tg': { name: 'Tajik', code: 'tg-TJ', gcpSupported: false },
      'tk': { name: 'Turkmen', code: 'tk-TM', gcpSupported: false },
      'mn': { name: 'Mongolian', code: 'mn-MN', gcpSupported: false },
      'am': { name: 'Amharic', code: 'am-ET', gcpSupported: false },
      'sw': { name: 'Swahili', code: 'sw-KE', gcpSupported: false },
      'yo': { name: 'Yoruba', code: 'yo-NG', gcpSupported: false },
      'ig': { name: 'Igbo', code: 'ig-NG', gcpSupported: false },
      'ha': { name: 'Hausa', code: 'ha-NG', gcpSupported: false },
      'zu': { name: 'Zulu', code: 'zu-ZA', gcpSupported: false },
      'xh': { name: 'Xhosa', code: 'xh-ZA', gcpSupported: false },
      'af': { name: 'Afrikaans', code: 'af-ZA', gcpSupported: false },
      'st': { name: 'Sotho', code: 'st-ZA', gcpSupported: false },
      'tn': { name: 'Tswana', code: 'tn-ZA', gcpSupported: false },
      'ss': { name: 'Swati', code: 'ss-ZA', gcpSupported: false },
      've': { name: 'Venda', code: 've-ZA', gcpSupported: false },
      'ts': { name: 'Tsonga', code: 'ts-ZA', gcpSupported: false },
      'nr': { name: 'Ndebele', code: 'nr-ZA', gcpSupported: false }
    };
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    // Initialize Google Cloud Text-to-Speech client
    try {
      this.ttsClient = new textToSpeech.TextToSpeechClient();
      logger.info('[MultiLanguageService] GCP TTS client initialized');
    } catch (error) {
      logger.error('[MultiLanguageService] Failed to initialize TTS client:', error);
      this.ttsClient = null;
    }
    
    this.initialized = true;
    logger.info('[MultiLanguageService] Initialized', { 
      supportedLanguages: Object.keys(this.supportedLanguages).length,
      ttsEnabled: this.ttsClient !== null
    });
  }

  getSupportedLanguages() {
    return Object.keys(this.supportedLanguages);
  }

  getGCPSupportedLanguages() {
    return Object.keys(this.supportedLanguages).filter(
      lang => this.supportedLanguages[lang].gcpSupported
    );
  }

  isGCPSupported(languageCode) {
    const config = this.getLanguageConfig(languageCode);
    return config && config.gcpSupported;
  }

  getAvailableVoices(languageCode, voiceType = 'neural') {
    const config = this.getLanguageConfig(languageCode);
    if (!config || !config.voices) {
      return [];
    }
    return config.voices[voiceType] || [];
  }

  getBestVoice(languageCode, preferredType = 'neural') {
    const config = this.getLanguageConfig(languageCode);
    if (!config || !config.voices) {
      return null;
    }

    // Priority order: neural > wavenet > standard
    const priorityOrder = ['neural', 'wavenet', 'standard'];
    
    // If preferred type is specified and available, use it
    if (config.voices[preferredType] && config.voices[preferredType].length > 0) {
      return config.voices[preferredType][0]; // Return first voice of preferred type
    }

    // Otherwise, use priority order
    for (const type of priorityOrder) {
      if (config.voices[type] && config.voices[type].length > 0) {
        return config.voices[type][0];
      }
    }

    return null;
  }

  getAllVoices(languageCode) {
    const config = this.getLanguageConfig(languageCode);
    if (!config || !config.voices) {
      return [];
    }

    const allVoices = [];
    for (const [type, voices] of Object.entries(config.voices)) {
      for (const voice of voices) {
        allVoices.push({
          name: voice,
          type: type,
          language: languageCode
        });
      }
    }
    return allVoices;
  }

  getVoiceInfo(voiceName) {
    // Extract language and type from voice name
    const parts = voiceName.split('-');
    if (parts.length < 4) return null;

    const language = parts[0] + '-' + parts[1];
    const type = parts[2].toLowerCase();
    const gender = parts[3];

    return {
      name: voiceName,
      language: language,
      type: type,
      gender: gender,
      isNeural: type.includes('neural'),
      isWavenet: type.includes('wavenet'),
      isStandard: type.includes('standard')
    };
  }

  getLanguageConfig(languageCode) {
    return this.supportedLanguages[languageCode] || this.supportedLanguages['en'];
  }

  getLanguageName(languageCode) {
    const config = this.getLanguageConfig(languageCode);
    return config.name;
  }

  getLanguageCode(languageCode) {
    const config = this.getLanguageConfig(languageCode);
    return config.code;
  }

  async detectLanguage(text) {
    try {
      // Language detection prioritizing GCP-supported Indic languages
      // In a real implementation, you would use Google Cloud Translation API
      
      // Check for Devanagari script (Hindi, Marathi) - GCP Supported
      if (/[\u0900-\u097F]/.test(text)) {
        // Hindi-specific patterns
        if (/[\u0924-\u0939]/.test(text) || /[\u0930-\u0939]/.test(text)) return 'hi'; // Hindi
        // Marathi-specific patterns
        if (/[\u092E-\u0939]/.test(text) || /[\u092E\u092F\u0930\u093E\u0920\u0940]/.test(text)) return 'mr'; // Marathi
        return 'hi'; // Default to Hindi (GCP supported)
      }
      
      // Check for Tamil script - GCP Supported
      if (/[\u0B80-\u0BFF]/.test(text)) return 'ta';
      
      // Check for Telugu script - GCP Supported
      if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
      
      // Check for Bengali script - GCP Supported
      if (/[\u0980-\u09FF]/.test(text)) {
        // Bengali-specific patterns
        if (/[\u09AC\u09C7\u09A8\u09CD\u0997\u09BE\u09B2\u09BF]/.test(text)) return 'bn'; // Bengali
        return 'bn'; // Default to Bengali (GCP supported)
      }
      
      // Check for Kannada script - GCP Supported
      if (/[\u0C80-\u0CFF]/.test(text)) return 'kn';
      
      // Check for Gujarati script - GCP Supported
      if (/[\u0A80-\u0AFF]/.test(text)) return 'gu';
      
      // Check for Malayalam script - GCP Supported
      if (/[\u0D00-\u0D7F]/.test(text)) return 'ml';
      
      // Check for Punjabi script - GCP Supported
      if (/[\u0A00-\u0A7F]/.test(text)) return 'pa';
      
      // Check for Odia script - Not GCP supported, but keep for compatibility
      if (/[\u0B00-\u0B7F]/.test(text)) return 'or';
      
      // Check for Assamese script - Not GCP supported, but keep for compatibility
      if (/[\u0980-\u09FF]/.test(text) && /[\u0985\u09B8\u09AE\u09C0\u09AF\u09BE]/.test(text)) return 'as';
      
      // Check for Arabic script (Urdu) - Not GCP supported, but keep for compatibility
      if (/[\u0600-\u06FF]/.test(text)) return 'ur';
      
      // Check for Chinese characters
      if (/[\u4E00-\u9FFF]/.test(text)) return 'zh';
      
      // Check for Japanese characters
      if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja';
      
      // Check for Korean characters
      if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
      
      // Check for Thai characters
      if (/[\u0E00-\u0E7F]/.test(text)) return 'th';
      
      // Check for Arabic characters
      if (/[\u0600-\u06FF]/.test(text)) return 'ar';
      
      // Check for Cyrillic script
      if (/[\u0400-\u04FF]/.test(text)) return 'ru';
      
      // Default to English (GCP supported)
      return 'en';
    } catch (error) {
      logger.error('[MultiLanguageService] Language detection error:', error);
      return 'en';
    }
  }

  async transcribeAudio(audioBuffer, languageCode = 'en') {
    try {
      const languageConfig = this.getLanguageConfig(languageCode);
      const languageCodeForSTT = languageConfig.code;
      const isGCPSupported = this.isGCPSupported(languageCode);
      
      if (isGCPSupported) {
        // Use Google Cloud Speech-to-Text API for GCP-supported languages
        const transcript = await this.transcribeWithGCP(audioBuffer, languageCodeForSTT);
        
        logger.info('[MultiLanguageService] Audio transcribed with GCP STT', { 
          language: languageCode,
          gcpSupported: true,
          transcriptLength: transcript.length 
        });
        
        return transcript;
      } else {
        // Fallback to simulation for non-GCP supported languages
        const transcript = await this.simulateSTT(audioBuffer, languageCodeForSTT);
        
        logger.info('[MultiLanguageService] Audio transcribed with fallback', { 
          language: languageCode,
          gcpSupported: false,
          transcriptLength: transcript.length 
        });
        
        return transcript;
      }
    } catch (error) {
      logger.error('[MultiLanguageService] Transcription error:', error);
      throw error;
    }
  }

  async synthesizeSpeech(text, languageCode = 'en', voiceName = null, options = {}) {
    try {
      const languageConfig = this.getLanguageConfig(languageCode);
      const languageCodeForTTS = languageConfig.code;
      const isGCPSupported = this.isGCPSupported(languageCode);
      
      if (isGCPSupported) {
        // Use Google Cloud Text-to-Speech API for GCP-supported languages
        const audioBuffer = await this.synthesizeWithGCP(text, languageCodeForTTS, voiceName, options);
        
        logger.info('[MultiLanguageService] Speech synthesized with GCP TTS', { 
          language: languageCode,
          voice: voiceName || 'auto-selected',
          gcpSupported: true,
          textLength: text.length 
        });
        
        return audioBuffer;
      } else {
        // Fallback to simulation for non-GCP supported languages
        const audioBuffer = await this.simulateTTS(text, languageCodeForTTS);
        
        logger.info('[MultiLanguageService] Speech synthesized with fallback', { 
          language: languageCode,
          gcpSupported: false,
          textLength: text.length 
        });
        
        return audioBuffer;
      }
    } catch (error) {
      logger.error('[MultiLanguageService] Synthesis error:', error);
      throw error;
    }
  }

  async transcribeWithGCP(audioBuffer, languageCode, encoding = 'WEBM_OPUS') {
    try {
      if (!this.sttClient) {
        const speech = require('@google-cloud/speech');
        this.sttClient = new speech.SpeechClient();
        logger.info('[MultiLanguageService] STT client initialized');
      }

      const request = {
        audio: { content: audioBuffer.toString('base64') },
        config: {
          encoding: encoding,
          sampleRateHertz: 48000,
          languageCode: languageCode,
          enableAutomaticPunctuation: true,
          model: 'latest_long'
        },
      };

      logger.info('[MultiLanguageService] Sending STT request', {
        languageCode,
        encoding,
        audioSize: audioBuffer.length
      });

      const [response] = await this.sttClient.recognize(request);
      
      if (!response.results || response.results.length === 0) {
        logger.warn('[MultiLanguageService] No transcription results');
        return '';
      }

      const transcription = response.results
        .map(result => result.alternatives[0].transcript)
        .join('\n');

      logger.info('[MultiLanguageService] STT successful', {
        languageCode,
        transcription,
        confidence: response.results[0].alternatives[0].confidence
      });

      return transcription;
    } catch (error) {
      logger.error('[MultiLanguageService] GCP STT error:', {
        error: error.message,
        code: error.code,
        languageCode
      });
      throw error;
    }
  }

  async synthesizeWithGCP(text, languageCode, voiceName = null, options = {}) {
    try {
      // Get the best voice if not specified
      if (!voiceName) {
        voiceName = this.getBestVoice(languageCode, options.preferredType || 'neural');
      }

      // If TTS client is not available, return mock audio
      if (!this.ttsClient) {
        logger.warn('[MultiLanguageService] TTS client not initialized, returning mock audio');
        return Buffer.from(`[GCP TTS Mock] Audio for: ${text} (${languageCode}) - Voice: ${voiceName}`);
      }

      // Determine gender based on voice name if not specified
      let gender = options.gender;
      if (!gender) {
        // Neural2-A, Neural2-C are male; Neural2-F, Neural2-G are female (for en-US)
        // For simplicity, use NEUTRAL to let GCP choose
        gender = 'NEUTRAL';
      }

      // Prepare the TTS request
      const request = {
        input: { text: text },
        voice: {
          languageCode: languageCode,
          name: voiceName
          // Removed ssmlGender to avoid conflicts - let voice name dictate gender
        },
        audioConfig: {
          audioEncoding: options.encoding || 'MP3',
          speakingRate: options.speakingRate || 1.0,
          pitch: options.pitch || 0.0,
          volumeGainDb: options.volumeGainDb || 0.0
        },
      };

      // Call Google Cloud Text-to-Speech API
      const [response] = await this.ttsClient.synthesizeSpeech(request);
      
      const voiceInfo = this.getVoiceInfo(voiceName);
      const voiceType = voiceInfo ? voiceInfo.type : 'unknown';
      
      logger.info('[MultiLanguageService] GCP TTS synthesis successful', {
        language: languageCode,
        voice: voiceName,
        voiceType: voiceType,
        textLength: text.length,
        audioSize: response.audioContent.length
      });
      
      return response.audioContent;
    } catch (error) {
      logger.error('[MultiLanguageService] GCP TTS error:', error);
      
      // Return a more informative error or fallback
      throw new Error(`TTS synthesis failed: ${error.message}`);
    }
  }

  async simulateSTT(audioBuffer, languageCode) {
    // Simulate STT processing for non-GCP supported languages
    return `[Fallback STT] Mock transcription in ${languageCode}: This is a simulated transcription of the audio input.`;
  }

  async simulateTTS(text, languageCode) {
    // Simulate TTS processing for non-GCP supported languages
    return Buffer.from(`[Fallback TTS] Mock audio for: ${text} (${languageCode})`);
  }

  async cleanup() {
    logger.info('[MultiLanguageService] Cleanup completed');
  }
}

module.exports = MultiLanguageService;