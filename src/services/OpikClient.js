/**
 * Opik Client - LLM Evaluation and Tracing Service
 * Integrates with the Opik analytics service for conversation monitoring
 */

import { logger } from '../utils/logger.js';

class OpikClient {
  constructor() {
    this.baseUrl = process.env.OPIK_SERVICE_URL || 'https://opik-service-334610188311.us-central1.run.app';
    this.apiKey = process.env.OPIK_API_KEY || null;
    // For self-hosted Opik, enable by default if URL is configured
    this.enabled = !!this.baseUrl;

    if (!this.apiKey) {
      logger.info('[Opik] Running without API key - suitable for self-hosted Opik without auth');
    }
    logger.info('[Opik] Client initialized', { baseUrl: this.baseUrl, authenticated: !!this.apiKey });
  }

  /**
   * Check if Opik is enabled
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Get headers for API requests
   */
  getHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    };

    // Only add Authorization header if API key is configured
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    return headers;
  }

  /**
   * Log a trace with input, output, and metadata (legacy endpoint)
   */
  async logTrace(input, output, metadata = {}) {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/traces`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          input,
          output,
          metadata: {
            ...metadata,
            timestamp: new Date().toISOString(),
            service: 'samvad-voice-ai',
            workflow: 'legacy'
          }
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('[Opik] Trace logged', { traceId: data.trace_id });
      return data.trace_id;
    } catch (error) {
      logger.error('[Opik] Failed to log trace:', error);
      return null;
    }
  }

  /**
   * Log a Gemini Live audio-to-audio conversation turn
   */
  async logGeminiLiveTrace(traceData) {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/traces/gemini-live`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(traceData)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      logger.info('[Opik] Gemini Live trace logged', {
        traceId: data.trace_id,
        sessionId: data.session_id
      });
      return data.trace_id;
    } catch (error) {
      logger.error('[Opik] Failed to log Gemini Live trace:', error);
      return null;
    }
  }

  /**
   * Log a function call from Gemini Live
   */
  async logFunctionCall(functionTrace) {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/traces/function-call`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(functionTrace)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('[Opik] Function call logged', { traceId: data.trace_id });
      return data.trace_id;
    } catch (error) {
      logger.error('[Opik] Failed to log function call:', error);
      return null;
    }
  }

  /**
   * Get session analytics
   */
  async getSessionAnalytics(sessionId) {
    if (!this.enabled) return null;

    try {
      const response = await fetch(
        `${this.baseUrl}/traces/sessions/${sessionId}/analytics`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('[Opik] Failed to get session analytics:', error);
      return null;
    }
  }

  /**
   * Evaluate a single response
   */
  async evaluateResponse(input, output, criteria = ['relevance', 'accuracy', 'helpfulness']) {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/evaluate`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          input,
          output,
          criteria,
          evaluator: 'llm-as-judge'
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('[Opik] Response evaluated', {
        evaluationId: data.evaluation_id,
        scores: data.scores
      });
      return data;
    } catch (error) {
      logger.error('[Opik] Failed to evaluate response:', error);
      return null;
    }
  }

  /**
   * Evaluate an entire conversation thread
   */
  async evaluateConversation(threadId, conversation, evaluationType = 'conversation_coherence') {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/evaluate-thread`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          thread_id: threadId,
          conversation,
          evaluation_type: evaluationType
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('[Opik] Conversation evaluated', {
        threadId,
        scores: data.scores
      });
      return data;
    } catch (error) {
      logger.error('[Opik] Failed to evaluate conversation:', error);
      return null;
    }
  }

  /**
   * Evaluate a voice conversation from Gemini Live session
   */
  async evaluateVoiceConversation(sessionId, conversation, criteria = ['conversation_flow', 'response_latency', 'language_consistency', 'naturalness'], metadata = null) {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/evaluate-voice-conversation`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          session_id: sessionId,
          conversation,
          criteria,
          metadata
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('[Opik] Voice conversation evaluated', {
        sessionId,
        scores: data.scores
      });
      return data;
    } catch (error) {
      logger.error('[Opik] Failed to evaluate voice conversation:', error);
      return null;
    }
  }

  /**
   * Get all traces for a specific session
   */
  async getSessionTraces(sessionId) {
    if (!this.enabled) return null;

    try {
      const response = await fetch(
        `${this.baseUrl}/traces/sessions/${sessionId}`,
        { headers: this.getHeaders() }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('[Opik] Failed to get session traces:', error);
      return null;
    }
  }

  /**
   * Create an online evaluation rule
   */
  async createOnlineRule(rule) {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/online-rules`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify(rule)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('[Opik] Online rule created', { ruleId: data.rule_id });
      return data;
    } catch (error) {
      logger.error('[Opik] Failed to create online rule:', error);
      return null;
    }
  }

  /**
   * Get all online evaluation rules
   */
  async getOnlineRules() {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/online-rules`, {
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('[Opik] Failed to get online rules:', error);
      return null;
    }
  }

  /**
   * Update an online evaluation rule
   */
  async updateOnlineRule(ruleId, updates) {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/online-rules/${ruleId}`, {
        method: 'PUT',
        headers: this.getHeaders(),
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('[Opik] Failed to update online rule:', error);
      return null;
    }
  }

  /**
   * Delete an online evaluation rule
   */
  async deleteOnlineRule(ruleId) {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/online-rules/${ruleId}`, {
        method: 'DELETE',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('[Opik] Failed to delete online rule:', error);
      return null;
    }
  }

  /**
   * Log user feedback
   */
  async logFeedback(traceId, rating, comment = null, category = null) {
    if (!this.enabled) return null;

    try {
      const response = await fetch(`${this.baseUrl}/feedback`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          trace_id: traceId,
          rating,
          comment,
          category
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      logger.info('[Opik] Feedback logged', { feedbackId: data.feedback_id });
      return data.feedback_id;
    } catch (error) {
      logger.error('[Opik] Failed to log feedback:', error);
      return null;
    }
  }

  /**
   * Get all traces
   */
  async getTraces(limit = 100, offset = 0) {
    if (!this.enabled) return null;

    try {
      const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};
      const response = await fetch(
        `${this.baseUrl}/traces?limit=${limit}&offset=${offset}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('[Opik] Failed to get traces:', error);
      return null;
    }
  }

  /**
   * Get all evaluations
   */
  async getEvaluations(limit = 100, offset = 0) {
    if (!this.enabled) return null;

    try {
      const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};
      const response = await fetch(
        `${this.baseUrl}/evaluations?limit=${limit}&offset=${offset}`,
        { headers }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('[Opik] Failed to get evaluations:', error);
      return null;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStats() {
    if (!this.enabled) return null;

    try {
      const headers = this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {};
      const response = await fetch(`${this.baseUrl}/storage/stats`, { headers });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      logger.error('[Opik] Failed to get storage stats:', error);
      return null;
    }
  }
}

// Export singleton instance
export default new OpikClient();
