# Opik Analytics Integration

This document describes the Opik analytics integration in the Samvad Voice AI application.

## Overview

Opik is an open-source LLM evaluation and tracing service that provides:
- **Conversation tracing**: Track all user-AI exchanges
- **Automated evaluation**: Measure conversation quality with multiple metrics
- **User feedback collection**: Gather ratings and comments
- **Conversation analysis**: Evaluate coherence and detect user frustration

## Architecture

```
┌─────────────────┐
│  Samvad Client  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌──────────────┐
│ Samvad Backend  │────▶│ Opik Service │
│   (Bun/Node)    │     │  (FastAPI)   │
└─────────────────┘     └──────┬───────┘
                                │
                                ▼
                        ┌───────────────┐
                        │ Redis Storage │
                        └───────────────┘
```

## Components

### 1. OpikClient (`src/services/OpikClient.js`)

HTTP client for communicating with the Opik service.

**Methods**:
- `logTrace(input, output, metadata)` - Log conversation exchanges
- `evaluateResponse(input, output, criteria)` - Evaluate single responses
- `evaluateConversation(threadId, conversation, type)` - Evaluate full conversations
- `logFeedback(traceId, rating, comment, category)` - Log user feedback
- `getTraces(limit, offset)` - Retrieve traces with pagination
- `getEvaluations(limit, offset)` - Retrieve evaluations
- `getStorageStats()` - Get storage statistics

### 2. VertexAILiveService Integration

Automatic conversation tracking integrated into the live audio service.

**Features**:
- Captures user input and AI responses
- Logs traces after each conversational turn
- Evaluates conversation coherence on session close
- Non-blocking async logging (errors don't affect user experience)

**Tracking Logic**:
```javascript
// On turn complete
if (session.currentUserInput && session.currentAIOutput) {
  await this.logToOpik(session);
}

// On session close
if (session.conversation.length > 0) {
  await OpikClient.evaluateConversation(
    sessionId,
    session.conversation,
    'conversation_coherence'
  );
}
```

### 3. Analytics API Endpoints

HTTP endpoints for accessing analytics data.

**Endpoints**:
- `GET /api/analytics/traces?limit=100&offset=0` - Get conversation traces
- `GET /api/analytics/evaluations?limit=100&offset=0` - Get evaluations
- `GET /api/analytics/stats` - Get storage statistics
- `POST /api/analytics/feedback` - Log user feedback

**Example Response** (`/api/analytics/traces`):
```json
{
  "traces": [
    {
      "id": "trace_20250130_120530_123456",
      "timestamp": "2025-01-30T12:05:30.123Z",
      "input": {
        "text": "नमस्ते, मुझे होम लोन चाहिए",
        "language": "hi"
      },
      "output": {
        "text": "नमस्ते! होम लोन के लिए मैं आपकी मदद कर सकती हूं।",
        "language": "hi"
      },
      "metadata": {
        "sessionId": "session_abc123",
        "language": "hi",
        "turnNumber": 1
      }
    }
  ],
  "total": 150,
  "limit": 100,
  "offset": 0
}
```

## Configuration

### Environment Variables

```bash
# Opik Service Configuration
OPIK_SERVICE_URL=https://opik-service-334610188311.us-central1.run.app

# Optional: API Key for authentication (if Opik service requires it)
OPIK_API_KEY=your-opik-api-key-here
```

### Self-Hosted Configuration Options

Since this is a self-hosted Opik service, you have two configuration options:

#### Option 1: Run Without Authentication (Simpler)
For a trusted environment where both services are self-hosted:

1. **Backend Configuration**: No API key needed
   ```bash
   # .env
   OPIK_SERVICE_URL=https://opik-service-334610188311.us-central1.run.app
   # OPIK_API_KEY not set - will run without auth
   ```

2. **Opik Service Modification**: Remove the `Depends(verify_api_key)` from endpoints in `main.py`
   ```python
   # Change from:
   @app.post("/traces")
   async def create_trace(request: TraceRequest, api_key: str = Depends(verify_api_key)):

   # To:
   @app.post("/traces")
   async def create_trace(request: TraceRequest):
   ```

#### Option 2: Use Shared API Key (More Secure)
For environments requiring authentication:

1. **Generate a shared secret**:
   ```bash
   # Example API key
   SHARED_SECRET="my-secure-random-key-12345"
   ```

2. **Configure both services** with the same key:
   ```bash
   # Backend .env
   OPIK_SERVICE_URL=https://opik-service-334610188311.us-central1.run.app
   OPIK_API_KEY=my-secure-random-key-12345

   # Opik service .env
   OPIK_API_KEY=my-secure-random-key-12345
   ```

### Enable/Disable

Opik is enabled as long as `OPIK_SERVICE_URL` is configured. The service works with or without API key authentication.

```javascript
// Check if enabled
if (OpikClient.isEnabled()) {
  await OpikClient.logTrace(input, output, metadata);
}
```

## Evaluation Metrics

### Trace-Level Metrics

Evaluated on each user-AI exchange:

1. **Hallucination Detection** (0-1 score)
   - Detects fabricated information
   - Checks for unsupported claims
   - Lower score = more hallucination

2. **Content Moderation** (0-1 score)
   - Detects offensive/harmful content
   - Checks hate speech, violence, harassment
   - Higher score = safer content

3. **Answer Relevance** (0-1 score)
   - Measures relevance to user query
   - Checks topic consistency
   - Higher score = more relevant

4. **Accuracy** (0-1 score)
   - Evaluates factual consistency
   - Checks logical reasoning
   - Higher score = more accurate

5. **Helpfulness** (0-1 score)
   - Measures actionable guidance
   - Checks explanation quality
   - Higher score = more helpful

### Conversation-Level Metrics

Evaluated on session close:

1. **Conversation Coherence** (0-1 score)
   - Topic consistency across turns
   - Context continuity
   - Response relevance
   - Higher score = better coherence

2. **User Frustration** (0-1 score)
   - Detects frustration indicators
   - Monitors repetition patterns
   - Tracks escalation
   - Lower score = less frustration

## Usage Examples

### 1. Access Traces via API

```bash
# Get recent traces
curl https://samvad-api-bun-def3r7eewq-uc.a.run.app/api/analytics/traces?limit=10

# Get evaluations
curl https://samvad-api-bun-def3r7eewq-uc.a.run.app/api/analytics/evaluations

# Get statistics
curl https://samvad-api-bun-def3r7eewq-uc.a.run.app/api/analytics/stats
```

### 2. Log User Feedback

```bash
curl -X POST https://samvad-api-bun-def3r7eewq-uc.a.run.app/api/analytics/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "traceId": "trace_20250130_120530_123456",
    "rating": 5,
    "comment": "Very helpful response",
    "category": "helpful"
  }'
```

### 3. Manual Trace Logging (from code)

```javascript
const OpikClient = require('./src/services/OpikClient.js').default;

// Log a trace
const traceId = await OpikClient.logTrace(
  { text: 'User question', language: 'en' },
  { text: 'AI response', language: 'en' },
  { sessionId: 'session_123', customData: 'value' }
);

// Evaluate conversation
const result = await OpikClient.evaluateConversation(
  'session_123',
  [
    { role: 'user', content: 'Hello' },
    { role: 'assistant', content: 'Hi! How can I help?' }
  ],
  'conversation_coherence'
);
```

## Data Storage

- **Storage**: Redis with 30-day retention
- **Fallback**: In-memory storage if Redis unavailable
- **Auto-cleanup**: Old traces automatically expire

## Monitoring

### Health Check

```bash
curl https://opik-service-334610188311.us-central1.run.app/health
```

### Dashboard

Visit the Opik dashboard:
```
https://opik-service-334610188311.us-central1.run.app/dashboard
```

## Performance Considerations

1. **Non-blocking**: All logging is async and doesn't block user interactions
2. **Error handling**: Failures are logged but don't affect conversation flow
3. **Efficient**: Minimal overhead (~5-10ms per trace log)
4. **Scalable**: Redis backend supports high throughput

## Security

- **API Key**: Required for all Opik service calls
- **CORS**: Properly configured for frontend access
- **Data Privacy**: Traces contain conversation text - ensure compliance with privacy policies

## Troubleshooting

### Analytics not working

1. Check if OPIK_API_KEY is set:
   ```bash
   echo $OPIK_API_KEY
   ```

2. Verify Opik service is running:
   ```bash
   curl https://opik-service-334610188311.us-central1.run.app/health
   ```

3. Check logs for errors:
   ```bash
   # Backend logs
   grep -i "opik" logs/samvad-backend.log
   ```

### No traces appearing

1. Verify conversation tracking is enabled
2. Check that text responses are being generated (not just audio)
3. Look for Opik error messages in logs

## Future Enhancements

- [ ] Real-time analytics dashboard
- [ ] Custom evaluation metrics
- [ ] A/B testing support
- [ ] Automated alerts for low-quality conversations
- [ ] Export to data warehouse (BigQuery)
