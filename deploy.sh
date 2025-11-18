#!/bin/bash

# Deploy Samvad API (Bun) with integrated Next.js client to Cloud Run

set -e

PROJECT_ID="sahamati-labs"
REGION="us-central1"
SERVICE_NAME="samvad-api-bun"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "🚀 Deploying Samvad API (Bun) + Next.js Client to Cloud Run"
echo "=========================================="

# Set project
echo "📋 Setting project to ${PROJECT_ID}..."
gcloud config set project ${PROJECT_ID}

# Build container with Cloud Build
echo "🏗️  Building container image with Bun + Next.js..."
gcloud builds submit --config ../cloudbuild.yaml ..

# Deploy to Cloud Run
echo "🚀 Deploying to Cloud Run with WebSocket support..."
gcloud run deploy ${SERVICE_NAME} \
  --image ${IMAGE_NAME} \
  --platform managed \
  --region ${REGION} \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --concurrency 80 \
  --min-instances 1 \
  --max-instances 10 \
  --session-affinity \
    --set-env-vars "PROJECT_ID=${PROJECT_ID},LOCATION=${REGION},NODE_ENV=production,GEMINI_LIVE_MODEL=gemini-live-2.5-flash-preview-native-audio-09-2025,GOOGLE_API_KEY=AIzaSyBEVePQ537z-ZhQshl4PegISlyST87YMsE,GOOGLE_CLOUD_PROJECT_ID=${PROJECT_ID},VERTEX_AI_LOCATION=${REGION},VERTEX_AI_MODEL=gemini-2.0-flash-lite,VERTEX_AI_LIVE_MODEL=gemini-2.0-flash-live-preview-04-09,VERTEX_AI_VOICE_NAME=Kore" \
  --port 8080

# Get service URL
SERVICE_URL=$(gcloud run services describe ${SERVICE_NAME} --platform managed --region ${REGION} --format 'value(status.url)')

echo ""
echo "✅ Deployment successful!"
echo "=========================================="
echo "🔗 Service URL: ${SERVICE_URL}"
echo ""
echo "📱 Test endpoints:"
echo "  Health:     ${SERVICE_URL}/health"
echo "  Status:     ${SERVICE_URL}/api/status"
echo "  WebSocket:  wss://${SERVICE_URL#https://}/api/gemini-live-stream"
echo ""
echo "🧪 Quick test:"
echo "  curl ${SERVICE_URL}/health"
echo ""


