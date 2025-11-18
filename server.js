/**
 * Vaakya Voice Chat API - Powered by Bun
 * High-performance backend with native WebSocket support
 */

const GeminiLiveService = require('./src/services/GeminiLiveService');
const GeminiLiveWebSocketService = require('./src/services/GeminiLiveWebSocketService');
const ServiceFactory = require('./src/services/ServiceFactory');
const EnhancedGeminiLiveWebSocketHandler = require('./src/websocket/EnhancedGeminiLiveWebSocketHandler');
const VertexAILiveWebSocketHandler = require('./src/websocket/VertexAILiveWebSocketHandler');
const { logger } = require('./src/utils/logger');

const PORT = process.env.PORT || 8080;
const PROJECT_ID = process.env.PROJECT_ID || 'sahamati-labs';
const LOCATION = process.env.LOCATION || 'us-central1';

// Helper function to get content type for static files
function getContentType(filePath) {
  const ext = filePath.split('.').pop().toLowerCase();
  const contentTypes = {
    'html': 'text/html',
    'css': 'text/css',
    'js': 'application/javascript',
    'json': 'application/json',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject'
  };
  return contentTypes[ext] || 'application/octet-stream';
}

// Initialize services
let geminiLiveService = null;
let geminiLiveWebSocketService = null;
let enhancedWebSocketHandler = null;
let vertexAILiveHandler = null;
let advancedServices = null;

async function initGeminiLive() {
  // Check if API key is available
  if (!process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === 'REPLACE_WITH_ACTUAL_API_KEY') {
    console.warn('[Bun Server] GOOGLE_API_KEY not set, Gemini Live service will not be available');
    return null;
  }
  
  // Always create a new service instance to pick up environment changes
  geminiLiveService = new GeminiLiveService(process.env);
  await geminiLiveService.initialize();
  console.log('[Bun Server] Gemini Live Service initialized with model:', process.env.GEMINI_LIVE_MODEL);
  return geminiLiveService;
}

async function initGeminiLiveWebSocket() {
  if (!geminiLiveWebSocketService) {
    geminiLiveWebSocketService = new GeminiLiveWebSocketService(process.env);
    await geminiLiveWebSocketService.initialize();
    console.log('[Bun Server] Gemini Live WebSocket Service initialized');
  }
  return geminiLiveWebSocketService;
}

async function initAdvancedServices() {
  if (!advancedServices) {
    console.log('[Bun Server] Initializing advanced conversational AI services...');
    await ServiceFactory.getInstance(process.env);
    advancedServices = ServiceFactory.getServices();

    // Create enhanced WebSocket handler
    enhancedWebSocketHandler = new EnhancedGeminiLiveWebSocketHandler(advancedServices);
    await enhancedWebSocketHandler.initialize();

    console.log('[Bun Server] ✅ Advanced conversational AI services initialized');
  }
  return { handler: enhancedWebSocketHandler, services: advancedServices };
}

async function initVertexAILive() {
  if (!vertexAILiveHandler) {
    console.log('[Bun Server] Initializing Vertex AI Live WebSocket handler...');
    vertexAILiveHandler = new VertexAILiveWebSocketHandler();
    await vertexAILiveHandler.initialize();
    console.log('[Bun Server] ✅ Vertex AI Live handler initialized');
  }
  return vertexAILiveHandler;
}

// Bun native server with WebSocket support
const server = Bun.serve({
  port: PORT,
  
  // HTTP request handler
  async fetch(req, server) {
    const url = new URL(req.url);
    const path = url.pathname;
    
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // Serve static files from public directory (Next.js build output)
    // Handle API routes first (they take precedence)
    if (!path.startsWith('/api/')) {
      try {
        const filePath = path === '/' ? '/index.html' : path;
        const fullPath = `./public${filePath}`;

        console.log('[Static] Attempting to serve file:', { path, filePath, fullPath });

        // Check if file exists
        const file = Bun.file(fullPath);
        if (await file.exists()) {
          const contentType = getContentType(filePath);
          console.log('[Static] File found, serving:', { fullPath, contentType });
          return new Response(file, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': path.startsWith('/_next/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600'
            }
          });
        } else {
          console.log('[Static] File not found:', fullPath);
          // For non-API routes, serve index.html (SPA fallback)
          const indexFile = Bun.file('./public/index.html');
          if (await indexFile.exists() && !path.includes('.')) {
            console.log('[Static] Serving index.html for SPA route:', path);
            return new Response(indexFile, {
              headers: {
                'Content-Type': 'text/html',
                'Cache-Control': 'no-cache'
              }
            });
          }
        }
      } catch (error) {
        console.error('[Static] Error serving file:', error);
      }
    }
    
    // WebSocket upgrade for Gemini Live streaming
    if (path === '/api/gemini-live-stream') {
      // Check if this is a WebSocket upgrade request
      const upgradeHeader = req.headers.get('upgrade');
      if (upgradeHeader?.toLowerCase() === 'websocket') {
        console.log('[Bun Server] WebSocket upgrade requested');
        const upgraded = server.upgrade(req, {
          data: {
            path: path,
            endpoint: 'gemini-live',
            timestamp: Date.now()
          }
        });

        if (upgraded) {
          console.log('[Bun Server] WebSocket upgrade successful');
          return undefined; // Connection upgraded to WebSocket
        }
      }

      console.log('[Bun Server] WebSocket upgrade failed - upgrade header:', upgradeHeader);
      return new Response('WebSocket upgrade failed', {
        status: 426,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Upgrade': 'websocket',
          'Connection': 'Upgrade'
        }
      });
    }

    // WebSocket upgrade for Vertex AI Live (native audio streaming)
    if (path === '/api/vertex-ai-live') {
      const upgradeHeader = req.headers.get('upgrade');
      if (upgradeHeader?.toLowerCase() === 'websocket') {
        console.log('[Bun Server] Vertex AI Live WebSocket upgrade requested');
        const upgraded = server.upgrade(req, {
          data: {
            path: path,
            endpoint: 'vertex-ai-live',
            timestamp: Date.now()
          }
        });

        if (upgraded) {
          console.log('[Bun Server] Vertex AI Live WebSocket upgrade successful');
          return undefined;
        }
      }

      return new Response('Vertex AI Live WebSocket upgrade failed', {
        status: 426,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Upgrade': 'websocket',
          'Connection': 'Upgrade'
        }
      });
    }
    
    // Health check endpoint
    if (path === '/health') {
      return Response.json({
        status: 'healthy',
        runtime: 'bun',
        version: Bun.version,
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      }, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }


    // Debug endpoint to check environment variables
    if (path === '/debug') {
      return Response.json({
        hasGoogleApiKey: !!process.env.GOOGLE_API_KEY,
        googleApiKeyPrefix: process.env.GOOGLE_API_KEY ? process.env.GOOGLE_API_KEY.substring(0, 10) + '...' : 'undefined',
        geminiModel: process.env.GEMINI_LIVE_MODEL || 'undefined',
        allEnvKeys: Object.keys(process.env).filter(key => key.includes('GOOGLE') || key.includes('GEMINI'))
      }, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }
    
    // API status endpoint
    if (path === '/api/status') {
      return Response.json({
        message: 'Vaakya Voice Chat API - Powered by Bun ⚡',
        runtime: 'bun',
        version: Bun.version,
        timestamp: new Date().toISOString(),
        endpoints: [
          'GET /health - Health check',
          'GET /api/status - API status',
          'WS /api/gemini-live-stream - Gemini Live bidirectional audio streaming',
          'WS /api/vertex-ai-live - Vertex AI Live native audio (STT-TTS bypass, low latency)',
          'POST /api/stt-tts-pipeline - STT-TTS Pipeline with function calling',
          'POST /api/gemini-live-chat - Chat with Gemini 2.0 Live (streaming)',
          'POST /api/synthesize-speech - Convert text to speech using GCP TTS',
          'GET /api/analytics/traces - Get conversation traces (Opik)',
          'GET /api/analytics/evaluations - Get conversation evaluations (Opik)',
          'GET /api/analytics/stats - Get analytics statistics (Opik)',
          'POST /api/analytics/feedback - Log user feedback (Opik)',
          'POST /api/session/:userId/state - Save user session state',
          'GET /api/session/:userId/state - Get user session state',
          'GET /api/session/:userId/profile - Get user profile with conversation history',
          'POST /api/session/:userId/history - Append message to conversation history',
          'POST /api/session/create - Create or update active session',
          'GET /api/session/:sessionId - Get session data',
          'PUT /api/session/:sessionId/end - Mark session as ended',
          'DELETE /api/session/:sessionId - Clear specific session',
          'GET /api/session/user/:userId/active - Get active sessions for user',
          'POST /api/session/refresh - Clear all user data (refresh/reset)',
          'GET /api/session/stats - Get session statistics',
          'POST /api/knowledge/add-url - Add document from URL',
          'POST /api/knowledge/add-text - Add plain text document',
          'POST /api/knowledge/add-pdf - Add document from PDF',
          'GET /api/knowledge/list - List all documents',
          'GET /api/knowledge/:id - Get specific document',
          'DELETE /api/knowledge/:id - Delete document',
          'DELETE /api/knowledge - Clear all documents',
          'POST /api/knowledge/search - Search knowledge base',
        ],
      }, {
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Analytics routes (Opik integration)
    const OpikClient = require('./src/services/OpikClient.js').default;

    if (path === '/api/analytics/traces') {
      try {
        if (!OpikClient || !OpikClient.isEnabled()) {
          return Response.json({
            error: 'Analytics service not configured'
          }, {
            status: 503,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        const limit = parseInt(url.searchParams.get('limit')) || 100;
        const offset = parseInt(url.searchParams.get('offset')) || 0;

        const data = await OpikClient.getTraces(limit, offset);

        return Response.json(data || { error: 'Failed to fetch traces' }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Analytics] Error fetching traces:', error);
        return Response.json({
          error: 'Failed to fetch traces',
          message: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    if (path === '/api/analytics/evaluations') {
      try {
        if (!OpikClient || !OpikClient.isEnabled()) {
          return Response.json({
            error: 'Analytics service not configured'
          }, {
            status: 503,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        const limit = parseInt(url.searchParams.get('limit')) || 100;
        const offset = parseInt(url.searchParams.get('offset')) || 0;

        const data = await OpikClient.getEvaluations(limit, offset);

        return Response.json(data || { error: 'Failed to fetch evaluations' }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Analytics] Error fetching evaluations:', error);
        return Response.json({
          error: 'Failed to fetch evaluations',
          message: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    if (path === '/api/analytics/stats') {
      try {
        if (!OpikClient || !OpikClient.isEnabled()) {
          return Response.json({
            error: 'Analytics service not configured'
          }, {
            status: 503,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        const stats = await OpikClient.getStorageStats();

        return Response.json(stats || { error: 'Failed to fetch stats' }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Analytics] Error fetching stats:', error);
        return Response.json({
          error: 'Failed to fetch stats',
          message: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    if (path === '/api/analytics/feedback' && req.method === 'POST') {
      try {
        if (!OpikClient || !OpikClient.isEnabled()) {
          return Response.json({
            error: 'Analytics service not configured'
          }, {
            status: 503,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        const body = await req.json();
        const { traceId, rating, comment, category } = body;

        if (!traceId || rating === undefined) {
          return Response.json({
            error: 'Missing required fields: traceId and rating'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        const feedbackId = await OpikClient.logFeedback(
          traceId,
          rating,
          comment,
          category
        );

        return Response.json({
          success: true,
          feedbackId,
          message: 'Feedback logged successfully'
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Analytics] Error logging feedback:', error);
        return Response.json({
          error: 'Failed to log feedback',
          message: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // Session Management Routes
    const sessionPersistenceService = require('./src/services/SessionPersistenceService');

    // POST /api/session/:userId/state - Save user session state
    if (path.match(/^\/api\/session\/[^\/]+\/state$/) && req.method === 'POST') {
      try {
        const userId = path.split('/')[3];
        const state = await req.json();

        await sessionPersistenceService.saveUserState(userId, state);

        return Response.json({
          success: true,
          message: 'User state saved successfully',
          userId
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Session API] Save user state failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to save user state',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // GET /api/session/:userId/state - Get user session state
    if (path.match(/^\/api\/session\/[^\/]+\/state$/) && req.method === 'GET') {
      try {
        const userId = path.split('/')[3];
        const state = await sessionPersistenceService.getUserState(userId);

        if (!state) {
          return Response.json({
            success: false,
            error: 'User state not found'
          }, {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        return Response.json({
          success: true,
          userId,
          state
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Session API] Get user state failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to get user state',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // GET /api/session/:userId/profile - Get user profile with history
    if (path.match(/^\/api\/session\/[^\/]+\/profile$/) && req.method === 'GET') {
      try {
        const userId = path.split('/')[3];
        const profile = await sessionPersistenceService.getUserProfile(userId);

        return Response.json({
          success: true,
          userId,
          profile: {
            ...profile,
            historyLength: profile.conversationHistory?.length || 0
          }
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Session API] Get user profile failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to get user profile',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // POST /api/session/:userId/history - Append message to history
    if (path.match(/^\/api\/session\/[^\/]+\/history$/) && req.method === 'POST') {
      try {
        const userId = path.split('/')[3];
        const message = await req.json();

        if (!message.role || !message.content) {
          return Response.json({
            success: false,
            error: 'Missing required fields: role, content'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        await sessionPersistenceService.appendToUserHistory(userId, message);

        return Response.json({
          success: true,
          message: 'Message appended to history',
          userId
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Session API] Append to history failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to append message to history',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // POST /api/session/create - Create or update active session
    if (path === '/api/session/create' && req.method === 'POST') {
      try {
        const { sessionId, userId, ...sessionData } = await req.json();

        if (!sessionId || !userId) {
          return Response.json({
            success: false,
            error: 'Missing required fields: sessionId, userId'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        await sessionPersistenceService.saveSession(sessionId, {
          userId,
          ...sessionData
        });

        return Response.json({
          success: true,
          message: 'Session created/updated successfully',
          sessionId,
          userId
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Session API] Create session failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to create session',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // PUT /api/session/:sessionId/end - Mark session as ended
    if (path.match(/^\/api\/session\/[^\/]+\/end$/) && req.method === 'PUT') {
      try {
        const sessionId = path.split('/')[3];
        await sessionPersistenceService.endSession(sessionId);

        return Response.json({
          success: true,
          message: 'Session ended successfully',
          sessionId
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Session API] End session failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to end session',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // GET /api/session/user/:userId/active - Get active sessions for user
    if (path.match(/^\/api\/session\/user\/[^\/]+\/active$/) && req.method === 'GET') {
      try {
        const userId = path.split('/')[4];
        const sessions = await sessionPersistenceService.getUserActiveSessions(userId);

        return Response.json({
          success: true,
          userId,
          count: sessions.length,
          sessions
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Session API] Get active sessions failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to get active sessions',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // POST /api/session/refresh - Clear all user data (refresh/reset)
    if (path === '/api/session/refresh' && req.method === 'POST') {
      try {
        const { userId } = await req.json();

        if (!userId) {
          return Response.json({
            success: false,
            error: 'Missing required field: userId'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        const results = await sessionPersistenceService.clearUserData(userId);

        return Response.json({
          success: true,
          message: 'User data cleared successfully',
          userId,
          cleared: {
            userState: results.userState,
            userProfile: results.userProfile,
            sessions: results.sessions,
            interruptions: results.interruptions
          }
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Session API] Refresh failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to clear user data',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // GET /api/session/stats - Get session statistics
    if (path === '/api/session/stats' && req.method === 'GET') {
      try {
        const stats = await sessionPersistenceService.getStats();

        return Response.json({
          success: true,
          stats
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Session API] Get stats failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to get statistics',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // DELETE /api/session/:sessionId - Clear specific session
    if (path.match(/^\/api\/session\/[^\/]+$/) && req.method === 'DELETE' && path.split('/').length === 4) {
      try {
        const sessionId = path.split('/')[3];
        const results = await sessionPersistenceService.clearSession(sessionId);

        return Response.json({
          success: true,
          message: 'Session cleared successfully',
          sessionId,
          cleared: {
            session: results.session,
            interruptions: results.interruptions
          }
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Session API] Clear session failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to clear session',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // GET /api/session/:sessionId - Get session data
    if (path.match(/^\/api\/session\/[^\/]+$/) && req.method === 'GET' && path.split('/').length === 4 && !path.includes('/stats')) {
      try {
        const sessionId = path.split('/')[3];
        const session = await sessionPersistenceService.getSession(sessionId);

        if (!session) {
          return Response.json({
            success: false,
            error: 'Session not found'
          }, {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        return Response.json({
          success: true,
          session
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Session API] Get session failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to get session',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // Knowledge Base Routes
    const knowledgeBaseService = require('./src/services/KnowledgeBaseService');

    // POST /api/knowledge/add-url - Add document from URL
    if (path === '/api/knowledge/add-url' && req.method === 'POST') {
      try {
        const { url, title, category, tags } = await req.json();

        if (!url) {
          return Response.json({
            success: false,
            error: 'Missing required field: url'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        const metadata = { title, category, tags: tags || [] };
        const document = await knowledgeBaseService.addFromUrl(url, metadata);

        return Response.json({
          success: true,
          message: 'Document added from URL successfully',
          document: {
            id: document.id,
            title: document.title,
            type: document.type,
            category: document.category,
            contentLength: document.content.length,
            addedAt: document.addedAt
          }
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Knowledge API] Add URL failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to add document from URL',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // POST /api/knowledge/add-text - Add plain text document
    if (path === '/api/knowledge/add-text' && req.method === 'POST') {
      try {
        const { content, title, category, tags } = await req.json();

        if (!content || !title) {
          return Response.json({
            success: false,
            error: 'Missing required fields: content, title'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        const metadata = { category, tags: tags || [] };
        const document = await knowledgeBaseService.addText(content, title, metadata);

        return Response.json({
          success: true,
          message: 'Text document added successfully',
          document: {
            id: document.id,
            title: document.title,
            type: document.type,
            category: document.category,
            contentLength: document.content.length,
            addedAt: document.addedAt
          }
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Knowledge API] Add text failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to add text document',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // POST /api/knowledge/add-pdf - Add document from PDF
    if (path === '/api/knowledge/add-pdf' && req.method === 'POST') {
      try {
        const { pdfContent, filename, title, category, tags } = await req.json();

        if (!pdfContent || !filename) {
          return Response.json({
            success: false,
            error: 'Missing required fields: pdfContent (base64), filename'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        const metadata = { title, category, tags: tags || [] };
        const document = await knowledgeBaseService.addFromPdf(pdfContent, filename, metadata);

        return Response.json({
          success: true,
          message: 'PDF document added successfully',
          document: {
            id: document.id,
            title: document.title,
            type: document.type,
            category: document.category,
            contentLength: document.content.length,
            addedAt: document.addedAt
          }
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Knowledge API] Add PDF failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to add PDF document',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // GET /api/knowledge/list - List all documents
    if (path === '/api/knowledge/list' && req.method === 'GET') {
      try {
        const documents = await knowledgeBaseService.listAll();

        return Response.json({
          success: true,
          count: documents.length,
          documents
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Knowledge API] List failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to list documents',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // POST /api/knowledge/search - Search knowledge base
    if (path === '/api/knowledge/search' && req.method === 'POST') {
      try {
        const { query, maxResults, category } = await req.json();

        if (!query) {
          return Response.json({
            success: false,
            error: 'Missing required field: query'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        const results = await knowledgeBaseService.search(query, {
          maxResults: maxResults || 3,
          category
        });

        return Response.json({
          success: true,
          query,
          resultCount: results.length,
          results
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Knowledge API] Search failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to search knowledge base',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // DELETE /api/knowledge - Clear all documents
    if (path === '/api/knowledge' && req.method === 'DELETE') {
      try {
        await knowledgeBaseService.clearAll();

        return Response.json({
          success: true,
          message: 'All documents cleared successfully'
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Knowledge API] Clear all failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to clear documents',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // DELETE /api/knowledge/:id - Delete document by ID
    if (path.match(/^\/api\/knowledge\/[^\/]+$/) && req.method === 'DELETE') {
      try {
        const id = path.split('/')[3];
        const existed = await knowledgeBaseService.delete(id);

        if (!existed) {
          return Response.json({
            success: false,
            error: 'Document not found'
          }, {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        return Response.json({
          success: true,
          message: 'Document deleted successfully',
          documentId: id
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Knowledge API] Delete failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to delete document',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // GET /api/knowledge/:id - Get specific document by ID
    if (path.match(/^\/api\/knowledge\/[^\/]+$/) && req.method === 'GET') {
      try {
        const id = path.split('/')[3];
        const document = await knowledgeBaseService.getById(id);

        if (!document) {
          return Response.json({
            success: false,
            error: 'Document not found'
          }, {
            status: 404,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        return Response.json({
          success: true,
          document
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      } catch (error) {
        logger.error('[Knowledge API] Get by ID failed:', error);
        return Response.json({
          success: false,
          error: 'Failed to get document',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // Gemini Live text chat endpoint
    if (path === '/api/gemini-live-chat' && req.method === 'POST') {
      try {
        const body = await req.json();
        const { message, language, sessionId, userId } = body;
        
        if (!message || !language || !sessionId) {
          return Response.json({
            success: false,
            error: 'Missing required fields: message, language, sessionId'
          }, { 
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }
        
        const startTime = Date.now();
        const gemini = await initGeminiLive();
        
        // Create or get session
        let session = gemini.getSessionInfo(sessionId);
        if (!session) {
          session = await gemini.createSession({
            sessionId,
            language,
            systemInstruction: language === 'auto' 
              ? 'You are a helpful AI assistant with multilingual capabilities. AUTOMATICALLY DETECT the language the user speaks and ALWAYS respond in THE EXACT SAME LANGUAGE.'
              : 'You are a helpful AI assistant.',
            conversationContext: {}
          });
        }
        
        // Collect streaming response
        let fullResponse = '';
        let chunkCount = 0;
        
        for await (const chunk of gemini.processTextStream(sessionId, message)) {
          if (chunk.type === 'text') {
            fullResponse += chunk.data;
            chunkCount++;
          }
        }
        
        const totalTime = Date.now() - startTime;
        
        return Response.json({
          success: true,
          response: fullResponse,
          metadata: {
            provider: 'gemini-live',
            model: 'gemini-2.0-flash-exp',
            language: language,
            streaming: true,
            chunkCount,
            runtime: 'bun'
          },
          timing: {
            total: totalTime,
            averageChunkTime: chunkCount > 0 ? totalTime / chunkCount : 0
          },
          session: {
            id: sessionId,
            language: language
          },
          timestamp: new Date().toISOString()
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
        
      } catch (error) {
        console.error('[Gemini Live Chat] Error:', error);
        return Response.json({
          success: false,
          error: 'Gemini Live chat processing failed',
          details: error.message
        }, { 
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }
    
    // TTS endpoint
    if (path === '/api/synthesize-speech' && req.method === 'POST') {
      try {
        const body = await req.json();
        const { text, languageCode, voiceName } = body;
        
        if (!text || !languageCode) {
          return Response.json({
            success: false,
            error: 'Missing required fields: text, languageCode'
          }, { 
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }
        
        const MultiLanguageService = require('./src/services/MultiLanguageService');
        const multiLangService = MultiLanguageService.getInstance ? 
          await MultiLanguageService.getInstance() : 
          new MultiLanguageService();
        
        await multiLangService.initialize();
        
        const audioBuffer = await multiLangService.synthesizeWithGCP(
          text, 
          languageCode, 
          voiceName,
          { encoding: 'MP3', gender: 'FEMALE' }
        );
        
        // Convert Buffer to base64
        const audioBase64 = audioBuffer.toString('base64');
        
        return Response.json({
          success: true,
          audioContent: audioBase64,
          format: 'mp3',
          language: languageCode,
          voice: voiceName || 'auto',
          runtime: 'bun'
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
        
      } catch (error) {
        console.error('[TTS] Error:', error);
        return Response.json({
          success: false,
          error: 'Speech synthesis failed',
          details: error.message
        }, { 
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // Handle conversation issue endpoint
    if (path === '/api/handle-conversation-issue' && req.method === 'POST') {
      try {
        const { handler } = await initAdvancedServices();
        const body = await req.json();
        const { issue, sessionId, language } = body;

        if (!issue || !sessionId) {
          return Response.json({
            success: false,
            error: 'Missing required fields: issue, sessionId'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        // Get polyfill from PolyfillSelector
        const polyfill = await advancedServices.polyfillSelector.selectPolyfill(issue, {
          language: language || 'en'
        });

        return Response.json({
          success: true,
          polyfill: {
            audio: polyfill.audio ? polyfill.audio.toString('base64') : null,
            text: polyfill.text,
            source: polyfill.source,
            latency: polyfill.latency
          },
          issue: issue.type
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });

      } catch (error) {
        console.error('[Handle Conversation Issue] Error:', error);
        return Response.json({
          success: false,
          error: 'Failed to handle conversation issue',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // Handle interruption endpoint
    if (path === '/api/handle-interruption' && req.method === 'POST') {
      try {
        await initAdvancedServices();
        const body = await req.json();
        const { interruption, sessionId } = body;

        if (!interruption || !sessionId) {
          return Response.json({
            success: false,
            error: 'Missing required fields: interruption, sessionId'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        // Log interruption for analytics
        console.log('[Interruption Handling]', {
          sessionId,
          type: interruption.type,
          progress: interruption.timing?.progress
        });

        return Response.json({
          success: true,
          interruption: interruption.type,
          action: interruption.action,
          message: 'Interruption handled'
        }, {
          headers: { 'Access-Control-Allow-Origin': '*' }
        });

      } catch (error) {
        console.error('[Handle Interruption] Error:', error);
        return Response.json({
          success: false,
          error: 'Failed to handle interruption',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // STT-TTS Pipeline endpoint
    if (path === '/api/stt-tts-pipeline' && req.method === 'POST') {
      try {
        const { handler, services } = await initAdvancedServices();
        const body = await req.json();
        const { audio, language, sessionId, mimeType } = body;

        if (!audio || !sessionId) {
          return Response.json({
            success: false,
            error: 'Missing required fields: audio, sessionId'
          }, {
            status: 400,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

        console.log('[STT-TTS Pipeline] Processing audio chunk', {
          sessionId,
          language,
          audioSize: audio.length
        });

        // Decode base64 audio
        const audioBuffer = Buffer.from(audio, 'base64');

        // Create session object
        const session = {
          id: sessionId, // PipelineService expects 'id'
          sessionId: sessionId, // Keep for backwards compatibility
          language: language || 'en',
          mode: 'stt-tts-pipeline'
        };

        // Map mimeType to encoding for STT service
        const audioMimeType = mimeType || 'audio/webm;codecs=opus';
        let encoding = 'WEBM_OPUS';
        let sampleRate = 48000;

        if (audioMimeType.includes('opus')) {
          encoding = 'WEBM_OPUS';
          sampleRate = 48000;
        } else if (audioMimeType.includes('pcm') || audioMimeType.includes('wav')) {
          encoding = 'LINEAR16';
          sampleRate = 16000;
        }

        // Process through pipeline (will use STTService, LLMService, MultiLanguageService)
        const result = await advancedServices.pipelineService.processAudio(
          audioBuffer,
          session,
          {
            encoding: encoding,
            sampleRate: sampleRate,
            mimeType: audioMimeType
          }
        );

        if (result.success) {
          return Response.json({
            success: true,
            stt: {
              transcript: result.stt.transcript,
              confidence: result.stt.confidence,
              issues: result.stt.issues || []
            },
            llm: {
              text: result.llm.text,
              model: result.llm.model
            },
            tts: {
              audio: result.tts.audio.toString('base64'),
              format: 'mp3'
            },
            latency: result.latency,
            mode: result.mode
          }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        } else if (result.isPolyfill && result.polyfill) {
          // STT failed or had quality issues - return polyfill audio
          return Response.json({
            success: true, // Return success to client with polyfill
            isPolyfill: true,
            stt: result.stt || {
              transcript: '',
              confidence: 0,
              issues: []
            },
            llm: {
              text: result.polyfill.text,
              model: 'polyfill'
            },
            tts: {
              audio: result.polyfill.audio.toString('base64'),
              format: 'mp3'
            },
            polyfill: {
              type: result.polyfill.type,
              source: result.polyfill.source
            },
            mode: result.mode || 'stt-tts-pipeline'
          }, {
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        } else {
          return Response.json({
            success: false,
            error: result.error || 'Pipeline processing failed'
          }, {
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
          });
        }

      } catch (error) {
        console.error('[STT-TTS Pipeline] Error:', error);
        return Response.json({
          success: false,
          error: 'Failed to process STT-TTS pipeline',
          details: error.message
        }, {
          status: 500,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // 404 handler
    return Response.json({
      error: 'Endpoint not found',
      path: path,
      method: req.method
    }, {
      status: 404,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  },
  
  // WebSocket message handler
  websocket: {
    async open(ws) {
      const endpoint = ws.data.endpoint || 'gemini-live';
      console.log(`[WebSocket] Client connected to ${endpoint}`);

      // Route to appropriate handler based on endpoint
      if (endpoint === 'vertex-ai-live') {
        // Initialize Vertex AI Live handler
        const handler = await initVertexAILive();
        ws.data.handler = 'vertex-ai-live';
        ws.data.vertexAILiveHandler = handler;

        // Let the Vertex AI handler manage the connection
        const sessionId = await handler.handleConnection(ws, { headers: {} });
        ws.data.sessionId = sessionId;  // Store sessionId for message routing
        return;
      }

      // Default: Gemini Live (existing flow)
      ws.data.sessionId = null;
      ws.data.geminiWebSocketService = null;
      ws.data.handler = 'gemini-live';

      // Initialize WebSocket service
      const webSocketService = await initGeminiLiveWebSocket();
      ws.data.geminiWebSocketService = webSocketService;
      
      // Send service status to client
      ws.send(JSON.stringify({
        type: 'service_status',
        data: {
          geminiLiveAvailable: !!geminiLiveService,
          message: geminiLiveService ? 'Gemini Live service ready' : 'Gemini Live service not available - API key required'
        }
      }));
    },
    
    async message(ws, message) {
      // Route to Vertex AI Live handler if applicable
      if (ws.data.handler === 'vertex-ai-live' && ws.data.vertexAILiveHandler) {
        // Forward message to Vertex AI Live handler
        const sessionId = ws.data.sessionId;
        await ws.data.vertexAILiveHandler.handleMessage(ws, sessionId, message);
        return;
      }

      // Default: Gemini Live flow
      try {
        // Check if Gemini Live service is available
        if (!geminiLiveService) {
          ws.send(JSON.stringify({
            type: 'error',
            data: { message: 'Gemini Live service not available. Please configure GOOGLE_API_KEY.' }
          }));
          return;
        }
        
        // Handle binary audio data (Opus frames)
        if (message instanceof ArrayBuffer || message instanceof Uint8Array) {
          console.log('[WebSocket] Received binary audio:', message.byteLength || message.length, 'bytes');
          
          if (!ws.data.sessionId || !ws.data.geminiWebSocketService) {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: 'Session not initialized. Send start_session first.' }
            }));
            return;
          }
          
          // Convert to Buffer if needed
          const audioBuffer = Buffer.from(message);
          
          // Send audio data to Gemini Live WebSocket
          try {
            console.log('[WebSocket] Sending audio to Gemini Live:', {
              sessionId: ws.data.sessionId,
              audioSize: audioBuffer.length,
              audioType: typeof audioBuffer
            });
            
            ws.data.geminiWebSocketService.sendAudioData(
              ws.data.sessionId,
              audioBuffer,
              { mimeType: 'audio/opus' }
            );
            
            console.log('[WebSocket] Audio sent to Gemini Live successfully');
          } catch (error) {
            console.error('[WebSocket] Error sending audio to Gemini Live:', {
              error: error.message,
              stack: error.stack,
              sessionId: ws.data.sessionId,
              audioSize: audioBuffer.length
            });
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: `Failed to process audio: ${error.message}` }
            }));
          }
          
          return;
        }
        
        // Handle JSON control messages
        let data;
        try {
          data = JSON.parse(message);
          console.log('[WebSocket] Received JSON message:', data.type);
        } catch (parseError) {
          console.error('[WebSocket] JSON Parse Error on server:', {
            error: parseError.message,
            messageType: typeof message,
            messageLength: message.length,
            messagePreview: message.substring(0, 100)
          });
          ws.send(JSON.stringify({
            type: 'error',
            data: { message: `JSON Parse error: ${parseError.message}` }
          }));
          return;
        }
        
        if (data.type === 'start_session') {
          console.log('[WebSocket] Starting session with config:', data.config || data.data);
          
          // Initialize session - handle both 'config' and 'data' formats
          const config = data.config || data.data || {};
          const sessionId = config.sessionId || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          const language = config.language || 'auto';
          const systemInstruction = config.systemInstruction || 'You are a helpful AI assistant with multilingual capabilities. AUTOMATICALLY DETECT the language the user speaks and ALWAYS respond in THE EXACT SAME LANGUAGE.';
          
          ws.data.sessionId = sessionId;
          ws.data.language = language;
          
          console.log('[WebSocket] Session initialized:', { sessionId, language });
          
          // Create WebSocket connection to Gemini Live API
          try {
            await ws.data.geminiWebSocketService.createConnection(sessionId, {
              systemInstruction,
              language
            });

            // Set up event listeners for responses
            ws.data.geminiWebSocketService.on('audioResponse', (response) => {
              if (response.sessionId === sessionId) {
                // Send audio response back to client
                const audioData = Buffer.from(response.audio, 'base64');
                ws.send(audioData);
              }
            });

            ws.data.geminiWebSocketService.on('textResponse', (response) => {
              if (response.sessionId === sessionId) {
                // Send text response back to client
                ws.send(JSON.stringify({
                  type: 'text_response',
                  data: { text: response.text }
                }));
              }
            });

            ws.data.geminiWebSocketService.on('error', (error) => {
              if (response.sessionId === sessionId) {
                ws.send(JSON.stringify({
                  type: 'error',
                  data: { message: error.error.message || 'Unknown error' }
                }));
              }
            });

            console.log('[WebSocket] Gemini Live WebSocket connection created');

            // Wait for sessionReady event before notifying client
            ws.data.geminiWebSocketService.once('sessionReady', (event) => {
              if (event.sessionId === sessionId) {
                console.log('[WebSocket] Session ready, notifying client');
                ws.send(JSON.stringify({
                  type: 'session_started',
                  data: {
                    sessionId,
                    language,
                    timestamp: Date.now(),
                    binaryMode: true
                  }
                }));
              }
            });
            
          } catch (error) {
            console.error('[WebSocket] Failed to create Gemini Live connection:', error);
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: 'Failed to connect to Gemini Live API' }
            }));
            return;
          }
          
        } else if (data.type === 'audio_input') {
          // Legacy: Handle base64-encoded audio (less efficient)
          console.warn('[WebSocket] Received base64 audio (inefficient). Consider using binary frames.');
          
          if (!ws.data.sessionId || !ws.data.geminiService) {
            ws.send(JSON.stringify({
              type: 'error',
              data: { message: 'Session not initialized' }
            }));
            return;
          }
          
          const audioBuffer = Buffer.from(data.data.audio, 'base64');
          
          // Stream audio responses
          for await (const chunk of ws.data.geminiService.processAudioStream(
            ws.data.sessionId, 
            audioBuffer,
            { 
              mimeType: data.data.mimeType || 'audio/opus',
              encoding: 'OPUS',
              sampleRate: data.data.sampleRate || 48000,
              channels: data.data.channels || 1
            }
          )) {
            ws.send(JSON.stringify({
              type: chunk.type,
              data: chunk
            }));
          }
          
        } else if (data.type === 'end_session') {
          // End session
          if (ws.data.geminiService && ws.data.sessionId) {
            ws.data.geminiService.endSession(ws.data.sessionId);
          }
          
          ws.send(JSON.stringify({
            type: 'session_ended',
            data: { sessionId: ws.data.sessionId }
          }));
          
          ws.close();
        }
        
      } catch (error) {
        console.error('[WebSocket] Message error:', {
          message: error.message,
          stack: error.stack,
          type: error.constructor.name
        });
        ws.send(JSON.stringify({
          type: 'error',
          data: { 
            message: error.message || error.toString() || 'Unknown error occurred',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
          }
        }));
      }
    },
    
    close(ws, code, reason) {
      console.log('[WebSocket] Client disconnected:', code, reason);

      // Route to appropriate handler
      if (ws.data.handler === 'vertex-ai-live' && ws.data.vertexAILiveHandler && ws.data.sessionId) {
        ws.data.vertexAILiveHandler.handleClose(ws.data.sessionId);
        return;
      }

      // Default: Gemini Live cleanup
      if (ws.data.geminiService && ws.data.sessionId) {
        try {
          ws.data.geminiService.endSession(ws.data.sessionId);
        } catch (error) {
          console.error('[WebSocket] Cleanup error:', error);
        }
      }
    },

    error(ws, error) {
      console.error('[WebSocket] Error:', error);

      // Route to appropriate handler
      if (ws.data.handler === 'vertex-ai-live' && ws.data.vertexAILiveHandler && ws.data.sessionId) {
        ws.data.vertexAILiveHandler.handleError(ws.data.sessionId, error);
      }
    }
  }
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('🚀 Vaakya API Server - Powered by Bun ⚡');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`📍 API URL: http://localhost:${PORT}`);
console.log(`🌐 Client URL: http://localhost:${PORT}/`);
console.log(`🔌 WebSocket: ws://localhost:${PORT}/api/gemini-live-stream`);
console.log(`🏃 Runtime: Bun ${Bun.version}`);
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('💡 Open http://localhost:8080/ in your browser to use the voice chat client!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Initialize Gemini Live service at startup
(async () => {
  try {
    geminiLiveService = await initGeminiLive();
    if (geminiLiveService) {
      console.log('✅ Gemini Live service initialized at startup');
    } else {
      console.log('⚠️  Gemini Live service not available - API key required');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Gemini Live service:', error.message);
  }
})();

