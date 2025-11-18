/**
 * Conversation Issue Detector (Client-Side)
 * Detects pauses, noise, and other conversation issues in real-time
 */

class ConversationIssueDetector {
  constructor(options = {}) {
    // Timing thresholds
    this.SILENCE_THRESHOLD = options.silenceThreshold || 3000; // 3 seconds
    this.PAUSE_THRESHOLD = options.pauseThreshold || 2000; // 2 seconds
    this.NOISE_THRESHOLD = options.noiseThreshold || 0.7; // 70% noise ratio

    // State tracking
    this.silenceDuration = 0;
    this.lastSpeechTime = Date.now();
    this.consecutiveSilenceEvents = 0;
    this.noiseLevel = 0;

    // Audio analysis
    this.analyzer = null;
    this.audioContext = null;

    // Issue history
    this.issueHistory = [];
    this.maxHistorySize = 10;
  }

  /**
   * Initialize audio analyzer
   */
  initializeAnalyzer(audioStream) {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioContext.createMediaStreamSource(audioStream);

      this.analyzer = this.audioContext.createAnalyser();
      this.analyzer.fftSize = 2048;
      this.analyzer.smoothingTimeConstant = 0.8;

      source.connect(this.analyzer);

      console.log('[IssueDetector] Audio analyzer initialized');
    } catch (error) {
      console.error('[IssueDetector] Failed to initialize analyzer:', error);
    }
  }

  /**
   * Detect conversation issues
   * @param {boolean} vadActive - Voice activity detection state
   * @returns {object|null} Detected issue or null
   */
  detectIssue(vadActive) {
    const now = Date.now();

    // Update speech tracking
    if (vadActive) {
      this.lastSpeechTime = now;
      this.consecutiveSilenceEvents = 0;
    }

    const silenceDuration = now - this.lastSpeechTime;

    // 1. Long Pause Detection
    if (!vadActive && silenceDuration > this.PAUSE_THRESHOLD) {
      this.silenceDuration = silenceDuration;

      const severity = this.getSeverity(
        silenceDuration,
        this.PAUSE_THRESHOLD,
        this.PAUSE_THRESHOLD * 1.5,
        this.SILENCE_THRESHOLD
      );

      const issue = {
        type: 'LONG_PAUSE',
        duration: silenceDuration,
        severity: severity,
        timestamp: now,
        consecutiveCount: ++this.consecutiveSilenceEvents
      };

      // Only return if it's getting worse or new
      if (this.consecutiveSilenceEvents <= 1 || severity === 'critical') {
        this.addToHistory(issue);
        return issue;
      }
    }

    // 2. No Speech Detected (Extended Silence)
    if (!vadActive && silenceDuration > this.SILENCE_THRESHOLD) {
      const issue = {
        type: 'NO_SPEECH',
        duration: silenceDuration,
        severity: 'critical',
        timestamp: now
      };

      this.addToHistory(issue);
      return issue;
    }

    // 3. Background Noise Detection
    if (this.analyzer) {
      const noiseRatio = this.calculateNoiseRatio();

      if (noiseRatio > this.NOISE_THRESHOLD) {
        const issue = {
          type: 'BACKGROUND_NOISE',
          level: noiseRatio,
          severity: this.getNoiseLevel(noiseRatio),
          timestamp: now
        };

        // Debounce noise detection (only report every 5 seconds)
        const lastNoiseIssue = this.getLastIssueOfType('BACKGROUND_NOISE');
        if (!lastNoiseIssue || (now - lastNoiseIssue.timestamp) > 5000) {
          this.addToHistory(issue);
          return issue;
        }
      }
    }

    return null;
  }

  /**
   * Calculate noise ratio from frequency data
   */
  calculateNoiseRatio() {
    if (!this.analyzer) return 0;

    const bufferLength = this.analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyzer.getByteFrequencyData(dataArray);

    // Analyze frequency distribution
    // Voice typically has energy in 85-255 Hz (low frequencies)
    // Noise has broader spectrum including high frequencies

    let lowFreqEnergy = 0;  // 0-40% of spectrum (voice range)
    let midFreqEnergy = 0;  // 40-60% of spectrum
    let highFreqEnergy = 0; // 60-100% of spectrum (noise range)

    const lowThreshold = Math.floor(bufferLength * 0.4);
    const highThreshold = Math.floor(bufferLength * 0.6);

    for (let i = 0; i < bufferLength; i++) {
      if (i < lowThreshold) {
        lowFreqEnergy += dataArray[i];
      } else if (i < highThreshold) {
        midFreqEnergy += dataArray[i];
      } else {
        highFreqEnergy += dataArray[i];
      }
    }

    const totalEnergy = lowFreqEnergy + midFreqEnergy + highFreqEnergy;

    if (totalEnergy === 0) return 0;

    // High frequency energy ratio indicates noise
    const noiseRatio = highFreqEnergy / totalEnergy;

    return noiseRatio;
  }

  /**
   * Get audio RMS level (volume)
   */
  getAudioLevel() {
    if (!this.analyzer) return 0;

    const bufferLength = this.analyzer.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    this.analyzer.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < bufferLength; i++) {
      const normalized = (dataArray[i] - 128) / 128;
      sum += normalized * normalized;
    }

    const rms = Math.sqrt(sum / bufferLength);
    return rms;
  }

  /**
   * Get severity level based on value and thresholds
   */
  getSeverity(value, low, medium, high) {
    if (value < low) return 'low';
    if (value < medium) return 'medium';
    if (value < high) return 'high';
    return 'critical';
  }

  /**
   * Get noise severity level
   */
  getNoiseLevel(noiseRatio) {
    if (noiseRatio < 0.7) return 'low';
    if (noiseRatio < 0.8) return 'medium';
    if (noiseRatio < 0.9) return 'high';
    return 'critical';
  }

  /**
   * Add issue to history
   */
  addToHistory(issue) {
    this.issueHistory.push(issue);

    // Maintain max history size
    if (this.issueHistory.length > this.maxHistorySize) {
      this.issueHistory.shift();
    }
  }

  /**
   * Get last issue of specific type
   */
  getLastIssueOfType(type) {
    for (let i = this.issueHistory.length - 1; i >= 0; i--) {
      if (this.issueHistory[i].type === type) {
        return this.issueHistory[i];
      }
    }
    return null;
  }

  /**
   * Get issue frequency (issues per minute)
   */
  getIssueFrequency(type = null, timeWindow = 60000) {
    const now = Date.now();
    const cutoff = now - timeWindow;

    let count = 0;
    for (const issue of this.issueHistory) {
      if (issue.timestamp > cutoff) {
        if (type === null || issue.type === type) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Check if user environment is problematic
   */
  isProblematicEnvironment() {
    const recentIssues = this.getIssueFrequency(null, 60000);
    const noiseIssues = this.getIssueFrequency('BACKGROUND_NOISE', 60000);

    return recentIssues > 5 || noiseIssues > 3;
  }

  /**
   * Get environment quality score (0-1)
   */
  getEnvironmentQuality() {
    const recentIssues = this.getIssueFrequency(null, 60000);
    const noiseIssues = this.getIssueFrequency('BACKGROUND_NOISE', 60000);

    let score = 1.0;

    // Penalize for issues
    score -= recentIssues * 0.1;
    score -= noiseIssues * 0.15;

    // Bonus for no recent issues
    if (recentIssues === 0) {
      score = 1.0;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Reset state
   */
  reset() {
    this.silenceDuration = 0;
    this.lastSpeechTime = Date.now();
    this.consecutiveSilenceEvents = 0;
    this.noiseLevel = 0;
  }

  /**
   * Clear history
   */
  clearHistory() {
    this.issueHistory = [];
  }

  /**
   * Cleanup resources
   */
  cleanup() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.analyzer = null;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ConversationIssueDetector;
}
