/**
 * Adaptive Conversation Manager
 * Tracks user behavior patterns and adapts conversation strategy
 */

const { logger } = require('../utils/logger');

class AdaptiveConversationManager {
  constructor(sessionId) {
    this.sessionId = sessionId;

    // User profile tracking
    this.userProfile = {
      language: 'en',
      noiseEnvironment: 'low', // low, medium, high
      speechClarity: 'high', // low, medium, high
      pauseFrequency: 'normal', // rare, normal, frequent
      interruptionStyle: 'normal', // polite, frequent, urgent
      frustrationLevel: 0, // 0-1
      attemptCount: 0,
      issueHistory: [],
      interruptionHistory: []
    };

    // Adaptation thresholds
    this.adaptationRules = {
      HIGH_NOISE_THRESHOLD: 3,
      LOW_CLARITY_THRESHOLD: 3,
      FREQUENT_PAUSE_THRESHOLD: 4,
      FREQUENT_INTERRUPTION_THRESHOLD: 5,
      HIGH_FRUSTRATION_THRESHOLD: 0.7
    };

    // Current adaptations
    this.activeAdaptations = [];
  }

  /**
   * Record a conversation issue
   */
  recordIssue(issue) {
    this.userProfile.issueHistory.push({
      type: issue.type,
      severity: issue.severity,
      timestamp: Date.now()
    });

    this.userProfile.attemptCount++;

    // Analyze patterns
    this.analyzePatterns();

    // Get recommended adaptations
    const adaptations = this.adapt();

    logger.info('[AdaptiveConversation] Issue recorded', {
      sessionId: this.sessionId,
      issueType: issue.type,
      totalIssues: this.userProfile.issueHistory.length,
      adaptationCount: adaptations.length
    });

    return adaptations;
  }

  /**
   * Record an interruption
   */
  recordInterruption(interruption) {
    this.userProfile.interruptionHistory.push({
      type: interruption.type,
      confidence: interruption.confidence,
      progress: interruption.timing?.progress || 0,
      timestamp: Date.now()
    });

    // Analyze interruption patterns
    this.analyzeInterruptionPatterns();

    // Get adaptations
    const adaptations = this.adapt();

    logger.info('[AdaptiveConversation] Interruption recorded', {
      sessionId: this.sessionId,
      interruptionType: interruption.type,
      totalInterruptions: this.userProfile.interruptionHistory.length
    });

    return adaptations;
  }

  /**
   * Analyze issue patterns
   */
  analyzePatterns() {
    const recentIssues = this.getRecentIssues(10);

    // Count issue types
    const issueCounts = {};
    recentIssues.forEach(issue => {
      issueCounts[issue.type] = (issueCounts[issue.type] || 0) + 1;
    });

    // Update noise environment assessment
    if (issueCounts.BACKGROUND_NOISE >= this.adaptationRules.HIGH_NOISE_THRESHOLD) {
      this.userProfile.noiseEnvironment = 'high';
    } else if (issueCounts.BACKGROUND_NOISE >= 2) {
      this.userProfile.noiseEnvironment = 'medium';
    } else {
      this.userProfile.noiseEnvironment = 'low';
    }

    // Update speech clarity assessment
    if (issueCounts.LOW_CONFIDENCE >= this.adaptationRules.LOW_CLARITY_THRESHOLD ||
        issueCounts.INCOHERENT_SPEECH >= 2) {
      this.userProfile.speechClarity = 'low';
    } else if (issueCounts.LOW_CONFIDENCE >= 2) {
      this.userProfile.speechClarity = 'medium';
    } else {
      this.userProfile.speechClarity = 'high';
    }

    // Update pause frequency
    if (issueCounts.LONG_PAUSE >= this.adaptationRules.FREQUENT_PAUSE_THRESHOLD) {
      this.userProfile.pauseFrequency = 'frequent';
    } else if (issueCounts.LONG_PAUSE >= 2) {
      this.userProfile.pauseFrequency = 'normal';
    } else {
      this.userProfile.pauseFrequency = 'rare';
    }

    // Calculate frustration level
    // More issues and higher severity = higher frustration
    let frustrationScore = 0;
    recentIssues.forEach(issue => {
      const severityWeight = {
        'critical': 0.15,
        'high': 0.1,
        'medium': 0.05,
        'low': 0.02
      };
      frustrationScore += severityWeight[issue.severity] || 0.05;
    });

    this.userProfile.frustrationLevel = Math.min(1.0, frustrationScore);
  }

  /**
   * Analyze interruption patterns
   */
  analyzeInterruptionPatterns() {
    const recentInterruptions = this.getRecentInterruptions(10);

    if (recentInterruptions.length === 0) {
      this.userProfile.interruptionStyle = 'normal';
      return;
    }

    // Count interruption types
    const interruptionCounts = {};
    recentInterruptions.forEach(interruption => {
      interruptionCounts[interruption.type] = (interruptionCounts[interruption.type] || 0) + 1;
    });

    // Analyze style
    if (interruptionCounts.URGENT >= 3) {
      this.userProfile.interruptionStyle = 'urgent';
    } else if (recentInterruptions.length >= this.adaptationRules.FREQUENT_INTERRUPTION_THRESHOLD) {
      this.userProfile.interruptionStyle = 'frequent';
    } else if (interruptionCounts.CLARIFICATION >= 3) {
      this.userProfile.interruptionStyle = 'clarification_seeker';
    } else {
      this.userProfile.interruptionStyle = 'normal';
    }

    // Add to frustration if too many interruptions
    if (recentInterruptions.length >= 5) {
      this.userProfile.frustrationLevel = Math.min(
        1.0,
        this.userProfile.frustrationLevel + 0.2
      );
    }
  }

  /**
   * Generate adaptation recommendations
   */
  adapt() {
    const recommendations = [];

    // 1. High noise → Suggest text input or retry later
    if (this.userProfile.noiseEnvironment === 'high') {
      if (!this.hasActiveAdaptation('SUGGEST_TEXT_INPUT')) {
        recommendations.push({
          action: 'SUGGEST_TEXT_INPUT',
          reason: 'high_noise',
          message: 'It seems noisy. Would you prefer to type instead?',
          priority: 'high'
        });
      }
    }

    // 2. Low clarity → Switch to hybrid STT mode for better accuracy
    if (this.userProfile.speechClarity === 'low') {
      if (!this.hasActiveAdaptation('SWITCH_TO_HYBRID_MODE')) {
        recommendations.push({
          action: 'SWITCH_TO_HYBRID_MODE',
          reason: 'low_clarity',
          message: null, // Silent switch
          priority: 'medium'
        });
      }
    }

    // 3. Frequent pauses → Increase patience time, don't interrupt
    if (this.userProfile.pauseFrequency === 'frequent') {
      recommendations.push({
        action: 'INCREASE_SILENCE_THRESHOLD',
        reason: 'frequent_pauses',
        newThreshold: 5000, // 5 seconds instead of 3
        priority: 'low'
      });
    }

    // 4. High frustration → Escalate to human or simplify interaction
    if (this.userProfile.frustrationLevel > this.adaptationRules.HIGH_FRUSTRATION_THRESHOLD) {
      if (!this.hasActiveAdaptation('OFFER_ALTERNATIVE')) {
        recommendations.push({
          action: 'OFFER_ALTERNATIVE',
          reason: 'user_frustration',
          message: 'Would you like to speak with a human agent instead?',
          priority: 'critical'
        });
      }
    }

    // 5. Frequent interruptions → Provide shorter, more concise responses
    if (this.userProfile.interruptionStyle === 'frequent') {
      recommendations.push({
        action: 'USE_CONCISE_RESPONSES',
        reason: 'frequent_interruptions',
        message: null,
        priority: 'medium'
      });
    }

    // 6. Clarification seeker → Provide more detailed explanations
    if (this.userProfile.interruptionStyle === 'clarification_seeker') {
      recommendations.push({
        action: 'USE_DETAILED_RESPONSES',
        reason: 'needs_clarification',
        message: null,
        priority: 'low'
      });
    }

    // Update active adaptations
    this.updateActiveAdaptations(recommendations);

    return recommendations;
  }

  /**
   * Check if adaptation is already active
   */
  hasActiveAdaptation(action) {
    return this.activeAdaptations.some(a => a.action === action);
  }

  /**
   * Update list of active adaptations
   */
  updateActiveAdaptations(newRecommendations) {
    // Add new recommendations
    newRecommendations.forEach(rec => {
      if (!this.hasActiveAdaptation(rec.action)) {
        this.activeAdaptations.push({
          ...rec,
          activatedAt: Date.now()
        });
      }
    });

    // Remove old adaptations (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    this.activeAdaptations = this.activeAdaptations.filter(
      a => a.activatedAt > fiveMinutesAgo
    );
  }

  /**
   * Get recent issues (last N or within time window)
   */
  getRecentIssues(count = 10, timeWindow = 5 * 60 * 1000) {
    const cutoff = Date.now() - timeWindow;
    return this.userProfile.issueHistory
      .filter(issue => issue.timestamp > cutoff)
      .slice(-count);
  }

  /**
   * Get recent interruptions
   */
  getRecentInterruptions(count = 10, timeWindow = 5 * 60 * 1000) {
    const cutoff = Date.now() - timeWindow;
    return this.userProfile.interruptionHistory
      .filter(interruption => interruption.timestamp > cutoff)
      .slice(-count);
  }

  /**
   * Get conversation quality score (0-1)
   */
  getQualityScore() {
    let score = 1.0;

    // Penalize for issues
    const recentIssues = this.getRecentIssues();
    score -= recentIssues.length * 0.05;

    // Penalize for high frustration
    score -= this.userProfile.frustrationLevel * 0.3;

    // Penalize for high noise or low clarity
    if (this.userProfile.noiseEnvironment === 'high') score -= 0.2;
    if (this.userProfile.speechClarity === 'low') score -= 0.2;

    // Bonus for smooth conversation (no recent issues)
    if (recentIssues.length === 0) {
      score = 1.0;
    }

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get recommended response style
   */
  getResponseStyle() {
    if (this.userProfile.interruptionStyle === 'frequent') {
      return {
        style: 'concise',
        maxWords: 50,
        breakIntoChunks: true
      };
    }

    if (this.userProfile.interruptionStyle === 'clarification_seeker') {
      return {
        style: 'detailed',
        maxWords: 150,
        includeExamples: true
      };
    }

    if (this.userProfile.frustrationLevel > 0.5) {
      return {
        style: 'simple',
        maxWords: 80,
        avoidJargon: true
      };
    }

    return {
      style: 'normal',
      maxWords: 100,
      breakIntoChunks: false
    };
  }

  /**
   * Get user profile summary
   */
  getUserProfile() {
    return {
      ...this.userProfile,
      qualityScore: this.getQualityScore(),
      responseStyle: this.getResponseStyle(),
      activeAdaptations: this.activeAdaptations
    };
  }

  /**
   * Reset user profile (for new conversation)
   */
  reset() {
    this.userProfile = {
      language: this.userProfile.language, // Keep language
      noiseEnvironment: 'low',
      speechClarity: 'high',
      pauseFrequency: 'normal',
      interruptionStyle: 'normal',
      frustrationLevel: 0,
      attemptCount: 0,
      issueHistory: [],
      interruptionHistory: []
    };
    this.activeAdaptations = [];

    logger.info('[AdaptiveConversation] Profile reset', {
      sessionId: this.sessionId
    });
  }
}

module.exports = AdaptiveConversationManager;
