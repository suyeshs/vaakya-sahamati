const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

const config = {
  // Google Cloud Configuration
  googleCloud: {
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  },

  // Firebase Configuration
  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID,
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
  },

  // Cloud SQL Configuration
  database: {
    connectionName: process.env.CLOUD_SQL_CONNECTION_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  },

  // Vertex AI Configuration
  vertexAI: {
    location: process.env.VERTEX_AI_LOCATION || 'us-central1',
    model: process.env.VERTEX_AI_MODEL || 'gemini-2.5-flash-lite', // Fastest Flash model for text
  },

  // Vertex AI Live API Configuration (for bidirectional audio streaming)
  vertexAILive: {
    location: process.env.VERTEX_AI_LOCATION || 'us-central1',
    model: process.env.VERTEX_AI_LIVE_MODEL || 'gemini-2.0-flash-live-preview-04-09',
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.PROJECT_ID || 'sahamati-labs',
    // Automatic Activity Detection settings
    automaticActivityDetection: {
      enabled: process.env.VERTEX_AI_VAD_ENABLED !== 'false', // Default: true
      voiceActivityTimeout: parseFloat(process.env.VERTEX_AI_VAD_TIMEOUT) || 0.6, // seconds (reduced for snappier responses)
    },
    // Audio settings
    audio: {
      voiceName: process.env.VERTEX_AI_VOICE_NAME || 'Kore', // Kore: Female, warm, natural voice
      responseModalities: ['AUDIO'], // Native AUDIO mode - fast, natural voice
    },
    // Generation settings
    generation: {
      temperature: parseFloat(process.env.VERTEX_AI_TEMPERATURE) || 0.7,
      maxOutputTokens: parseInt(process.env.VERTEX_AI_MAX_TOKENS) || 2048,
    },
    // Session timeout settings
    sessionTimeout: {
      durationWarning: parseInt(process.env.SESSION_DURATION_WARNING) || 120, // 2 minutes - warn user after this duration
      warningTimeout: parseInt(process.env.SESSION_WARNING_TIMEOUT) || 60, // 1 minute - wait after warning
      inactivityTimeout: parseInt(process.env.INACTIVITY_TIMEOUT) || 60, // 1 minute - close if no activity
      checkInterval: 15, // 15 seconds - how often to check timeouts
    },
  },

  // Gemini Live API Configuration
  geminiLive: {
    model: process.env.GEMINI_LIVE_MODEL || 'gemini-2.5-flash-native-audio-preview-09-2025',
    apiKey: process.env.GOOGLE_API_KEY,
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    supportsAudioOutput: true,
    supportsRealTime: true,
    maxOutputTokens: 2048,
    temperature: 0.8,
    topP: 0.95,
    topK: 40,
  },

  // Application Configuration
  app: {
    nodeEnv: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 8080,
    logLevel: process.env.LOG_LEVEL || 'info',
  },

  // Security Configuration
  security: {
    jwtSecret: process.env.JWT_SECRET,
    apiRateLimit: parseInt(process.env.API_RATE_LIMIT) || 100,
  },
};

// Validate required configuration (only for essential services)
// Skip validation if we're in a service that will use environment variables
const requiredConfig = [
  'geminiLive.apiKey',
];

// Only validate if we're not in a service context (where env vars will be used)
if (process.env.NODE_ENV !== 'production' || !process.env.GOOGLE_API_KEY) {
  for (const configPath of requiredConfig) {
    const keys = configPath.split('.');
    let value = config;
    for (const key of keys) {
      value = value[key];
    }
    if (!value) {
      console.warn(`Missing required configuration: ${configPath} - will use environment variables if available`);
    }
  }
}

module.exports = config;