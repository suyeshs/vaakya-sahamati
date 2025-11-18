# Firestore Migration - Setup Guide

## Overview

The Knowledge Base Service has been migrated from JSON file storage to **Google Cloud Firestore** for better scalability, performance, and concurrent access.

## What Changed

### Before (JSON-based)
- Stored all documents in `data/knowledge/index.json`
- Loaded entire file into memory on startup
- Rewrote entire file on every update
- Limited scalability (~500-1000 documents max)
- No concurrent write support

### After (Firestore-based)
- Documents stored in Firestore collection: `knowledge_base`
- Distributed, scalable database
- Automatic indexing and querying
- Supports millions of documents
- Built-in concurrency and ACID transactions

## Setup Instructions

### 1. Enable Firestore in Google Cloud

```bash
# Set your project ID
gcloud config set project YOUR_PROJECT_ID

# Enable Firestore API
gcloud services enable firestore.googleapis.com

# Create Firestore database (choose your region)
gcloud firestore databases create \
  --location=us-central1 \
  --type=firestore-native
```

### 2. Set Up Service Account (for local development)

```bash
# Create service account
gcloud iam service-accounts create samvad-backend \
  --display-name="Samvad Backend Service Account"

# Grant Firestore permissions
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:samvad-backend@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.user"

# Create and download key
gcloud iam service-accounts keys create ~/samvad-firestore-key.json \
  --iam-account=samvad-backend@YOUR_PROJECT_ID.iam.gserviceaccount.com
```

### 3. Configure Environment Variables

Create or update `.env` file in the backend-bun directory:

```bash
# Google Cloud Project
PROJECT_ID=your-project-id
LOCATION=us-central1

# Firestore Authentication (local development)
GOOGLE_APPLICATION_CREDENTIALS=~/samvad-firestore-key.json

# Or use Application Default Credentials (recommended for production)
# No GOOGLE_APPLICATION_CREDENTIALS needed if running on GCP
```

### 4. Test the Connection

```bash
cd /Users/stonepot-tech/samvad-gcp/backend-bun

# Start the server
bun run server.js
```

Look for this log message:
```
✅ Firebase Admin SDK initialized
[KnowledgeBase] Service initialized with Firestore
```

## API Endpoints (Unchanged)

All existing API endpoints work the same way:

### Add Text Document
```bash
curl -X POST http://localhost:8080/api/knowledge/add-text \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Home Loan Policy",
    "content": "Eligibility criteria for home loans...",
    "category": "loans",
    "tags": ["home-loan", "eligibility"]
  }'
```

### List All Documents
```bash
curl http://localhost:8080/api/knowledge/list
```

### Search Documents
```bash
curl -X POST http://localhost:8080/api/knowledge/search \
  -H "Content-Type: application/json" \
  -d '{
    "query": "home loan eligibility",
    "maxResults": 3
  }'
```

### Delete Document
```bash
curl -X DELETE http://localhost:8080/api/knowledge/text_1234567890
```

## Firestore Console

View your data in the Firebase Console:
```
https://console.firebase.google.com/project/YOUR_PROJECT_ID/firestore/data
```

Collection: `knowledge_base`

## Document Structure

Each document in Firestore has this structure:

```javascript
{
  id: "text_1731268800000",
  type: "text",  // text, url, pdf
  source: "manual_entry" | "url" | "filename.pdf",
  title: "Document Title",
  content: "Full text content...",
  category: "loans",  // loans, policies, faqs, document, general
  tags: ["home-loan", "eligibility"],
  addedAt: "2025-01-10T17:00:00.000Z",
  metadata: {
    contentLength: 1500,
    sourceType: "text",
    uploadedBy: "scraper-pod",
    ...
  }
}
```

## Scraper Integration

The scraper is already configured to upload to this knowledge base:

```bash
# From scraper
curl -X POST https://scraper-pod-worker.suyesh.workers.dev/scrape \
  -H "Content-Type: application/json" \
  -d '{"url":"https://example.com/loan-policy","immediate":true}'
```

This will:
1. Scrape the URL
2. Extract content
3. Transform to markdown
4. POST to `/api/knowledge/add-text`
5. Store in Firestore

## Indexing for Performance

Firestore automatically indexes single fields. For better search performance, create composite indexes:

```bash
# Create index on category + addedAt (for filtered queries)
gcloud firestore indexes composite create \
  --collection-group=knowledge_base \
  --query-scope=COLLECTION \
  --field-config field-path=category,order=ASCENDING \
  --field-config field-path=addedAt,order=DESCENDING
```

## Production Deployment (Cloud Run)

When deploying to Cloud Run, authentication is automatic:

```bash
cd /Users/stonepot-tech/samvad-gcp/backend-bun

gcloud run deploy samvad-api-bun \
  --source . \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID=your-project-id,LOCATION=us-central1
```

**Note**: Do NOT set `GOOGLE_APPLICATION_CREDENTIALS` in Cloud Run. It uses the service account automatically.

## Cost Estimation

Firestore pricing (as of 2025):
- **Reads**: $0.06 per 100,000 documents
- **Writes**: $0.18 per 100,000 documents
- **Deletes**: $0.02 per 100,000 documents
- **Storage**: $0.18 per GB/month

**Example for 10,000 documents/month**:
- 10,000 writes: $0.018
- 50,000 reads (searches): $0.030
- Storage (1GB): $0.18
- **Total**: ~$0.23/month

## Troubleshooting

### Error: "Permission denied on resource project"
**Solution**: Ensure service account has `roles/datastore.user` role

```bash
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:samvad-backend@YOUR_PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/datastore.user"
```

### Error: "Firebase app not initialized"
**Solution**: Check `GOOGLE_APPLICATION_CREDENTIALS` points to valid JSON key file

```bash
export GOOGLE_APPLICATION_CREDENTIALS=~/samvad-firestore-key.json
```

### Error: "Firestore API not enabled"
**Solution**: Enable the API

```bash
gcloud services enable firestore.googleapis.com
```

### Documents not appearing
**Solution**: Check Firestore console to verify collection name is `knowledge_base`

## Rollback (If Needed)

If you need to rollback to JSON-based storage:

1. Restore the old `KnowledgeBaseService.js` from git
2. Restart the server
3. Your existing `data/knowledge/index.json` will still work

```bash
git checkout HEAD~1 -- src/services/KnowledgeBaseService.js
bun run server.js
```

## Migration Complete ✅

Your Knowledge Base now uses Firestore for:
- ✅ Scalable document storage
- ✅ Fast concurrent access
- ✅ Automatic backups and replication
- ✅ Real-time queries
- ✅ Production-ready infrastructure

The scraper integration continues to work seamlessly with the new backend.
