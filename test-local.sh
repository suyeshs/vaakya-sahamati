#!/bin/bash

# Set environment variables for local testing
export GOOGLE_API_KEY=AIzaSyBEVePQ537z-ZhQshl4PegISlyST87YMsE
export GEMINI_LIVE_MODEL=gemini-live-2.5-flash-preview-native-audio-09-2025
export PROJECT_ID=sahamati-labs
export LOCATION=us-central1
export NODE_ENV=development

echo "🚀 Starting Samvad API locally with environment variables..."
echo "GOOGLE_API_KEY: ${GOOGLE_API_KEY:0:10}..."
echo "GEMINI_LIVE_MODEL: $GEMINI_LIVE_MODEL"
echo "PROJECT_ID: $PROJECT_ID"
echo "LOCATION: $LOCATION"
echo ""

# Start the server
bun run server.js
