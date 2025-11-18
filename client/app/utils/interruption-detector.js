/**
 * Interruption Detector (Client-Side)
 * Detects and classifies user interruptions during AI speech
 */

class InterruptionDetector {
  constructor(options = {}) {
    // State
    this.isAIPlaying = false;
    this.aiPlaybackStartTime = null;
    this.aiAudioElement = null;
    this.lastVADTrigger = null;
    this.interruptionCount = 0;

    // Configuration
    this.interruptionThreshold = options.interruptionThreshold || 200; // ms debounce
    this.language = options.language || 'en';

    // Interruption types
    this.interruptionTypes = {
      BARGE_IN: 'barge_in',
      CUT_OFF: 'cut_off',
      CLARIFICATION: 'clarification',
      CORRECTION: 'correction',
      URGENT: 'urgent',
      ACCIDENTAL: 'accidental'
    };

    // Urgency keywords (multi-language)
    this.urgencyKeywords = {
      en: ['stop', 'wait', 'hold on', 'hold up', 'pause', 'hang on', 'one moment'],
      hi: ['रुको', 'रुकिए', 'ठहरो', 'ठहरिए', 'रुक जाओ', 'एक मिनट', 'ज़रा'],
      ta: ['நில்', 'நில்லுங்கள்', 'காத்திருங்கள்', 'இருங்கள்', 'ஒரு நிமிடம்'],
      te: ['ఆగు', 'ఆగండి', 'ఆగండి', 'ఒక్క నిమిషం', 'ఆగండి'],
      bn: ['থামো', 'থামুন', 'একটু দাঁড়ান', 'অপেক্ষা করুন', 'এক মিনিট'],
      mr: ['थांब', 'थांबा', 'एक मिनिट', 'जरा थांब'],
      gu: ['રોકો', 'રાહ જુઓ', 'એક મિનિટ'],
      kn: ['ನಿಲ್ಲಿಸಿ', 'ನಿಲ್ಲಿಸಿ', 'ಒಂದು ನಿಮಿಷ'],
      ml: ['നിർത്തുക', 'കാത്തിരിക്കൂ', 'ഒരു മിനിറ്റ്'],
      pa: ['ਰੁਕੋ', 'ਰੁਕੋ', 'ਇੱਕ ਮਿੰਟ']
    };

    // Clarification keywords
    this.clarificationKeywords = {
      en: ['what', 'huh', 'wait what', 'sorry', 'excuse me', 'pardon', 'come again', 'say that again'],
      hi: ['क्या', 'माफ करें', 'फिर से', 'समझ नहीं आया', 'दोबारा'],
      ta: ['என்ன', 'மன்னிக்கவும்', 'மீண்டும்', 'புரியவில்லை'],
      te: ['ఏమిటి', 'క్షమించండి', 'మళ్ళీ', 'అర్థం కాలేదు'],
      bn: ['কি', 'দুঃখিত', 'আবার', 'বুঝিনি'],
      mr: ['काय', 'माफ करा', 'पुन्हा', 'समजले नाही'],
      gu: ['શું', 'માફ કરશો', 'ફરીથી', 'સમજાયું નહીં'],
      kn: ['ಏನು', 'ಕ್ಷಮಿಸಿ', 'ಮತ್ತೆ', 'ಅರ್ಥವಾಗಲಿಲ್ಲ'],
      ml: ['എന്ത്', 'ക്ഷമിക്കണം', 'വീണ്ടും', 'മനസ്സിലായില്ല'],
      pa: ['ਕੀ', 'ਮਾਫ਼ ਕਰਨਾ', 'ਦੁਬਾਰਾ', 'ਸਮਝ ਨਹੀਂ ਆਇਆ']
    };

    // Correction keywords
    this.correctionKeywords = {
      en: ['no', 'actually', 'i meant', 'not that', 'incorrect', 'wrong', "that's not", 'nope'],
      hi: ['नहीं', 'असल में', 'मतलब', 'गलत', 'ऐसा नहीं', 'वो नहीं'],
      ta: ['இல்லை', 'உண்மையில்', 'தவறு', 'அது இல்லை', 'சரியில்லை'],
      te: ['కాదు', 'నిజానికి', 'తప్పు', 'అది కాదు', 'సరికాదు'],
      bn: ['না', 'আসলে', 'ভুল', 'সেটা না', 'ঠিক না'],
      mr: ['नाही', 'खरं तर', 'चूक', 'ते नाही', 'बरोबर नाही'],
      gu: ['ના', 'ખરેખર', 'ખોટું', 'તે નહીં', 'સાચું નથી'],
      kn: ['ಇಲ್ಲ', 'ವಾಸ್ತವವಾಗಿ', 'ತಪ್ಪು', 'ಅದು ಅಲ್ಲ', 'ಸರಿಯಲ್ಲ'],
      ml: ['ഇല്ല', 'യഥാർത്ഥത്തിൽ', 'തെറ്റ്', 'അതല്ല', 'ശരിയല്ല'],
      pa: ['ਨਹੀਂ', 'ਅਸਲ ਵਿੱਚ', 'ਗਲਤ', 'ਉਹ ਨਹੀਂ', 'ਸਹੀ ਨਹੀਂ']
    };

    // Analyzer for audio intensity
    this.analyzer = null;
  }

  /**
   * Detect interruption
   * @param {Float32Array} audioData - Audio buffer
   * @param {boolean} vadActive - Voice activity detected
   * @param {object} partialSTT - Partial STT result (optional)
   * @returns {object|null} Interruption event or null
   */
  detectInterruption(audioData, vadActive, partialSTT = null) {
    const now = Date.now();

    // Not an interruption if AI isn't speaking
    if (!this.isAIPlaying) {
      return null;
    }

    // No voice activity detected
    if (!vadActive) {
      return null;
    }

    // Debounce: Ignore very short bursts
    if (this.lastVADTrigger && (now - this.lastVADTrigger) < this.interruptionThreshold) {
      return null;
    }

    this.lastVADTrigger = now;

    // Calculate timing
    const aiPlaybackDuration = now - this.aiPlaybackStartTime;
    const aiPlaybackProgress = this.getPlaybackProgress();

    // Analyze audio characteristics
    const audioIntensity = this.calculateAudioIntensity(audioData);
    const isLikelyAccidental = this.isLikelyAccidental(audioIntensity, aiPlaybackDuration);

    if (isLikelyAccidental) {
      return {
        type: this.interruptionTypes.ACCIDENTAL,
        confidence: 0.3,
        action: 'ignore',
        timing: {
          duration: aiPlaybackDuration,
          progress: aiPlaybackProgress,
          timestamp: now
        }
      };
    }

    // Classify interruption type
    const classification = this.classifyInterruption(
      partialSTT,
      aiPlaybackDuration,
      aiPlaybackProgress,
      audioIntensity
    );

    this.interruptionCount++;

    console.log('[Interruption]', classification.type, 'at', (aiPlaybackProgress * 100).toFixed(1) + '%');

    return {
      type: classification.type,
      confidence: classification.confidence,
      action: classification.action,
      timing: {
        duration: aiPlaybackDuration,
        progress: aiPlaybackProgress,
        timestamp: now
      },
      partialText: partialSTT?.text || null,
      interruptionCount: this.interruptionCount,
      audioIntensity: audioIntensity
    };
  }

  /**
   * Classify the type of interruption
   */
  classifyInterruption(partialSTT, duration, progress, intensity) {
    // Check for keywords if we have partial STT
    if (partialSTT?.text) {
      const text = partialSTT.text.toLowerCase();

      // Urgent interruption (highest priority)
      if (this.matchesKeywords(text, this.urgencyKeywords)) {
        return {
          type: this.interruptionTypes.URGENT,
          confidence: 0.95,
          action: 'stop_immediately'
        };
      }

      // Clarification request
      if (this.matchesKeywords(text, this.clarificationKeywords)) {
        return {
          type: this.interruptionTypes.CLARIFICATION,
          confidence: 0.85,
          action: 'pause_and_acknowledge'
        };
      }

      // Correction
      if (this.matchesKeywords(text, this.correctionKeywords)) {
        return {
          type: this.interruptionTypes.CORRECTION,
          confidence: 0.9,
          action: 'stop_and_listen'
        };
      }
    }

    // Timing-based classification
    // Early interruption (< 30%) = likely urgent or correction
    if (progress < 0.3) {
      return {
        type: this.interruptionTypes.URGENT,
        confidence: 0.7,
        action: 'stop_immediately'
      };
    }

    // Mid interruption (30-70%) = barge-in or clarification
    if (progress < 0.7) {
      return {
        type: this.interruptionTypes.BARGE_IN,
        confidence: 0.75,
        action: 'fade_out_and_listen'
      };
    }

    // Late interruption (> 70%)
    if (progress >= 0.7) {
      // If loud/intense, interrupt anyway
      if (intensity > 0.6) {
        return {
          type: this.interruptionTypes.BARGE_IN,
          confidence: 0.8,
          action: 'fade_out_and_listen'
        };
      } else {
        // Let AI finish if almost done
        return {
          type: this.interruptionTypes.BARGE_IN,
          confidence: 0.5,
          action: 'finish_and_listen'
        };
      }
    }

    // Default: standard barge-in
    return {
      type: this.interruptionTypes.BARGE_IN,
      confidence: 0.6,
      action: 'fade_out_and_listen'
    };
  }

  /**
   * Check if text matches keywords
   */
  matchesKeywords(text, keywordDict) {
    const keywords = keywordDict[this.language] || keywordDict.en;

    return keywords.some(keyword => {
      // Word boundary matching
      const regex = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'i');
      return regex.test(text);
    });
  }

  /**
   * Escape special regex characters
   */
  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Calculate audio intensity
   */
  calculateAudioIntensity(audioData) {
    if (!audioData || audioData.length === 0) return 0;

    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += Math.abs(audioData[i]);
    }

    return sum / audioData.length;
  }

  /**
   * Check if likely accidental (false positive)
   */
  isLikelyAccidental(intensity, duration) {
    // Very low intensity = likely false positive
    if (intensity < 0.01) return true;

    // Very early (< 100ms) = likely click or glitch
    if (duration < 100) return true;

    return false;
  }

  /**
   * Get playback progress (0-1)
   */
  getPlaybackProgress() {
    if (!this.aiAudioElement) return 0;

    const duration = this.aiAudioElement.duration;
    const currentTime = this.aiAudioElement.currentTime;

    if (!duration || duration === 0 || isNaN(duration)) return 0;

    return Math.min(1, currentTime / duration);
  }

  /**
   * Set AI playback state
   */
  setAIPlayback(audioElement, isPlaying) {
    this.isAIPlaying = isPlaying;
    this.aiAudioElement = audioElement;

    if (isPlaying) {
      this.aiPlaybackStartTime = Date.now();
      console.log('[Interruption] AI started speaking');
    } else {
      this.aiPlaybackStartTime = null;
      this.lastVADTrigger = null;
      console.log('[Interruption] AI stopped speaking');
    }
  }

  /**
   * Update language
   */
  setLanguage(language) {
    this.language = language;
  }

  /**
   * Reset state
   */
  reset() {
    this.lastVADTrigger = null;
    this.interruptionCount = 0;
  }

  /**
   * Get interruption statistics
   */
  getStats() {
    return {
      totalInterruptions: this.interruptionCount,
      isAIPlaying: this.isAIPlaying,
      lastVADTrigger: this.lastVADTrigger
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = InterruptionDetector;
}
