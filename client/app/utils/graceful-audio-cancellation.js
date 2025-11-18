/**
 * Graceful Audio Cancellation System
 * Handles smooth audio fade-outs and interruption responses
 */

class GracefulAudioCancellation {
  constructor(options = {}) {
    this.fadeOutDuration = options.fadeOutDuration || 150; // ms
    this.fadeOutCurve = options.fadeOutCurve || 'exponential';
    this.audioContext = null;
    this.gainNode = null;
    this.language = options.language || 'en';

    // Pre-loaded acknowledgments (will be populated)
    this.acknowledgmentAudio = new Map();
  }

  /**
   * Initialize audio context with gain control
   */
  initializeAudioContext() {
    if (this.audioContext) return;

    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);

      console.log('[AudioCancellation] Audio context initialized');
    } catch (error) {
      console.error('[AudioCancellation] Failed to initialize:', error);
    }
  }

  /**
   * Handle interruption based on type and action
   * @param {HTMLAudioElement} audioElement - AI audio element
   * @param {object} interruption - Interruption event
   * @returns {Promise<object>} Cancellation result
   */
  async handleInterruption(audioElement, interruption) {
    console.log('[AudioCancellation] Handling', interruption.type, 'action:', interruption.action);

    switch (interruption.action) {
      case 'stop_immediately':
        return await this.stopImmediately(audioElement, interruption);

      case 'fade_out_and_listen':
        return await this.fadeOutAndListen(audioElement, interruption);

      case 'pause_and_acknowledge':
        return await this.pauseAndAcknowledge(audioElement, interruption);

      case 'stop_and_listen':
        return await this.stopAndListen(audioElement, interruption);

      case 'finish_and_listen':
        return await this.finishAndListen(audioElement, interruption);

      case 'ignore':
        return { action: 'continue', interrupted: false };

      default:
        return await this.fadeOutAndListen(audioElement, interruption);
    }
  }

  /**
   * Stop immediately (urgent interruptions)
   */
  async stopImmediately(audioElement, interruption) {
    // Very quick fade (50ms) to avoid harsh cut
    await this.fadeOut(audioElement, 50);

    audioElement.pause();
    const resumePoint = audioElement.currentTime;
    audioElement.currentTime = 0;

    return {
      action: 'stopped',
      interrupted: true,
      resumePoint: resumePoint / audioElement.duration,
      partialText: this.extractPartialText(audioElement, interruption.timing.progress),
      canResume: false
    };
  }

  /**
   * Fade out smoothly and listen (standard barge-in)
   */
  async fadeOutAndListen(audioElement, interruption) {
    await this.fadeOut(audioElement, this.fadeOutDuration);

    const resumePoint = audioElement.currentTime;
    audioElement.pause();

    return {
      action: 'faded_out',
      interrupted: true,
      resumePoint: resumePoint / audioElement.duration,
      partialText: this.extractPartialText(audioElement, interruption.timing.progress),
      canResume: true
    };
  }

  /**
   * Pause and play acknowledgment (clarifications)
   */
  async pauseAndAcknowledge(audioElement, interruption) {
    await this.fadeOut(audioElement, 100);

    const resumePoint = audioElement.currentTime;
    audioElement.pause();

    // Get acknowledgment text
    const acknowledgment = this.getAcknowledgment(interruption.type);

    return {
      action: 'paused_with_acknowledgment',
      interrupted: true,
      acknowledgment: acknowledgment,
      resumePoint: resumePoint / audioElement.duration,
      partialText: this.extractPartialText(audioElement, interruption.timing.progress),
      canResume: true
    };
  }

  /**
   * Stop and prepare to listen (corrections)
   */
  async stopAndListen(audioElement, interruption) {
    await this.fadeOut(audioElement, 100);

    audioElement.pause();
    audioElement.currentTime = 0;

    return {
      action: 'stopped',
      interrupted: true,
      resumePoint: null,
      partialText: this.extractPartialText(audioElement, interruption.timing.progress),
      canResume: false
    };
  }

  /**
   * Let AI finish current sentence (late interruptions)
   */
  async finishAndListen(audioElement, interruption) {
    const remainingTime = (audioElement.duration - audioElement.currentTime) * 1000;

    console.log('[AudioCancellation] Remaining time:', remainingTime + 'ms');

    if (remainingTime < 1000) {
      // Less than 1 second left, let it finish
      return {
        action: 'finishing',
        interrupted: false,
        willListenAfter: remainingTime
      };
    } else {
      // Too long, interrupt anyway
      return await this.fadeOutAndListen(audioElement, interruption);
    }
  }

  /**
   * Smooth fade out using volume
   * Note: For production, Web Audio API with GainNode is better
   */
  async fadeOut(audioElement, duration) {
    const steps = 20;
    const stepDuration = duration / steps;
    const volumeStep = audioElement.volume / steps;

    for (let i = 0; i < steps; i++) {
      audioElement.volume = Math.max(0, audioElement.volume - volumeStep);
      await this.sleep(stepDuration);
    }

    audioElement.volume = 0;
  }

  /**
   * Fade in audio
   */
  async fadeIn(audioElement, duration, targetVolume = 1.0) {
    const steps = 20;
    const stepDuration = duration / steps;
    const volumeStep = targetVolume / steps;

    audioElement.volume = 0;

    for (let i = 0; i < steps; i++) {
      audioElement.volume = Math.min(targetVolume, audioElement.volume + volumeStep);
      await this.sleep(stepDuration);
    }

    audioElement.volume = targetVolume;
  }

  /**
   * Extract partial text from audio element
   */
  extractPartialText(audioElement, progress) {
    const fullText = audioElement.dataset.fullText;
    if (!fullText) return null;

    const words = fullText.split(' ');
    const estimatedWordIndex = Math.floor(words.length * progress);

    return {
      spoken: words.slice(0, estimatedWordIndex).join(' '),
      remaining: words.slice(estimatedWordIndex).join(' '),
      progress: progress
    };
  }

  /**
   * Get acknowledgment phrase
   */
  getAcknowledgment(interruptionType) {
    const acknowledgments = {
      en: {
        CLARIFICATION: ['Yes?', 'Let me clarify.', 'Which part?'],
        CORRECTION: ['Oh, I see.', 'Got it.', "You're right."],
        URGENT: ['Yes?', "I'm listening.", 'What is it?']
      },
      hi: {
        CLARIFICATION: ['हाँ?', 'मैं स्पष्ट करता हूँ।', 'कौन सा हिस्सा?'],
        CORRECTION: ['ओह, समझ गया।', 'ठीक है।', 'आप सही हैं।'],
        URGENT: ['हाँ?', 'मैं सुन रहा हूँ।', 'क्या हुआ?']
      },
      ta: {
        CLARIFICATION: ['ஆமா?', 'தெளிவுபடுத்துகிறேன்.', 'எந்த பகுதி?'],
        CORRECTION: ['ஓ, புரிந்தது.', 'சரி.', 'நீங்கள் சரி.'],
        URGENT: ['ஆமா?', 'கேட்கிறேன்.', 'என்ன?']
      },
      te: {
        CLARIFICATION: ['అవును?', 'స్పష్టం చేస్తాను.', 'ఏ భాగం?'],
        CORRECTION: ['ఓహ్, అర్థమైంది.', 'సరే.', 'మీరు సరి.'],
        URGENT: ['అవును?', 'వింటున్నాను.', 'ఏమిటి?']
      },
      bn: {
        CLARIFICATION: ['হ্যাঁ?', 'আমি স্পষ্ট করছি।', 'কোন অংশ?'],
        CORRECTION: ['ওহ, বুঝেছি।', 'ঠিক আছে।', 'আপনি ঠিক।'],
        URGENT: ['হ্যাঁ?', 'শুনছি।', 'কি?']
      }
    };

    const langAcks = acknowledgments[this.language] || acknowledgments.en;
    const typeAcks = langAcks[interruptionType] || langAcks.CLARIFICATION;

    return typeAcks[Math.floor(Math.random() * typeAcks.length)];
  }

  /**
   * Play quick acknowledgment
   */
  async playAcknowledgment(text) {
    console.log('[AudioCancellation] Acknowledgment:', text);

    // Check if we have pre-loaded audio for this
    const cacheKey = `${this.language}:${text}`;
    if (this.acknowledgmentAudio.has(cacheKey)) {
      const audioData = this.acknowledgmentAudio.get(cacheKey);
      return await this.playAudioData(audioData);
    }

    // Otherwise, we'll need to synthesize (or use browser TTS as fallback)
    return await this.playTextToSpeech(text);
  }

  /**
   * Play audio from data
   */
  async playAudioData(audioData) {
    return new Promise((resolve, reject) => {
      const audio = new Audio();
      const blob = new Blob([audioData], { type: 'audio/mp3' });
      audio.src = URL.createObjectURL(blob);

      audio.onended = () => {
        URL.revokeObjectURL(audio.src);
        resolve();
      };

      audio.onerror = (error) => {
        console.error('[AudioCancellation] Playback error:', error);
        reject(error);
      };

      audio.play().catch(reject);
    });
  }

  /**
   * Play text using browser TTS (fallback)
   */
  async playTextToSpeech(text) {
    if (!('speechSynthesis' in window)) {
      console.warn('[AudioCancellation] Speech synthesis not available');
      return;
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = this.getLanguageCode();
      utterance.rate = 1.1; // Slightly faster for acknowledgments
      utterance.pitch = 1.0;

      utterance.onend = resolve;
      utterance.onerror = () => resolve(); // Don't block on error

      speechSynthesis.speak(utterance);
    });
  }

  /**
   * Get full language code for browser TTS
   */
  getLanguageCode() {
    const languageCodes = {
      en: 'en-US',
      hi: 'hi-IN',
      ta: 'ta-IN',
      te: 'te-IN',
      bn: 'bn-IN',
      mr: 'mr-IN',
      gu: 'gu-IN',
      kn: 'kn-IN',
      ml: 'ml-IN',
      pa: 'pa-IN'
    };

    return languageCodes[this.language] || 'en-US';
  }

  /**
   * Pre-load acknowledgment audio
   */
  preloadAcknowledgment(language, text, audioData) {
    const cacheKey = `${language}:${text}`;
    this.acknowledgmentAudio.set(cacheKey, audioData);
  }

  /**
   * Set language
   */
  setLanguage(language) {
    this.language = language;
  }

  /**
   * Sleep utility
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.gainNode = null;
    this.acknowledgmentAudio.clear();
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GracefulAudioCancellation;
}
