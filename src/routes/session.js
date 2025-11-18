/**
 * Session Management API Routes
 * Manages user session state, conversation history, and session lifecycle
 */

const express = require('express');
const sessionPersistenceService = require('../services/SessionPersistenceService');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/session/:userId/state
 * Save user session state
 *
 * Body:
 * {
 *   "language": "en",
 *   "conversationContext": {...},
 *   "activeSessionId": "session_123"
 * }
 */
router.post('/:userId/state', async (req, res) => {
  try {
    const { userId } = req.params;
    const state = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId parameter'
      });
    }

    await sessionPersistenceService.saveUserState(userId, state);

    res.json({
      success: true,
      message: 'User state saved successfully',
      userId
    });
  } catch (error) {
    logger.error('[Session API] Save user state failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save user state',
      details: error.message
    });
  }
});

/**
 * GET /api/session/:userId/state
 * Get user session state
 */
router.get('/:userId/state', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId parameter'
      });
    }

    const state = await sessionPersistenceService.getUserState(userId);

    if (!state) {
      return res.status(404).json({
        success: false,
        error: 'User state not found'
      });
    }

    res.json({
      success: true,
      userId,
      state
    });
  } catch (error) {
    logger.error('[Session API] Get user state failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user state',
      details: error.message
    });
  }
});

/**
 * GET /api/session/:userId/profile
 * Get user profile with conversation history
 */
router.get('/:userId/profile', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId parameter'
      });
    }

    const profile = await sessionPersistenceService.getUserProfile(userId);

    res.json({
      success: true,
      userId,
      profile: {
        ...profile,
        historyLength: profile.conversationHistory?.length || 0
      }
    });
  } catch (error) {
    logger.error('[Session API] Get user profile failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user profile',
      details: error.message
    });
  }
});

/**
 * POST /api/session/:userId/history
 * Append message to user's conversation history
 *
 * Body:
 * {
 *   "role": "user" | "assistant",
 *   "content": "message content"
 * }
 */
router.post('/:userId/history', async (req, res) => {
  try {
    const { userId } = req.params;
    const message = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId parameter'
      });
    }

    if (!message.role || !message.content) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: role, content'
      });
    }

    await sessionPersistenceService.appendToUserHistory(userId, message);

    res.json({
      success: true,
      message: 'Message appended to history',
      userId
    });
  } catch (error) {
    logger.error('[Session API] Append to history failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to append message to history',
      details: error.message
    });
  }
});

/**
 * POST /api/session/create
 * Create or update active session
 *
 * Body:
 * {
 *   "sessionId": "session_123",
 *   "userId": "user_456",
 *   "language": "en",
 *   "metadata": {...}
 * }
 */
router.post('/create', async (req, res) => {
  try {
    const { sessionId, userId, ...sessionData } = req.body;

    if (!sessionId || !userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: sessionId, userId'
      });
    }

    await sessionPersistenceService.saveSession(sessionId, {
      userId,
      ...sessionData
    });

    res.json({
      success: true,
      message: 'Session created/updated successfully',
      sessionId,
      userId
    });
  } catch (error) {
    logger.error('[Session API] Create session failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create session',
      details: error.message
    });
  }
});

/**
 * GET /api/session/:sessionId
 * Get session data
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing sessionId parameter'
      });
    }

    const session = await sessionPersistenceService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      session
    });
  } catch (error) {
    logger.error('[Session API] Get session failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session',
      details: error.message
    });
  }
});

/**
 * PUT /api/session/:sessionId/end
 * Mark session as inactive/ended
 */
router.put('/:sessionId/end', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing sessionId parameter'
      });
    }

    await sessionPersistenceService.endSession(sessionId);

    res.json({
      success: true,
      message: 'Session ended successfully',
      sessionId
    });
  } catch (error) {
    logger.error('[Session API] End session failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end session',
      details: error.message
    });
  }
});

/**
 * GET /api/session/user/:userId/active
 * Get all active sessions for a user
 */
router.get('/user/:userId/active', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId parameter'
      });
    }

    const sessions = await sessionPersistenceService.getUserActiveSessions(userId);

    res.json({
      success: true,
      userId,
      count: sessions.length,
      sessions
    });
  } catch (error) {
    logger.error('[Session API] Get active sessions failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get active sessions',
      details: error.message
    });
  }
});

/**
 * POST /api/session/refresh
 * Clear all user data (refresh/reset)
 *
 * Body:
 * {
 *   "userId": "user_123"
 * }
 */
router.post('/refresh', async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: userId'
      });
    }

    const results = await sessionPersistenceService.clearUserData(userId);

    res.json({
      success: true,
      message: 'User data cleared successfully',
      userId,
      cleared: {
        userState: results.userState,
        userProfile: results.userProfile,
        sessions: results.sessions,
        interruptions: results.interruptions
      }
    });
  } catch (error) {
    logger.error('[Session API] Refresh failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear user data',
      details: error.message
    });
  }
});

/**
 * DELETE /api/session/:sessionId
 * Clear specific session data
 */
router.delete('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        error: 'Missing sessionId parameter'
      });
    }

    const results = await sessionPersistenceService.clearSession(sessionId);

    res.json({
      success: true,
      message: 'Session cleared successfully',
      sessionId,
      cleared: {
        session: results.session,
        interruptions: results.interruptions
      }
    });
  } catch (error) {
    logger.error('[Session API] Clear session failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear session',
      details: error.message
    });
  }
});

/**
 * GET /api/session/stats
 * Get session statistics
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await sessionPersistenceService.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    logger.error('[Session API] Get stats failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
      details: error.message
    });
  }
});

module.exports = router;
