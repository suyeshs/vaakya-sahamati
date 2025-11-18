# Opik Service - Gemini Live Integration

## Overview

The Opik analytics service has been refactored to support **Vertex AI Multimodal Live API (Gemini 2.5 Flash)** which uses native audio-to-audio streaming, eliminating the need for separate STT/TTS services.

## Architecture Changes

### Before (STT-TTS Pipeline)
```
Client Audio → STT Service → LLM → TTS Service → Client
              ↓           ↓         ↓
            Trace      Trace     Trace
```

### After (Gemini Live)
```
Client Audio → Vertex AI Live (Audio-to-Audio) → Client
                        ↓
                  Single Trace
                  (with audio tokens)
```

## New Data Models

### 1. GeminiLiveTraceData
Trace model for audio-to-audio conversations:
```python
{
    "session_id": "vertex-live-xxx",
    "user_id": "optional_user_id",
    "input": {
        "audio_input": "base64_encoded_pcm",
        "language": "hi",
        "turn_number": 1
    },
    "output": {
        "audio_output": "base64_encoded_pcm",
        "text": "optional_transcription",
        "language": "hi"
    },
    "metadata": {
        "latency": 450,
        "tokens": {
            "total": 150,
            "audioInput": 80,
            "audioOutput": 70
        },
        "function_calls": []
    }
}
```

### 2. FunctionCallTrace
Separate trace for function calls:
```python
{
    "session_id": "vertex-live-xxx",
    "function_name": "respond_to_financial_query",
    "function_args": {"query": "..."},
    "function_response": {"result": "..."},
    "timestamp": "2025-10-31T...",
    "latency_ms": 120
}
```

### 3. VoiceConversationEvaluation
Voice-specific evaluation criteria:
```python
{
    "session_id": "vertex-live-xxx",
    "conversation": [...],
    "criteria": [
        "conversation_flow",
        "response_latency",
        "language_consistency",
        "naturalness"
    ],
    "metadata": {
        "latencies": [450, 380, 520]
    }
}
```

## New API Endpoints

### Tracing

#### POST /traces/gemini-live
Log a Gemini Live audio-to-audio conversation turn.

**Request:**
```json
{
    "session_id": "vertex-live-abc123",
    "user_id": "user-456",
    "input": {
        "language": "hi",
        "turn_number": 1
    },
    "output": {
        "text": "नमस्ते! मैं आपकी मदद कैसे कर सकता हूं?",
        "language": "hi"
    },
    "metadata": {
        "latency": 450,
        "tokens": {
            "total": 150,
            "audioInput": 80,
            "audioOutput": 70
        }
    }
}
```

**Response:**
```json
{
    "success": true,
    "trace_id": "gemini_live_20251031_123456_789",
    "session_id": "vertex-live-abc123"
}
```

#### POST /traces/function-call
Log a function call from Gemini Live.

**Request:**
```json
{
    "session_id": "vertex-live-abc123",
    "function_name": "respond_to_financial_query",
    "function_args": {
        "query": "loan interest rate",
        "topic": "loans"
    },
    "function_response": {
        "result": "Personal loan interest rates..."
    },
    "timestamp": "2025-10-31T12:34:56.789Z",
    "latency_ms": 120
}
```

#### GET /traces/sessions/{session_id}
Get all traces for a specific session (ordered chronologically).

**Response:**
```json
{
    "session_id": "vertex-live-abc123",
    "traces": [
        {
            "id": "gemini_live_...",
            "timestamp": "...",
            "input": {...},
            "output": {...}
        }
    ],
    "total": 15
}
```

#### GET /traces/sessions/{session_id}/analytics
Get comprehensive analytics for a session.

**Response:**
```json
{
    "session_id": "vertex-live-abc123",
    "total_turns": 15,
    "function_calls": 3,
    "tokens": {
        "total": 2250,
        "audio_input": 1100,
        "audio_output": 1150
    },
    "latency": {
        "average_ms": 425.5,
        "min_ms": 320,
        "max_ms": 680
    },
    "duration": {
        "start": "2025-10-31T12:00:00Z",
        "end": "2025-10-31T12:15:30Z"
    }
}
```

#### GET /traces?workflow=gemini-live&session_id=xxx
Filter traces by workflow type and session.

**Query Parameters:**
- `workflow`: Filter by workflow type (`legacy`, `gemini-live`, `gemini-live-function`)
- `session_id`: Filter by session ID
- `limit`: Pagination limit (default: 100)
- `offset`: Pagination offset (default: 0)

### Evaluation

#### POST /evaluate-voice-conversation
Evaluate a voice conversation with voice-specific criteria.

**Request:**
```json
{
    "session_id": "vertex-live-abc123",
    "conversation": [
        {"role": "user", "content": "...", "language": "hi"},
        {"role": "assistant", "content": "...", "language": "hi"}
    ],
    "criteria": [
        "conversation_flow",
        "response_latency",
        "language_consistency",
        "naturalness"
    ],
    "metadata": {
        "latencies": [450, 380, 520, 410]
    }
}
```

**Response:**
```json
{
    "success": true,
    "evaluation_id": "voice_eval_20251031_...",
    "session_id": "vertex-live-abc123",
    "scores": {
        "conversation_flow": {
            "coherence": 0.85
        },
        "response_latency": {
            "score": 1.0,
            "avg_ms": 440
        },
        "language_consistency": {
            "score": 1.0,
            "languages": ["hi"],
            "changes": 0
        },
        "naturalness": {
            "score": 0.92
        }
    }
}
```

### Evaluation Criteria

1. **conversation_flow** - Measures coherence and topic consistency
2. **response_latency** - Evaluates response speed:
   - < 500ms = 1.0 (excellent)
   - 500-1000ms = 0.7 (good)
   - > 1000ms = 0.4 (poor)
3. **language_consistency** - Checks if language remains consistent
4. **naturalness** - Combines coherence and lack of frustration

## Backward Compatibility

The legacy `/traces` endpoint is preserved for backward compatibility. It now adds a `workflow: "legacy"` field to distinguish from Gemini Live traces.

## Integration with Backend

### From VertexAILiveService.js

Update the `logToOpik` function to use the new endpoint:

```javascript
async logToOpik(session) {
  try {
    if (!OpikClient || !OpikClient.isEnabled()) return;

    const traceId = await OpikClient.logGeminiLiveTrace({
      session_id: session.id,
      user_id: session.userId,
      input: {
        language: session.language,
        turn_number: Math.floor(session.conversation.length / 2)
      },
      output: {
        text: session.currentAIOutput,
        language: session.language
      },
      metadata: {
        latency: session.lastLatency,
        tokens: session.usageMetadata
      }
    });

    session.traceIds.push(traceId);
  } catch (error) {
    logger.error('[Opik] Failed to log trace:', error);
  }
}
```

### From OpikClient.js

Add new methods:

```javascript
class OpikClient {
  static async logGeminiLiveTrace(traceData) {
    const response = await fetch(`${OPIK_ENDPOINT}/traces/gemini-live`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPIK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(traceData)
    });

    const result = await response.json();
    return result.trace_id;
  }

  static async logFunctionCall(functionTrace) {
    const response = await fetch(`${OPIK_ENDPOINT}/traces/function-call`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPIK_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(functionTrace)
    });

    const result = await response.json();
    return result.trace_id;
  }

  static async getSessionAnalytics(sessionId) {
    const response = await fetch(
      `${OPIK_ENDPOINT}/traces/sessions/${sessionId}/analytics`,
      {
        headers: {
          'Authorization': `Bearer ${OPIK_API_KEY}`
        }
      }
    );

    return await response.json();
  }
}
```

## Key Metrics for Gemini Live

### Token Usage
- **audioInput**: Tokens consumed by input audio
- **audioOutput**: Tokens consumed by output audio
- **total**: Total tokens (audioInput + audioOutput + text)

### Latency
- Track end-to-end audio-to-audio latency
- Target: < 500ms for excellent UX
- Alert: > 1000ms indicates performance issues

### Function Calls
- Track frequency and latency of function calls
- Monitor function call success rates
- Identify most-used functions

### Language Consistency
- Detect unwanted language switches
- Track multilingual conversation quality
- Monitor auto-detect accuracy

## Dashboard Updates

The dashboard should now display:

1. **Session View**: View all turns in a session chronologically
2. **Audio Token Usage**: Chart showing audio token consumption
3. **Latency Distribution**: Histogram of response latencies
4. **Function Call Analytics**: Most frequently called functions
5. **Language Distribution**: Languages used across sessions

## Migration Notes

1. **No STT/TTS Metrics**: Previous STT/TTS-specific metrics (WER, TTS quality) are no longer applicable
2. **Session-Based**: All tracking is now session-based rather than per-request
3. **Audio Tokens**: Focus on audio token consumption rather than audio duration
4. **Native Quality**: Audio quality is handled by Vertex AI, no need to evaluate TTS quality

## Testing

Test the integration with:

```bash
# Log a Gemini Live trace
curl -X POST http://localhost:8000/traces/gemini-live \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test-session-123",
    "input": {"language": "en", "turn_number": 1},
    "output": {"text": "Hello!", "language": "en"},
    "metadata": {"latency": 450, "tokens": {"total": 100}}
  }'

# Get session analytics
curl -X GET http://localhost:8000/traces/sessions/test-session-123/analytics \
  -H "Authorization: Bearer YOUR_API_KEY"
```

## Summary

The refactored Opik service is now fully aligned with the Gemini Live audio-to-audio workflow, providing:

- ✅ Native audio token tracking
- ✅ Session-based analytics
- ✅ Function call tracing
- ✅ Voice-specific evaluation criteria
- ✅ Latency monitoring optimized for real-time audio
- ✅ Language consistency tracking
- ✅ Backward compatibility with legacy traces
