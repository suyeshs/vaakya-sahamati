/**
 * STT Quality Analyzer
 * Analyzes transcription quality and detects conversation issues
 */

const { logger } = require('../utils/logger');

class STTQualityAnalyzer {
  constructor() {
    // Confidence thresholds
    this.CONFIDENCE_CRITICAL = 0.3;
    this.CONFIDENCE_HIGH = 0.5;
    this.CONFIDENCE_MEDIUM = 0.6;
    this.CONFIDENCE_LOW = 0.8;

    // Incoherence detection
    this.REPEATED_WORD_THRESHOLD = 0.3;
    this.FRAGMENT_THRESHOLD = 0.5;
    this.MIN_WORDS_FOR_ANALYSIS = 3;

    // Common filler words (to ignore in repetition analysis)
    this.fillerWords = {
      en: ['um', 'uh', 'like', 'you know', 'i mean', 'actually', 'basically'],
      hi: ['उम', 'आ', 'वो', 'मतलब', 'यानी'],
      ta: ['அது', 'இது', 'அப்படி'],
      te: ['అది', 'ఇది', 'అలా'],
      bn: ['উম', 'আ', 'সেটা']
    };
  }

  /**
   * Analyze transcription result for quality issues
   * @param {object} sttResult - STT transcription result
   * @param {string} expectedLanguage - Expected language code
   * @returns {Array} Array of detected issues
   */
  analyzeTranscription(sttResult, expectedLanguage = 'en') {
    const issues = [];

    if (!sttResult.success || !sttResult.transcript) {
      issues.push({
        type: 'EMPTY_TRANSCRIPT',
        severity: 'critical',
        confidence: 1.0,
        message: 'No transcript received'
      });
      return issues;
    }

    const transcript = sttResult.transcript;
    const confidence = sttResult.confidence || 0;

    // 1. Low Confidence Detection
    const confidenceIssue = this.checkConfidence(confidence, transcript);
    if (confidenceIssue) {
      issues.push(confidenceIssue);
    }

    // 2. Incoherent Speech Detection
    const incoherenceIssue = this.checkIncoherence(transcript, expectedLanguage);
    if (incoherenceIssue) {
      issues.push(incoherenceIssue);
    }

    // 3. Partial Recognition
    const partialIssue = this.checkPartialRecognition(transcript, sttResult.isFinal);
    if (partialIssue) {
      issues.push(partialIssue);
    }

    // 4. Language Mismatch
    const languageIssue = this.checkLanguageMismatch(
      sttResult.languageCode,
      expectedLanguage
    );
    if (languageIssue) {
      issues.push(languageIssue);
    }

    // 5. Empty or Only Punctuation
    const emptyIssue = this.checkEmptyContent(transcript);
    if (emptyIssue) {
      issues.push(emptyIssue);
    }

    // 6. Background Noise Indicators
    const noiseIssue = this.checkBackgroundNoiseIndicators(transcript, confidence);
    if (noiseIssue) {
      issues.push(noiseIssue);
    }

    if (issues.length > 0) {
      logger.warn('[STTQualityAnalyzer] Issues detected', {
        transcript: transcript.substring(0, 50),
        issueCount: issues.length,
        issueTypes: issues.map(i => i.type)
      });
    }

    return issues;
  }

  /**
   * Check confidence levels
   */
  checkConfidence(confidence, transcript) {
    if (confidence < this.CONFIDENCE_CRITICAL) {
      return {
        type: 'LOW_CONFIDENCE',
        severity: 'critical',
        confidence: confidence,
        transcript: transcript,
        message: `Very low confidence: ${(confidence * 100).toFixed(1)}%`
      };
    }

    if (confidence < this.CONFIDENCE_HIGH) {
      return {
        type: 'LOW_CONFIDENCE',
        severity: 'high',
        confidence: confidence,
        transcript: transcript,
        message: `Low confidence: ${(confidence * 100).toFixed(1)}%`
      };
    }

    if (confidence < this.CONFIDENCE_MEDIUM) {
      return {
        type: 'LOW_CONFIDENCE',
        severity: 'medium',
        confidence: confidence,
        transcript: transcript,
        message: `Medium confidence: ${(confidence * 100).toFixed(1)}%`
      };
    }

    return null;
  }

  /**
   * Check for incoherent speech patterns
   */
  checkIncoherence(transcript, language) {
    const words = transcript.toLowerCase().split(/\s+/);

    if (words.length < this.MIN_WORDS_FOR_ANALYSIS) {
      return null; // Too short to analyze
    }

    // Get filler words for this language
    const fillers = this.fillerWords[language] || this.fillerWords.en;

    // Filter out filler words
    const meaningfulWords = words.filter(word => !fillers.includes(word));

    if (meaningfulWords.length === 0) {
      return {
        type: 'INCOHERENT_SPEECH',
        severity: 'high',
        transcript: transcript,
        message: 'Only filler words detected',
        details: 'onlyFillers'
      };
    }

    // Check for repeated words
    const wordCount = {};
    let repeatedWords = 0;

    meaningfulWords.forEach(word => {
      if (word.length > 2) { // Ignore very short words
        wordCount[word] = (wordCount[word] || 0) + 1;
        if (wordCount[word] > 2) {
          repeatedWords++;
        }
      }
    });

    const repetitionRatio = repeatedWords / meaningfulWords.length;

    if (repetitionRatio > this.REPEATED_WORD_THRESHOLD) {
      return {
        type: 'INCOHERENT_SPEECH',
        severity: 'high',
        transcript: transcript,
        message: `High word repetition: ${(repetitionRatio * 100).toFixed(1)}%`,
        details: 'repeatedWords'
      };
    }

    // Check for too many single-character or two-character fragments
    const fragments = words.filter(w => w.length <= 2);
    const fragmentRatio = fragments.length / words.length;

    if (fragmentRatio > this.FRAGMENT_THRESHOLD) {
      return {
        type: 'INCOHERENT_SPEECH',
        severity: 'high',
        transcript: transcript,
        message: `Too many fragments: ${(fragmentRatio * 100).toFixed(1)}%`,
        details: 'tooManyFragments'
      };
    }

    // Check for stuttering patterns (same word repeated consecutively)
    for (let i = 0; i < words.length - 1; i++) {
      if (words[i] === words[i + 1] && words[i].length > 2) {
        return {
          type: 'INCOHERENT_SPEECH',
          severity: 'medium',
          transcript: transcript,
          message: 'Stuttering detected',
          details: 'stuttering'
        };
      }
    }

    return null;
  }

  /**
   * Check for partial recognition
   */
  checkPartialRecognition(transcript, isFinal) {
    const words = transcript.split(/\s+/);

    // If final result but too short
    if (isFinal && words.length < this.MIN_WORDS_FOR_ANALYSIS) {
      return {
        type: 'PARTIAL_RECOGNITION',
        severity: 'medium',
        transcript: transcript,
        wordCount: words.length,
        message: `Only ${words.length} word(s) recognized`
      };
    }

    return null;
  }

  /**
   * Check for language mismatch
   */
  checkLanguageMismatch(detectedLanguage, expectedLanguage) {
    if (!detectedLanguage || !expectedLanguage) {
      return null;
    }

    // Extract base language code (e.g., 'en-US' -> 'en')
    const detectedBase = detectedLanguage.split('-')[0].toLowerCase();
    const expectedBase = expectedLanguage.split('-')[0].toLowerCase();

    if (detectedBase !== expectedBase) {
      return {
        type: 'LANGUAGE_MISMATCH',
        severity: 'medium',
        detected: detectedLanguage,
        expected: expectedLanguage,
        message: `Expected ${expectedLanguage}, detected ${detectedLanguage}`
      };
    }

    return null;
  }

  /**
   * Check for empty or meaningless content
   */
  checkEmptyContent(transcript) {
    // Remove all whitespace and punctuation
    const content = transcript.trim().replace(/[.,!?;:\s]/g, '');

    if (content.length === 0) {
      return {
        type: 'EMPTY_TRANSCRIPT',
        severity: 'critical',
        transcript: transcript,
        message: 'Transcript contains only punctuation or whitespace'
      };
    }

    // Check if transcript is just noise representations
    const noisePatterns = /^[\[\]\(\)\*]+$/;
    if (noisePatterns.test(content)) {
      return {
        type: 'EMPTY_TRANSCRIPT',
        severity: 'high',
        transcript: transcript,
        message: 'Transcript contains only noise markers'
      };
    }

    return null;
  }

  /**
   * Check for background noise indicators
   */
  checkBackgroundNoiseIndicators(transcript, confidence) {
    const lowerTranscript = transcript.toLowerCase();

    // Common noise transcription patterns
    const noisePatterns = [
      '[noise]',
      '[inaudible]',
      '[music]',
      '[background noise]',
      '***',
      '[unintelligible]'
    ];

    const hasNoiseMarkers = noisePatterns.some(pattern =>
      lowerTranscript.includes(pattern)
    );

    if (hasNoiseMarkers) {
      return {
        type: 'BACKGROUND_NOISE',
        severity: 'high',
        transcript: transcript,
        confidence: confidence,
        message: 'Background noise detected in transcript'
      };
    }

    // Low confidence + short transcript often indicates noise
    if (confidence < 0.4 && transcript.split(/\s+/).length < 3) {
      return {
        type: 'BACKGROUND_NOISE',
        severity: 'medium',
        transcript: transcript,
        confidence: confidence,
        message: 'Possible background noise (low confidence + short)'
      };
    }

    return null;
  }

  /**
   * Get overall quality score (0-1)
   */
  getQualityScore(issues) {
    if (issues.length === 0) {
      return 1.0;
    }

    const severityWeights = {
      'critical': 0.4,
      'high': 0.3,
      'medium': 0.2,
      'low': 0.1
    };

    let totalPenalty = 0;
    issues.forEach(issue => {
      totalPenalty += severityWeights[issue.severity] || 0.1;
    });

    // Cap penalty at 1.0
    totalPenalty = Math.min(totalPenalty, 1.0);

    return 1.0 - totalPenalty;
  }

  /**
   * Get recommended action based on issues
   */
  getRecommendedAction(issues) {
    if (issues.length === 0) {
      return 'CONTINUE';
    }

    // Check for critical issues
    const hasCritical = issues.some(i => i.severity === 'critical');
    if (hasCritical) {
      return 'REQUEST_REPEAT';
    }

    // Check for specific issue types
    const issueTypes = issues.map(i => i.type);

    if (issueTypes.includes('BACKGROUND_NOISE')) {
      return 'SUGGEST_QUIET_LOCATION';
    }

    if (issueTypes.includes('INCOHERENT_SPEECH')) {
      return 'REQUEST_CLARIFICATION';
    }

    if (issueTypes.includes('LANGUAGE_MISMATCH')) {
      return 'OFFER_LANGUAGE_SWITCH';
    }

    if (issueTypes.includes('LOW_CONFIDENCE')) {
      const highConfidenceIssues = issues.filter(
        i => i.type === 'LOW_CONFIDENCE' && i.severity === 'critical'
      );
      if (highConfidenceIssues.length > 0) {
        return 'REQUEST_REPEAT';
      }
      return 'REQUEST_CLARIFICATION';
    }

    return 'CONTINUE_WITH_CAUTION';
  }

  /**
   * Generate user-friendly message for issues
   */
  getIssueMessage(issues, language = 'en') {
    if (issues.length === 0) {
      return null;
    }

    const action = this.getRecommendedAction(issues);

    const messages = {
      en: {
        REQUEST_REPEAT: "I didn't quite catch that. Could you please repeat?",
        REQUEST_CLARIFICATION: "I'm having trouble understanding. Can you rephrase that?",
        SUGGEST_QUIET_LOCATION: "There seems to be background noise. Could you move to a quieter place?",
        OFFER_LANGUAGE_SWITCH: "I detected a different language. Would you like to switch?",
        CONTINUE_WITH_CAUTION: "I heard you, but I'm not completely sure. Please continue."
      },
      hi: {
        REQUEST_REPEAT: "मैं ठीक से सुन नहीं पाया। क्या आप दोहरा सकते हैं?",
        REQUEST_CLARIFICATION: "मुझे समझने में परेशानी हो रही है। क्या आप दूसरे तरीके से बता सकते हैं?",
        SUGGEST_QUIET_LOCATION: "पृष्ठभूमि में शोर है। क्या आप शांत जगह पर जा सकते हैं?",
        OFFER_LANGUAGE_SWITCH: "मैंने एक अलग भाषा का पता लगाया। क्या आप बदलना चाहेंगे?",
        CONTINUE_WITH_CAUTION: "मैंने सुना, लेकिन पूरी तरह निश्चित नहीं हूं। कृपया जारी रखें।"
      },
      ta: {
        REQUEST_REPEAT: "நான் சரியாகக் கேட்கவில்லை. மீண்டும் சொல்ல முடியுமா?",
        REQUEST_CLARIFICATION: "எனக்கு புரியவில்லை. வேறு விதமாக சொல்ல முடியுமா?",
        SUGGEST_QUIET_LOCATION: "பின்னணியில் சத்தம் உள்ளது. அமைதியான இடத்திற்கு செல்ல முடியுமா?",
        OFFER_LANGUAGE_SWITCH: "வேறு மொழி கண்டறியப்பட்டது. மாற்ற விரும்புகிறீர்களா?",
        CONTINUE_WITH_CAUTION: "கேட்டேன், ஆனால் முழுமையாக உறுதியாக இல்லை. தொடரவும்."
      }
    };

    const langMessages = messages[language] || messages.en;
    return langMessages[action] || langMessages.REQUEST_CLARIFICATION;
  }
}

module.exports = STTQualityAnalyzer;
