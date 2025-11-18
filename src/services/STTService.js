/**
 * Google Cloud Speech-to-Text Service
 * Handles audio transcription with streaming support
 */

const speech = require('@google-cloud/speech');
const { logger } = require('../utils/logger');

class STTService {
  constructor(env) {
    this.env = env;
    this.client = null;
    this.initialized = false;

    // Supported languages
    this.languageConfigs = {
      'en': 'en-US',
      'hi': 'hi-IN',
      'ta': 'ta-IN',
      'te': 'te-IN',
      'bn': 'bn-IN',
      'mr': 'mr-IN',
      'kn': 'kn-IN',
      'gu': 'gu-IN',
      'ml': 'ml-IN',
      'pa': 'pa-IN'
    };

    // Active streaming sessions
    this.streamingSessions = new Map();
  }

  async initialize() {
    if (this.initialized) return;

    try {
      this.client = new speech.SpeechClient();
      this.initialized = true;

      logger.info('[STTService] Initialized', {
        supportedLanguages: Object.keys(this.languageConfigs).length
      });
    } catch (error) {
      logger.error('[STTService] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Transcribe audio buffer (non-streaming)
   * @param {Buffer} audioBuffer - Opus or PCM audio data
   * @param {string} languageCode - Language code (e.g., 'en', 'hi')
   * @param {object} options - Additional options
   * @returns {Promise<object>} Transcription result
   */
  async transcribe(audioBuffer, languageCode = 'en', options = {}) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      // Detect audio format and convert if needed
      const { audio, encoding, sampleRateHertz } = await this.prepareAudio(
        audioBuffer,
        options.encoding
      );

      // Handle auto language detection
      let config;
      let languageCodeFull;

      if (languageCode === 'auto') {
        // Use automatic language detection with multiple language codes
        languageCodeFull = 'auto';
        config = {
          encoding: encoding,
          sampleRateHertz: sampleRateHertz,
          languageCode: 'en-IN',  // Primary hint
          alternativeLanguageCodes: ['hi-IN', 'ta-IN', 'te-IN', 'mr-IN', 'bn-IN', 'gu-IN', 'kn-IN', 'ml-IN', 'pa-IN', 'en-US'],
          enableAutomaticPunctuation: true,
          model: 'latest_long',
          useEnhanced: true,
          maxAlternatives: options.maxAlternatives || 1,
          profanityFilter: options.profanityFilter || false
        };
        logger.info('[STTService] Using automatic language detection');
      } else {
        languageCodeFull = this.languageConfigs[languageCode] || 'en-US';
        config = {
          encoding: encoding,
          sampleRateHertz: sampleRateHertz,
          languageCode: languageCodeFull,
          enableAutomaticPunctuation: true,
          model: options.model || 'default',
          useEnhanced: true,
          alternativeLanguageCodes: this.getAlternativeLanguages(languageCode),
          maxAlternatives: options.maxAlternatives || 1,
          profanityFilter: options.profanityFilter || false
        };
      }

      const request = {
        audio: { content: audio.toString('base64') },
        config: config
      };

      const [response] = await this.client.recognize(request);

      if (!response.results || response.results.length === 0) {
        return {
          success: false,
          transcript: '',
          confidence: 0,
          alternatives: [],
          languageCode: languageCodeFull
        };
      }

      const result = response.results[0];
      const alternative = result.alternatives[0];

      logger.info('[STTService] Transcription complete', {
        languageCode: languageCodeFull,
        confidence: alternative.confidence,
        length: alternative.transcript.length
      });

      return {
        success: true,
        transcript: alternative.transcript,
        confidence: alternative.confidence,
        alternatives: result.alternatives.slice(1).map(alt => ({
          transcript: alt.transcript,
          confidence: alt.confidence
        })),
        languageCode: languageCodeFull,
        words: alternative.words || []
      };

    } catch (error) {
      logger.error('[STTService] Transcription error:', error);
      throw error;
    }
  }

  /**
   * Start streaming transcription
   * @param {string} sessionId - Unique session identifier
   * @param {string} languageCode - Language code
   * @param {object} options - Streaming options
   * @returns {object} Stream control object
   */
  startStreamingRecognition(sessionId, languageCode = 'en', options = {}) {
    try {
      if (!this.initialized) {
        throw new Error('STTService not initialized');
      }

      const languageCodeFull = this.languageConfigs[languageCode] || 'en-US';

      // Create streaming recognition request
      const request = {
        config: {
          encoding: options.encoding || 'LINEAR16',
          sampleRateHertz: options.sampleRateHertz || 16000,
          languageCode: languageCodeFull,
          enableAutomaticPunctuation: true,
          model: options.model || 'default',
          useEnhanced: true,
          interimResults: options.interimResults !== false, // Enable by default
          singleUtterance: options.singleUtterance || false,
          maxAlternatives: 1
        },
        interimResults: options.interimResults !== false
      };

      // Create recognize stream
      const recognizeStream = this.client
        .streamingRecognize(request)
        .on('error', (error) => {
          logger.error('[STTService] Streaming error:', error);
          if (options.onError) {
            options.onError(error);
          }
        })
        .on('data', (data) => {
          if (data.results && data.results.length > 0) {
            const result = data.results[0];
            const alternative = result.alternatives[0];

            const transcriptData = {
              transcript: alternative.transcript,
              confidence: alternative.confidence || 0,
              isFinal: result.isFinal,
              stability: result.stability || 0,
              languageCode: languageCodeFull
            };

            if (options.onData) {
              options.onData(transcriptData);
            }

            // Log final results
            if (result.isFinal) {
              logger.info('[STTService] Final transcript', {
                sessionId,
                transcript: alternative.transcript,
                confidence: alternative.confidence
              });
            }
          }
        });

      // Store session
      this.streamingSessions.set(sessionId, {
        stream: recognizeStream,
        languageCode: languageCodeFull,
        startTime: Date.now(),
        bytesProcessed: 0
      });

      logger.info('[STTService] Streaming session started', {
        sessionId,
        languageCode: languageCodeFull
      });

      return {
        sessionId,
        write: (audioChunk) => {
          const session = this.streamingSessions.get(sessionId);
          if (session) {
            recognizeStream.write(audioChunk);
            session.bytesProcessed += audioChunk.length;
          }
        },
        end: () => {
          this.endStreamingRecognition(sessionId);
        }
      };

    } catch (error) {
      logger.error('[STTService] Failed to start streaming:', error);
      throw error;
    }
  }

  /**
   * End streaming transcription session
   */
  endStreamingRecognition(sessionId) {
    const session = this.streamingSessions.get(sessionId);

    if (session) {
      try {
        session.stream.end();

        const duration = Date.now() - session.startTime;
        logger.info('[STTService] Streaming session ended', {
          sessionId,
          duration,
          bytesProcessed: session.bytesProcessed
        });

        this.streamingSessions.delete(sessionId);
      } catch (error) {
        logger.error('[STTService] Error ending stream:', error);
      }
    }
  }

  /**
   * Prepare audio for transcription
   * Detect format and extract sample rate from audio buffer
   */
  async prepareAudio(audioBuffer, encoding) {
    // Try to detect format from buffer first
    const formatInfo = this.detectAudioFormat(audioBuffer);

    // If encoding is specified, use it but with detected sample rate
    if (encoding) {
      // Determine sample rate based on encoding
      let sampleRateHertz = formatInfo.sampleRate || 16000;

      if (encoding === 'WEBM_OPUS' || encoding.includes('opus')) {
        sampleRateHertz = formatInfo.sampleRate || 48000; // WebM Opus typically 48kHz
      } else if (encoding === 'OGG_OPUS') {
        sampleRateHertz = formatInfo.sampleRate || 48000; // Ogg Opus also 48kHz
      } else if (formatInfo.format === 'WAV') {
        // WAV format detected - use sample rate from header
        sampleRateHertz = formatInfo.sampleRate;
      }

      return {
        audio: audioBuffer,
        encoding: formatInfo.encoding || encoding,
        sampleRateHertz: sampleRateHertz
      };
    }

    // No encoding specified, use detected format
    return {
      audio: audioBuffer,
      encoding: formatInfo.encoding,
      sampleRateHertz: formatInfo.sampleRate
    };
  }

  /**
   * Detect audio format and extract sample rate from buffer
   */
  detectAudioFormat(audioBuffer) {
    // WebM Opus signature: 0x1A 0x45 0xDF 0xA3
    const isWebM = audioBuffer[0] === 0x1A &&
                   audioBuffer[1] === 0x45 &&
                   audioBuffer[2] === 0xDF &&
                   audioBuffer[3] === 0xA3;

    if (isWebM) {
      return {
        format: 'WEBM',
        encoding: 'WEBM_OPUS',
        sampleRate: 48000 // WebM Opus standard
      };
    }

    // WAV signature: 'RIFF' at 0, 'WAVE' at 8
    const isWAV = audioBuffer[0] === 0x52 && // 'R'
                  audioBuffer[1] === 0x49 && // 'I'
                  audioBuffer[2] === 0x46 && // 'F'
                  audioBuffer[3] === 0x46 && // 'F'
                  audioBuffer[8] === 0x57 && // 'W'
                  audioBuffer[9] === 0x41 && // 'A'
                  audioBuffer[10] === 0x56 && // 'V'
                  audioBuffer[11] === 0x45;  // 'E'

    if (isWAV && audioBuffer.length > 28) {
      // Extract sample rate from WAV header (bytes 24-27, little-endian)
      const sampleRate = audioBuffer[24] |
                        (audioBuffer[25] << 8) |
                        (audioBuffer[26] << 16) |
                        (audioBuffer[27] << 24);

      return {
        format: 'WAV',
        encoding: 'LINEAR16',
        sampleRate: sampleRate
      };
    }

    // Default: assume LINEAR16 PCM at 16kHz
    return {
      format: 'PCM',
      encoding: 'LINEAR16',
      sampleRate: 16000
    };
  }

  /**
   * Get alternative language codes for better accuracy
   */
  getAlternativeLanguages(primaryLanguage) {
    // For Indian languages, add English as alternative
    const alternatives = [];

    if (primaryLanguage !== 'en') {
      alternatives.push('en-US');
    }

    return alternatives;
  }

  /**
   * Decode Opus to PCM (if needed)
   * This is a placeholder - actual implementation would use ffmpeg or opus-decoder
   */
  async decodeOpusToPCM(opusBuffer, targetSampleRate = 16000) {
    // TODO: Implement Opus decoding
    // Options:
    // 1. Use @discordjs/opus or node-opus package
    // 2. Use ffmpeg via child_process
    // 3. Use WebAssembly Opus decoder

    logger.warn('[STTService] Opus decoding not implemented, returning original buffer');
    return opusBuffer;
  }

  /**
   * Get active streaming sessions count
   */
  getActiveSessionsCount() {
    return this.streamingSessions.size;
  }

  /**
   * Cleanup all sessions
   */
  async cleanup() {
    for (const [sessionId] of this.streamingSessions) {
      this.endStreamingRecognition(sessionId);
    }

    logger.info('[STTService] Cleanup completed');
  }
}

module.exports = STTService;
