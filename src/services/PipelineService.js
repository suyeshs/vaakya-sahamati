/**
 * Pipeline Service
 * Orchestrates STT → LLM → TTS pipeline for conversational AI
 */

const { logger } = require('../utils/logger');

class PipelineService {
  constructor(services) {
    this.sttService = services.stt;
    this.llmService = services.llm;
    this.ttsService = services.tts;
    this.sttAnalyzer = services.sttAnalyzer;
    this.polyfillSelector = services.polyfillSelector;
    this.responseGenerator = services.responseGenerator;
    this.adaptiveManager = services.adaptiveManager;

    // Pipeline mode: 'stt_tts', 'hybrid', 'gemini_live'
    this.defaultMode = 'stt_tts';

    // Audio buffer configuration
    this.bufferDuration = 2000; // 2 seconds for better STT accuracy
    this.audioBuffers = new Map(); // sessionId -> audio chunks
  }

  /**
   * Process audio through STT → LLM → TTS pipeline
   * @param {Buffer} audioBuffer - Audio data (Opus or PCM)
   * @param {object} session - Session data
   * @param {object} options - Pipeline options
   * @returns {Promise<object>} Pipeline result with audio and text
   */
  async processAudio(audioBuffer, session, options = {}) {
    const startTime = Date.now();
    const mode = options.mode || session.mode || this.defaultMode;

    try {
      logger.info('[Pipeline] Processing audio', {
        sessionId: session.id,
        mode,
        audioSize: audioBuffer.length
      });

      // Step 1: Speech-to-Text
      const sttResult = await this.transcribeAudio(audioBuffer, session.language, options);

      if (!sttResult.success) {
        return await this.handleSTTFailure(sttResult, session);
      }

      // Step 2: Analyze STT quality
      const issues = this.sttAnalyzer.analyzeTranscription(sttResult, session.language);

      if (issues.length > 0) {
        return await this.handleSTTIssues(issues, session, sttResult);
      }

      // Step 3: Generate LLM response
      const llmResponse = await this.generateResponse(
        sttResult.transcript,
        session,
        options
      );

      // Step 4: Text-to-Speech
      const ttsAudio = await this.synthesizeSpeech(
        llmResponse.text,
        session.language,
        options
      );

      const totalLatency = Date.now() - startTime;

      logger.info('[Pipeline] Completed', {
        sessionId: session.id,
        mode,
        sttConfidence: sttResult.confidence,
        issueCount: issues.length,
        responseLength: llmResponse.text.length,
        totalLatency
      });

      return {
        success: true,
        mode,
        stt: {
          transcript: sttResult.transcript,
          confidence: sttResult.confidence
        },
        llm: {
          text: llmResponse.text,
          hasAcknowledgment: llmResponse.hasAcknowledgment
        },
        tts: {
          audio: ttsAudio,
          format: 'mp3'
        },
        latency: {
          total: totalLatency,
          stt: sttResult.latency || 0,
          llm: llmResponse.latency || 0,
          tts: options.ttsLatency || 0
        }
      };

    } catch (error) {
      logger.error('[Pipeline] Processing error', {
        sessionId: session.id,
        error: error.message,
        stack: error.stack
      });

      throw error;
    }
  }

  /**
   * Transcribe audio using STT service
   */
  async transcribeAudio(audioBuffer, language, options = {}) {
    const startTime = Date.now();

    try {
      const result = await this.sttService.transcribe(audioBuffer, language, {
        encoding: options.encoding || 'WEBM_OPUS',
        sampleRateHertz: options.sampleRate || 48000,
        model: options.sttModel || 'default'
      });

      result.latency = Date.now() - startTime;
      return result;

    } catch (error) {
      logger.error('[Pipeline] STT error', { error: error.message });
      return {
        success: false,
        error: error.message,
        transcript: '',
        confidence: 0
      };
    }
  }

  /**
   * Generate LLM response
   */
  async generateResponse(transcript, session, options = {}) {
    const startTime = Date.now();

    try {
      // Check if this is after an interruption
      if (session.wasInterrupted && session.interruptionContext) {
        const response = await this.responseGenerator.generateResponse(
          transcript,
          session.interruptionContext,
          session
        );

        response.latency = Date.now() - startTime;
        return response;
      }

      // Normal response generation
      const response = await this.llmService.generateResponse(transcript, {
        sessionId: session.id,
        language: session.language,
        systemInstruction: options.systemInstruction || session.systemInstruction,
        maxTokens: this.getMaxTokens(session.responseStyle),
        temperature: 0.8
      });

      return {
        text: response.text || response,
        latency: Date.now() - startTime,
        hasAcknowledgment: false
      };

    } catch (error) {
      logger.error('[Pipeline] LLM error', { error: error.message });
      throw error;
    }
  }

  /**
   * Synthesize speech using TTS service
   */
  async synthesizeSpeech(text, language, options = {}) {
    const startTime = Date.now();

    try {
      const audioBuffer = await this.ttsService.synthesizeSpeech(
        text,
        language,
        options.voiceName || null,
        {
          preferredType: options.voiceType || 'neural',
          encoding: options.encoding || 'MP3',
          speakingRate: options.speakingRate || 1.0
        }
      );

      options.ttsLatency = Date.now() - startTime;
      return audioBuffer;

    } catch (error) {
      logger.error('[Pipeline] TTS error', { error: error.message });
      throw error;
    }
  }

  /**
   * Handle STT failure
   */
  async handleSTTFailure(sttResult, session) {
    logger.warn('[Pipeline] STT failed', {
      sessionId: session.id,
      error: sttResult.error
    });

    // Generate polyfill response
    const polyfill = await this.polyfillSelector.selectPolyfill(
      {
        type: 'EMPTY_TRANSCRIPT',
        severity: 'critical',
        language: session.language
      },
      {
        attemptCount: session.attemptCount || 0,
        userFrustrationLevel: this.adaptiveManager?.userProfile.frustrationLevel || 0
      }
    );

    return {
      success: false,
      isPolyfill: true,
      polyfill: {
        type: 'EMPTY_TRANSCRIPT',
        text: polyfill.text,
        audio: polyfill.audio,
        source: polyfill.source
      }
    };
  }

  /**
   * Handle STT quality issues
   */
  async handleSTTIssues(issues, session, sttResult) {
    const highestSeverityIssue = this.getHighestSeverityIssue(issues);

    logger.warn('[Pipeline] STT quality issues', {
      sessionId: session.id,
      issueCount: issues.length,
      highestSeverity: highestSeverityIssue.severity,
      type: highestSeverityIssue.type
    });

    // Record issue for adaptive learning
    if (this.adaptiveManager) {
      this.adaptiveManager.recordIssue(highestSeverityIssue);
    }

    // Get recommended action
    const action = this.sttAnalyzer.getRecommendedAction(issues);

    // Generate polyfill response if action requires it
    if (action !== 'CONTINUE' && action !== 'CONTINUE_WITH_CAUTION') {
      const polyfill = await this.polyfillSelector.selectPolyfill(
        {
          type: highestSeverityIssue.type,
          severity: highestSeverityIssue.severity,
          language: session.language
        },
        {
          attemptCount: session.attemptCount || 0,
          userFrustrationLevel: this.adaptiveManager?.userProfile.frustrationLevel || 0
        }
      );

      return {
        success: false,
        isPolyfill: true,
        stt: {
          transcript: sttResult.transcript,
          confidence: sttResult.confidence,
          issues: issues
        },
        polyfill: {
          type: highestSeverityIssue.type,
          text: polyfill.text,
          audio: polyfill.audio,
          source: polyfill.source,
          action: action
        }
      };
    }

    // Continue with caution - process normally but flag issues
    return null; // Indicates to continue processing
  }

  /**
   * Get highest severity issue
   */
  getHighestSeverityIssue(issues) {
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };

    return issues.reduce((highest, issue) => {
      if (severityOrder[issue.severity] < severityOrder[highest.severity]) {
        return issue;
      }
      return highest;
    }, issues[0]);
  }

  /**
   * Buffer audio chunks for better STT accuracy
   */
  bufferAudioChunk(sessionId, audioChunk) {
    if (!this.audioBuffers.has(sessionId)) {
      this.audioBuffers.set(sessionId, {
        chunks: [],
        startTime: Date.now(),
        totalSize: 0
      });
    }

    const buffer = this.audioBuffers.get(sessionId);
    buffer.chunks.push(audioChunk);
    buffer.totalSize += audioChunk.length;

    const duration = Date.now() - buffer.startTime;

    // Check if buffer is ready to process
    if (duration >= this.bufferDuration || buffer.totalSize > 100000) {
      const combinedBuffer = Buffer.concat(buffer.chunks);
      this.audioBuffers.delete(sessionId);
      return {
        ready: true,
        buffer: combinedBuffer,
        duration: duration
      };
    }

    return {
      ready: false,
      buffered: buffer.chunks.length
    };
  }

  /**
   * Get buffered audio without clearing
   */
  getBufferedAudio(sessionId) {
    const buffer = this.audioBuffers.get(sessionId);
    if (!buffer || buffer.chunks.length === 0) {
      return null;
    }

    return Buffer.concat(buffer.chunks);
  }

  /**
   * Clear audio buffer for session
   */
  clearAudioBuffer(sessionId) {
    this.audioBuffers.delete(sessionId);
  }

  /**
   * Get max tokens based on response style
   */
  getMaxTokens(responseStyle = {}) {
    const styleTokens = {
      concise: 100,
      detailed: 300,
      simple: 150,
      normal: 200
    };

    return styleTokens[responseStyle.style] || styleTokens.normal;
  }

  /**
   * Get pipeline statistics
   */
  getStats() {
    return {
      activeBuffers: this.audioBuffers.size,
      defaultMode: this.defaultMode,
      bufferDuration: this.bufferDuration
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    this.audioBuffers.clear();
    logger.info('[Pipeline] Cleanup completed');
  }
}

module.exports = PipelineService;
