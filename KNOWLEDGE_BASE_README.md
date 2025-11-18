# Knowledge Base (RAG) Feature

## Overview

The Knowledge Base feature allows users to upload documents (URLs, PDFs, text) that Gemini Live AI can reference during conversations. This implements **Retrieval-Augmented Generation (RAG)** to provide accurate, context-specific answers based on your custom content.

## Architecture

### Components

1. **KnowledgeBaseService** (`src/services/KnowledgeBaseService.js`)
   - In-memory document storage with file persistence
   - Simple keyword-based search (not semantic embeddings)
   - Supports URLs, PDFs, and plain text
   - Persists to `data/knowledge/index.json`

2. **Function Calling Integration** (`src/services/SharedFunctionSchema.js`)
   - Added `search_knowledge_base` function declaration
   - Gemini AI can call this function when it needs information
   - Integrated with Vertex AI Live audio-to-audio conversations

3. **API Routes** (`server.js`)
   - POST `/api/knowledge/add-url` - Add document from URL
   - POST `/api/knowledge/add-text` - Add text document
   - POST `/api/knowledge/add-pdf` - Add PDF document
   - GET `/api/knowledge/list` - List all documents
   - GET `/api/knowledge/:id` - Get specific document
   - POST `/api/knowledge/search` - Search knowledge base
   - DELETE `/api/knowledge/:id` - Delete document
   - DELETE `/api/knowledge` - Clear all documents

4. **Knowledge Base Manager UI** (`client/app/knowledge/page.tsx`)
   - Next.js page at `/knowledge` route
   - Three tabs: Add Documents, Browse Documents, Search & Test
   - Accessible from chat page via "Knowledge Base" button

## How It Works

### 1. User Adds Content

**Example: Adding FAQ from Sahamati website**

```bash
# Via API
curl -X POST http://localhost:8080/api/knowledge/add-url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://sahamati.org.in/faq/",
    "category": "faqs",
    "tags": ["sahamati", "faq", "account-aggregator"]
  }'

# Via UI
# 1. Visit http://localhost:8080/knowledge
# 2. Go to "Add Documents" tab
# 3. Enter URL: https://sahamati.org.in/faq/
# 4. Select category and add tags
# 5. Click "Add URL"
```

### 2. AI Searches During Conversation

When a user asks: **"What is Sahamati?"**

1. Gemini detects it needs additional information
2. Gemini calls the `search_knowledge_base` function:
   ```javascript
   {
     "query": "Sahamati account aggregator",
     "category": "faqs"
   }
   ```
3. KnowledgeBaseService performs keyword search
4. Returns top 3 most relevant documents
5. Gemini incorporates the information in its response

### 3. Function Call Handler

In `VertexAILiveService.js`:

```javascript
if (name === 'search_knowledge_base') {
  const searchResults = knowledgeBaseService.search(query, {
    maxResults: 3,
    category: category
  });

  // Format and send results back to Gemini
  const formattedResults = searchResults.map((result, index) => {
    return `Document ${index + 1}: ${result.title}\n${result.content.substring(0, 500)}...`;
  }).join('\n\n');

  // Send to Gemini to formulate response
  session.ws.send(JSON.stringify({
    toolResponse: {
      functionResponses: [{
        id: id,
        name: name,
        response: { results: formattedResults, count: searchResults.length }
      }]
    }
  }));
}
```

## Usage Examples

### Add URL (Web Scraping)

```javascript
// Add Sahamati FAQ
await fetch('/api/knowledge/add-url', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    url: 'https://sahamati.org.in/faq/',
    title: 'Sahamati FAQs',
    category: 'faqs',
    tags: ['sahamati', 'account-aggregator', 'faq']
  })
});
```

### Add Text Document

```javascript
// Add loan policy
await fetch('/api/knowledge/add-text', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    title: 'Personal Loan Eligibility Criteria',
    content: `
      Personal Loan Requirements:
      - Minimum age: 21 years
      - Maximum age: 60 years
      - Minimum income: ₹25,000/month
      - Credit score: 750+
      - Employment: Salaried or Self-employed
      - Documents: ID proof, address proof, income proof
    `,
    category: 'loans',
    tags: ['personal-loan', 'eligibility', 'criteria']
  })
});
```

### Add PDF Document

```javascript
// Upload policy PDF
const fileInput = document.getElementById('pdf-input');
const file = fileInput.files[0];

const reader = new FileReader();
reader.onload = async (e) => {
  const base64 = e.target.result.split(',')[1];

  await fetch('/api/knowledge/add-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pdfContent: base64,
      filename: file.name,
      title: 'Loan Policy Document',
      category: 'policies',
      tags: ['loan', 'policy', 'terms']
    })
  });
};
reader.readAsDataURL(file);
```

### Search Knowledge Base

```javascript
// Test search
const response = await fetch('/api/knowledge/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    query: 'personal loan interest rate',
    category: 'loans', // optional
    maxResults: 5
  })
});

const data = await response.json();
console.log('Found:', data.resultCount, 'documents');
console.log('Results:', data.results);
```

### Delete Documents

```javascript
// Delete specific document
await fetch('/api/knowledge/doc-12345', { method: 'DELETE' });

// Clear all documents
await fetch('/api/knowledge', { method: 'DELETE' });
```

## Conversation Flow Example

**User**: "What are the eligibility criteria for a personal loan?"

**Gemini thinks**: "I should search the knowledge base for accurate information about personal loan eligibility"

**Gemini calls function**:
```json
{
  "name": "search_knowledge_base",
  "args": {
    "query": "personal loan eligibility criteria requirements",
    "category": "loans"
  }
}
```

**System returns**:
```
Document 1: Personal Loan Eligibility Criteria
Minimum age: 21 years, Maximum age: 60 years, Minimum income: ₹25,000/month...
```

**Gemini responds** (in user's language):
"Personal loan ke liye aapko 21 se 60 saal ke beech hona chahiye, aur aapki monthly income kam se kam 25,000 rupaye honi chahiye. Credit score 750 se zyada hona chahiye..."

## Search Algorithm

Currently uses **keyword-based search** (not semantic):

```javascript
search(query, options = {}) {
  const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

  const scored = documents.map(doc => {
    let score = 0;

    // Title match (highest weight)
    keywords.forEach(keyword => {
      if (doc.title.toLowerCase().includes(keyword)) score += 10;
    });

    // Content match
    keywords.forEach(keyword => {
      const matches = (doc.content.toLowerCase().match(new RegExp(keyword, 'g')) || []).length;
      score += matches * 0.5;
    });

    return { doc, score };
  });

  return scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults);
}
```

**Future Enhancement**: Replace with semantic embeddings using Vertex AI Text Embeddings API for better relevance.

## Data Storage

### File Structure

```
backend-bun/
  ├── data/
  │   └── knowledge/
  │       └── index.json    # All documents stored here
```

### Document Schema

```javascript
{
  "id": "doc_1730410000000_abc123",
  "title": "Document Title",
  "type": "url" | "pdf" | "text",
  "category": "loans",
  "tags": ["tag1", "tag2"],
  "content": "Full document content...",
  "sourceUrl": "https://example.com/page",  // if type=url
  "addedAt": "2024-10-31T12:00:00.000Z"
}
```

## System Prompt Integration

The AI is instructed when to search the knowledge base:

```
📚 KNOWLEDGE BASE SEARCH:
You have access to a knowledge base with uploaded documents containing detailed
information about specific products, policies, schemes, and regulations.

Use the search_knowledge_base function when:
• User asks about specific product details, interest rates, eligibility criteria
• You need more detailed or updated information than what you know
• User mentions a specific scheme, policy, or product name
• You want to provide accurate numbers, dates, or technical details

WHEN TO SEARCH:
✓ "What is the interest rate for personal loans?" → Search
✓ "Tell me about PM-KISAN scheme" → Search
✓ "What documents do I need for a home loan?" → Search

WHEN NOT TO SEARCH:
✗ General greetings or casual conversation
✗ Questions you can answer from your training
✗ Follow-up clarifications about information you just provided
```

## API Reference

### POST /api/knowledge/add-url

Add document from URL (web scraping)

**Request**:
```json
{
  "url": "https://example.com/page",
  "title": "Optional Title",
  "category": "general",
  "tags": ["tag1", "tag2"]
}
```

**Response**:
```json
{
  "success": true,
  "message": "Document added from URL successfully",
  "document": {
    "id": "doc_123",
    "title": "Page Title",
    "type": "url",
    "category": "general",
    "contentLength": 1234,
    "addedAt": "2024-10-31T12:00:00.000Z"
  }
}
```

### POST /api/knowledge/add-text

Add plain text document

**Request**:
```json
{
  "title": "Document Title",
  "content": "Document content...",
  "category": "general",
  "tags": ["tag1"]
}
```

### POST /api/knowledge/add-pdf

Add PDF document (base64 encoded)

**Request**:
```json
{
  "pdfContent": "base64_encoded_pdf_data",
  "filename": "document.pdf",
  "title": "Optional Title",
  "category": "general",
  "tags": ["tag1"]
}
```

**Note**: PDF parsing currently uses placeholder implementation. Install `pdf-parse` package for actual PDF text extraction.

### GET /api/knowledge/list

List all documents

**Response**:
```json
{
  "success": true,
  "count": 5,
  "documents": [...]
}
```

### POST /api/knowledge/search

Search knowledge base

**Request**:
```json
{
  "query": "search terms",
  "category": "loans",  // optional
  "maxResults": 3
}
```

**Response**:
```json
{
  "success": true,
  "query": "search terms",
  "resultCount": 2,
  "results": [
    {
      "doc": { "id": "...", "title": "...", "content": "..." },
      "score": 15.5
    }
  ]
}
```

### DELETE /api/knowledge/:id

Delete specific document

**Response**:
```json
{
  "success": true,
  "message": "Document deleted successfully",
  "documentId": "doc_123"
}
```

### DELETE /api/knowledge

Clear all documents

**Response**:
```json
{
  "success": true,
  "message": "All documents cleared successfully"
}
```

## Testing

### Test URL Ingestion

```bash
# Add Sahamati FAQ
curl -X POST http://localhost:8080/api/knowledge/add-url \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://sahamati.org.in/faq/",
    "category": "faqs"
  }'
```

### Test Search

```bash
# Search for Sahamati info
curl -X POST http://localhost:8080/api/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Sahamati account aggregator",
    "maxResults": 3
  }'
```

### Test in Conversation

1. Add document via UI or API
2. Start voice conversation
3. Ask a question related to the document
4. Gemini should automatically search and reference the knowledge base

**Example**:
- Add: https://sahamati.org.in/faq/
- Ask: "What is Sahamati?"
- Gemini searches knowledge base and provides accurate answer from the FAQ

## Deployment URLs

### Staging
- **API**: https://samvad-api-bun-staging-334610188311.us-central1.run.app
- **Chat UI**: https://samvad-api-bun-staging-334610188311.us-central1.run.app/
- **Knowledge Base Manager**: https://samvad-api-bun-staging-334610188311.us-central1.run.app/knowledge

### Local Development
- **API**: http://localhost:8080
- **Chat UI**: http://localhost:8080/
- **Knowledge Base Manager**: http://localhost:8080/knowledge

## Future Enhancements

1. **Semantic Search**: Replace keyword search with Vertex AI Text Embeddings API
2. **PDF Parsing**: Integrate `pdf-parse` or Google Document AI
3. **Chunking**: Split large documents into smaller chunks for better retrieval
4. **Vector Database**: Use Firestore or Cloud SQL with pgvector for scalability
5. **Document Preview**: Show document preview in UI before adding
6. **Batch Upload**: Support uploading multiple documents at once
7. **Category Management**: Allow creating custom categories
8. **Access Control**: Add user-level document isolation for multi-tenancy
9. **Analytics**: Track which documents are being referenced most
10. **Auto-refresh**: Periodically re-scrape URLs to keep content updated

## Troubleshooting

### Documents not being found

1. Check if document was added successfully:
   ```bash
   curl http://localhost:8080/api/knowledge/list
   ```

2. Test search directly:
   ```bash
   curl -X POST http://localhost:8080/api/knowledge/search \
     -H "Content-Type: application/json" \
     -d '{"query": "your search terms"}'
   ```

3. Check logs to see if Gemini is calling the search function:
   ```bash
   # Look for "[VertexAILive] Knowledge base search requested"
   ```

### PDF upload fails

PDF parsing is currently a placeholder. To enable:
```bash
cd backend-bun
npm install pdf-parse
```

Then update `extractTextFromPdf()` in KnowledgeBaseService.js.

### Search returns no results

- Keyword search requires exact word matches
- Try more specific keywords
- Check document category matches search category filter
- Consider implementing semantic embeddings for better matching

## License

Part of Samvad Voice AI Assistant by Sahamati Labs.
