# Opik Service Alignment Update

## Overview

The Samvad OpikClient has been updated to align with the latest Opik Python service (`/Users/stonepot-tech/bolkarmik/ekbachan/opik-python-service/main.py`).

## Key Changes in Updated Opik Service

### 1. Redis Storage Backend
- **Before**: In-memory only storage
- **After**: Redis-backed storage with in-memory fallback
- **Impact**: Persistent storage for traces, evaluations, and analytics

### 2. New Endpoints

#### Voice Conversation Evaluation
```
POST /evaluate-voice-conversation
```
Evaluates voice-first (Gemini Live) conversations with specific criteria:
- `conversation_flow` - Coherence and topic consistency
- `response_latency` - Average response time scoring
- `language_consistency` - Language switching detection
- `naturalness` - Combined coherence and frustration metrics

#### Session Traces
```
GET /traces/sessions/{session_id}
```
Retrieves all traces for a specific session in chronological order.

#### Online Evaluation Rules
```
POST /online-rules           # Create rule
GET /online-rules            # List all rules
PUT /online-rules/{rule_id}  # Update rule
DELETE /online-rules/{rule_id}  # Delete rule
```
Manage production monitoring rules with sampling rates and custom scoring.

### 3. Enhanced Analytics

#### Session Analytics (`/traces/sessions/{session_id}/analytics`)
Now returns:
```json
{
  "session_id": "session_123",
  "total_turns": 15,
  "function_calls": 3,
  "tokens": {
    "total": 1500,
    "audio_input": 800,
    "audio_output": 700
  },
  "latency": {
    "average_ms": 450,
    "min_ms": 200,
    "max_ms": 800
  },
  "duration": {
    "start": "2024-10-31T12:00:00Z",
    "end": "2024-10-31T12:15:00Z"
  }
}
```

### 4. Improved Evaluation Metrics

#### Hallucination Detection
Enhanced hallucination scoring with:
- Specificity indicators
- Temporal indicators (dates, "recently", etc.)
- Quantitative indicators (numbers, statistics)
- Authority indicators (citing sources)
- Length discrepancy detection
- Factual claim analysis

#### Moderation
Comprehensive offensive content detection:
- Hate speech and discrimination
- Violence and threats
- Harassment and abuse
- Sexual content
- Self-harm and suicide
- Illegal activities
- Aggressive language patterns

#### Answer Relevance
Improved relevance scoring with:
- Stop word filtering
- Word overlap calculation
- Frequency similarity
- Question-answer alignment
- Topic consistency checking

#### Accuracy & Helpfulness
Enhanced scoring for:
- Factual consistency
- Uncertainty handling
- Actionable content
- Resource provision
- Response completeness

## Updated OpikClient Methods

### ✅ Already Implemented (Previously)
```javascript
logTrace(input, output, metadata)
logGeminiLiveTrace(traceData)
logFunctionCall(functionTrace)
getSessionAnalytics(sessionId)
evaluateResponse(input, output, criteria)
evaluateConversation(threadId, conversation, evaluationType)
logFeedback(traceId, rating, comment, category)
getTraces(limit, offset)
getEvaluations(limit, offset)
getStorageStats()
```

### ✨ NEW Methods Added

#### 1. Voice Conversation Evaluation
```javascript
async evaluateVoiceConversation(
  sessionId,
  conversation,
  criteria = ['conversation_flow', 'response_latency', 'language_consistency', 'naturalness'],
  metadata = null
)
```

**Example Usage:**
```javascript
const result = await OpikClient.evaluateVoiceConversation(
  'session_123',
  [
    { role: 'user', content: 'मुझे लोन चाहिए', language: 'hi' },
    { role: 'assistant', content: 'Kitne paise ki zarurat hai?', language: 'hi' }
  ],
  ['conversation_flow', 'language_consistency'],
  { latencies: [450, 380, 520] }
);
```

#### 2. Get Session Traces
```javascript
async getSessionTraces(sessionId)
```

**Example Usage:**
```javascript
const traces = await OpikClient.getSessionTraces('session_123');
// Returns: { session_id, traces: [...], total }
```

#### 3. Online Rules Management

**Create Rule:**
```javascript
async createOnlineRule(rule)
```

**Example:**
```javascript
await OpikClient.createOnlineRule({
  name: 'Latency Monitor',
  sampling_rate: 0.1,  // 10% of traces
  model: 'gpt-4o-mini',
  prompt: 'Evaluate if response latency is acceptable',
  variable_mapping: { latency: 'metadata.latency' },
  score_definition: { latency_score: 'float' }
});
```

**Get All Rules:**
```javascript
async getOnlineRules()
```

**Update Rule:**
```javascript
async updateOnlineRule(ruleId, updates)
```

**Delete Rule:**
```javascript
async deleteOnlineRule(ruleId)
```

## Integration Examples

### Example 1: End-of-Session Evaluation

```javascript
// In VertexAILiveService.js - when session ends
async endSession(sessionId) {
  // ... session cleanup ...

  // Get all traces for the session
  const sessionData = await OpikClient.getSessionTraces(sessionId);

  // Evaluate the voice conversation
  const conversation = sessionData.traces.map(t => ({
    role: t.input ? 'user' : 'assistant',
    content: t.output?.text || '',
    language: t.metadata?.language
  }));

  const evaluation = await OpikClient.evaluateVoiceConversation(
    sessionId,
    conversation,
    ['conversation_flow', 'language_consistency', 'naturalness'],
    { latencies: sessionData.traces.map(t => t.metadata?.latency || 0) }
  );

  logger.info('[Session] Evaluation complete', {
    sessionId,
    scores: evaluation.scores
  });
}
```

### Example 2: Real-time Latency Monitoring

```javascript
// Create a rule to monitor response latency
await OpikClient.createOnlineRule({
  name: 'Voice Response Latency',
  sampling_rate: 1.0,  // Monitor 100% of traces
  model: 'gpt-4o-mini',
  prompt: 'Is the response latency under 1 second?',
  variable_mapping: {
    latency_ms: 'metadata.latency'
  },
  score_definition: {
    acceptable: 'boolean',
    score: 'float'
  }
});
```

### Example 3: Session Analytics Dashboard

```javascript
// API endpoint for analytics dashboard
app.get('/api/analytics/sessions/:sessionId', async (req, res) => {
  const { sessionId } = req.params;

  // Get comprehensive session analytics
  const analytics = await OpikClient.getSessionAnalytics(sessionId);
  const traces = await OpikClient.getSessionTraces(sessionId);

  // Build conversation for evaluation
  const conversation = traces.traces.map(t => ({
    role: t.workflow === 'gemini-live' ? 'assistant' : 'user',
    content: t.output?.text || t.input?.text || '',
    language: t.metadata?.language
  }));

  // Evaluate session quality
  const evaluation = await OpikClient.evaluateVoiceConversation(
    sessionId,
    conversation,
    ['conversation_flow', 'naturalness']
  );

  res.json({
    ...analytics,
    quality: evaluation.scores
  });
});
```

## Deployment Status

**Deployed to Staging:**
```
Service: samvad-api-bun-staging
URL: https://samvad-api-bun-staging-334610188311.us-central1.run.app
Revision: samvad-api-bun-staging-00015-rpz
Status: ✅ LIVE
```

**What's Deployed:**
- ✅ Updated OpikClient with all new methods
- ✅ Knowledge Base RAG service (backend APIs)
- ✅ Gemini Live with function calling
- ✅ Metadata tracking (tokens, latency)
- ❌ Knowledge Base UI (Next.js build issues - need to fix)

## Testing

### Test Voice Conversation Evaluation

```bash
curl -X POST https://samvad-api-bun-staging-334610188311.us-central1.run.app/api/test-opik-voice \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "test_session_123",
    "conversation": [
      {"role": "user", "content": "मुझे लोन चाहिए", "language": "hi"},
      {"role": "assistant", "content": "Kitne paise ki zarurat hai?", "language": "hi"}
    ]
  }'
```

### Test Session Analytics

```bash
# Have a conversation first, then:
curl https://samvad-api-bun-staging-334610188311.us-central1.run.app/api/analytics/stats
```

### Test Knowledge Base

```bash
# Add a document
curl -X POST https://samvad-api-bun-staging-334610188311.us-central1.run.app/api/knowledge/add-url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://sahamati.org.in/faq/",
    "category": "faqs"
  }'

# List documents
curl https://samvad-api-bun-staging-334610188311.us-central1.run.app/api/knowledge/list

# Have a conversation and ask "What is Sahamati?"
# The AI will automatically search the knowledge base
```

## Environment Variables

Make sure these are set in Cloud Run:

```bash
OPIK_SERVICE_URL=https://opik-service-334610188311.us-central1.run.app
OPIK_API_KEY=your_api_key_here  # Optional for self-hosted Opik
```

## Next Steps

1. **Fix Next.js Build** - Knowledge Base UI needs Next.js configuration fixes
2. **Create Online Rules** - Set up production monitoring rules
3. **Build Analytics Dashboard** - Visualize session analytics and evaluations
4. **Add Semantic Search** - Replace keyword search with Vertex AI embeddings
5. **PDF Support** - Add pdf-parse for actual PDF text extraction

## Summary

The OpikClient is now fully aligned with the updated Opik Python service. All new endpoints are integrated:

✅ Voice conversation evaluation
✅ Session traces retrieval
✅ Online evaluation rules management
✅ Enhanced analytics with token tracking
✅ Improved evaluation metrics (hallucination, moderation, relevance, accuracy, helpfulness)
✅ Redis-backed persistent storage

The backend is deployed and ready for testing!
