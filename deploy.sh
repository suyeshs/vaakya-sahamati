#!/bin/bash

# Vaakya Sahamati API - Cloud Run Deployment Script

set -e

PROJECT_ID="sahamati-labs"
SERVICE_NAME="vaakya-sahamati-api"
REGION="us-central1"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Vaakya Sahamati API - Cloud Run Deployment"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}Project:${NC} $PROJECT_ID"
echo -e "${BLUE}Service:${NC} $SERVICE_NAME"
echo -e "${BLUE}Region:${NC} $REGION"
echo ""

# Set project
echo -e "${YELLOW}Setting GCP project...${NC}"
gcloud config set project $PROJECT_ID --quiet

# Enable required APIs
echo -e "${YELLOW}Enabling required APIs...${NC}"
gcloud services enable cloudbuild.googleapis.com run.googleapis.com containerregistry.googleapis.com --quiet

# Submit to Cloud Build
echo -e "${YELLOW}Submitting build to Cloud Build...${NC}"
gcloud builds submit \
  --config cloudbuild.yaml \
  --project $PROJECT_ID \
  --region $REGION

echo ""
echo -e "${GREEN}✅ Deployment complete!${NC}"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📍 Service Information"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --project $PROJECT_ID \
  --region $REGION \
  --format "value(status.url)" 2>/dev/null || echo "Deployment in progress...")

echo -e "${BLUE}Service URL:${NC} $SERVICE_URL"
echo ""
echo "Next steps:"
echo "1. Set environment variables:"
echo "   gcloud run services update $SERVICE_NAME \\"
echo "     --update-env-vars GOOGLE_API_KEY=YOUR_KEY \\"
echo "     --region $REGION"
echo ""
echo "2. Test the API: curl $SERVICE_URL"
echo "3. View logs: gcloud run logs tail $SERVICE_NAME --project=$PROJECT_ID"
echo "4. Test WebSocket: wscat -c ${SERVICE_URL/https/wss}/api/vertex-live-stream"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
