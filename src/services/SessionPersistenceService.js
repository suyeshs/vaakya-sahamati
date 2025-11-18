/**
 * Session Persistence Service
 * Manages full session state in Firestore for stateful conversational AI
 */

const firebaseService = require('./firebase');
const { logger } = require('../utils/logger');

class SessionPersistenceService {
  constructor() {
    this.initialized = false;

    // Firestore collections
    this.collections = {
      userStates: 'user_states',           // Active session state per user
      userProfiles: 'user_profiles',       // Cross-session user data
      sessions: 'sessions',                 // Session metadata and lifecycle
      interruptions: 'interruptions'        // Interruption context history
    };
  }

  async initialize() {
    if (this.initialized) return;

    try {
      await firebaseService.initialize();
      this.initialized = true;
      logger.info('[SessionPersistence] Service initialized');
    } catch (error) {
      logger.error('[SessionPersistence] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Save user session state
   * Includes active conversation, language preferences, current context
   */
  async saveUserState(userId, state) {
    if (!this.initialized) await this.initialize();

    try {
      const stateData = {
        userId,
        ...state,
        updatedAt: new Date().toISOString(),
        isActive: true
      };

      await firebaseService.setDocument(
        this.collections.userStates,
        userId,
        stateData,
        true // merge
      );

      logger.info('[SessionPersistence] User state saved', { userId });
      return true;
    } catch (error) {
      logger.error('[SessionPersistence] Save user state failed:', { userId, error });
      throw error;
    }
  }

  /**
   * Get user session state
   */
  async getUserState(userId) {
    if (!this.initialized) await this.initialize();

    try {
      const state = await firebaseService.getDocument(
        this.collections.userStates,
        userId
      );

      return state || null;
    } catch (error) {
      logger.error('[SessionPersistence] Get user state failed:', { userId, error });
      return null;
    }
  }

  /**
   * Save cross-session user profile
   * Includes conversation history across all sessions
   */
  async saveUserProfile(userId, profile) {
    if (!this.initialized) await this.initialize();

    try {
      const profileData = {
        userId,
        ...profile,
        lastUpdated: new Date().toISOString()
      };

      await firebaseService.setDocument(
        this.collections.userProfiles,
        userId,
        profileData,
        true // merge
      );

      logger.info('[SessionPersistence] User profile saved', {
        userId,
        historyLength: profile.conversationHistory?.length || 0
      });
      return true;
    } catch (error) {
      logger.error('[SessionPersistence] Save user profile failed:', { userId, error });
      throw error;
    }
  }

  /**
   * Get user profile with conversation history
   */
  async getUserProfile(userId) {
    if (!this.initialized) await this.initialize();

    try {
      const profile = await firebaseService.getDocument(
        this.collections.userProfiles,
        userId
      );

      return profile || {
        userId,
        conversationHistory: [],
        preferences: {},
        createdAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('[SessionPersistence] Get user profile failed:', { userId, error });
      return {
        userId,
        conversationHistory: [],
        preferences: {},
        createdAt: new Date().toISOString()
      };
    }
  }

  /**
   * Append message to user's cross-session history
   */
  async appendToUserHistory(userId, message) {
    if (!this.initialized) await this.initialize();

    try {
      const profile = await this.getUserProfile(userId);

      if (!profile.conversationHistory) {
        profile.conversationHistory = [];
      }

      profile.conversationHistory.push({
        ...message,
        timestamp: new Date().toISOString()
      });

      // Keep last 100 messages
      if (profile.conversationHistory.length > 100) {
        profile.conversationHistory = profile.conversationHistory.slice(-100);
      }

      await this.saveUserProfile(userId, profile);

      logger.info('[SessionPersistence] Message appended to history', {
        userId,
        totalMessages: profile.conversationHistory.length
      });
      return true;
    } catch (error) {
      logger.error('[SessionPersistence] Append to history failed:', { userId, error });
      throw error;
    }
  }

  /**
   * Create or update active session
   */
  async saveSession(sessionId, sessionData) {
    if (!this.initialized) await this.initialize();

    try {
      const session = {
        id: sessionId,
        ...sessionData,
        lastActivity: new Date().toISOString(),
        isActive: true
      };

      await firebaseService.setDocument(
        this.collections.sessions,
        sessionId,
        session,
        true // merge
      );

      logger.info('[SessionPersistence] Session saved', { sessionId });
      return true;
    } catch (error) {
      logger.error('[SessionPersistence] Save session failed:', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get session data
   */
  async getSession(sessionId) {
    if (!this.initialized) await this.initialize();

    try {
      const session = await firebaseService.getDocument(
        this.collections.sessions,
        sessionId
      );

      return session || null;
    } catch (error) {
      logger.error('[SessionPersistence] Get session failed:', { sessionId, error });
      return null;
    }
  }

  /**
   * Mark session as inactive/ended
   */
  async endSession(sessionId) {
    if (!this.initialized) await this.initialize();

    try {
      await firebaseService.updateDocument(
        this.collections.sessions,
        sessionId,
        {
          isActive: false,
          endedAt: new Date().toISOString()
        }
      );

      logger.info('[SessionPersistence] Session ended', { sessionId });
      return true;
    } catch (error) {
      logger.error('[SessionPersistence] End session failed:', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserActiveSessions(userId) {
    if (!this.initialized) await this.initialize();

    try {
      const sessions = await firebaseService.queryCollection(
        this.collections.sessions,
        [
          { field: 'userId', operator: '==', value: userId },
          { field: 'isActive', operator: '==', value: true }
        ],
        { field: 'lastActivity', direction: 'desc' }
      );

      return sessions || [];
    } catch (error) {
      logger.error('[SessionPersistence] Get active sessions failed:', { userId, error });
      return [];
    }
  }

  /**
   * Save interruption context for resumability
   */
  async saveInterruptionContext(sessionId, interruption) {
    if (!this.initialized) await this.initialize();

    try {
      const interruptionId = `${sessionId}_${Date.now()}`;
      const interruptionData = {
        id: interruptionId,
        sessionId,
        ...interruption,
        timestamp: new Date().toISOString()
      };

      await firebaseService.setDocument(
        this.collections.interruptions,
        interruptionId,
        interruptionData
      );

      logger.info('[SessionPersistence] Interruption context saved', {
        sessionId,
        interruptionType: interruption.type
      });
      return interruptionId;
    } catch (error) {
      logger.error('[SessionPersistence] Save interruption failed:', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get recent interruptions for a session
   */
  async getSessionInterruptions(sessionId, limit = 3) {
    if (!this.initialized) await this.initialize();

    try {
      const interruptions = await firebaseService.queryCollection(
        this.collections.interruptions,
        [
          { field: 'sessionId', operator: '==', value: sessionId }
        ],
        { field: 'timestamp', direction: 'desc' },
        limit
      );

      return interruptions || [];
    } catch (error) {
      logger.error('[SessionPersistence] Get interruptions failed:', { sessionId, error });
      return [];
    }
  }

  /**
   * Clear all data for a user (refresh/reset)
   */
  async clearUserData(userId) {
    if (!this.initialized) await this.initialize();

    try {
      const results = {
        userState: false,
        userProfile: false,
        sessions: 0,
        interruptions: 0
      };

      // Delete user state
      try {
        await firebaseService.deleteDocument(this.collections.userStates, userId);
        results.userState = true;
      } catch (error) {
        logger.warn('[SessionPersistence] User state deletion failed:', error);
      }

      // Delete user profile
      try {
        await firebaseService.deleteDocument(this.collections.userProfiles, userId);
        results.userProfile = true;
      } catch (error) {
        logger.warn('[SessionPersistence] User profile deletion failed:', error);
      }

      // Delete all user sessions
      try {
        const sessions = await firebaseService.queryCollection(
          this.collections.sessions,
          [{ field: 'userId', operator: '==', value: userId }]
        );

        for (const session of sessions) {
          await firebaseService.deleteDocument(this.collections.sessions, session.id);
          results.sessions++;
        }
      } catch (error) {
        logger.warn('[SessionPersistence] Sessions deletion failed:', error);
      }

      // Delete interruptions for user sessions
      try {
        const sessions = await firebaseService.queryCollection(
          this.collections.sessions,
          [{ field: 'userId', operator: '==', value: userId }]
        );

        for (const session of sessions) {
          const interruptions = await firebaseService.queryCollection(
            this.collections.interruptions,
            [{ field: 'sessionId', operator: '==', value: session.id }]
          );

          for (const interruption of interruptions) {
            await firebaseService.deleteDocument(this.collections.interruptions, interruption.id);
            results.interruptions++;
          }
        }
      } catch (error) {
        logger.warn('[SessionPersistence] Interruptions deletion failed:', error);
      }

      logger.info('[SessionPersistence] User data cleared', { userId, results });
      return results;
    } catch (error) {
      logger.error('[SessionPersistence] Clear user data failed:', { userId, error });
      throw error;
    }
  }

  /**
   * Clear specific session data
   */
  async clearSession(sessionId) {
    if (!this.initialized) await this.initialize();

    try {
      const results = {
        session: false,
        interruptions: 0
      };

      // Delete session
      try {
        await firebaseService.deleteDocument(this.collections.sessions, sessionId);
        results.session = true;
      } catch (error) {
        logger.warn('[SessionPersistence] Session deletion failed:', error);
      }

      // Delete session interruptions
      try {
        const interruptions = await firebaseService.queryCollection(
          this.collections.interruptions,
          [{ field: 'sessionId', operator: '==', value: sessionId }]
        );

        for (const interruption of interruptions) {
          await firebaseService.deleteDocument(this.collections.interruptions, interruption.id);
          results.interruptions++;
        }
      } catch (error) {
        logger.warn('[SessionPersistence] Interruptions deletion failed:', error);
      }

      logger.info('[SessionPersistence] Session cleared', { sessionId, results });
      return results;
    } catch (error) {
      logger.error('[SessionPersistence] Clear session failed:', { sessionId, error });
      throw error;
    }
  }

  /**
   * Get session statistics
   */
  async getStats() {
    if (!this.initialized) await this.initialize();

    try {
      const stats = {
        activeUsers: 0,
        activeSessions: 0,
        totalProfiles: 0,
        totalInterruptions: 0
      };

      // Count active user states
      const userStates = await firebaseService.firestore
        .collection(this.collections.userStates)
        .where('isActive', '==', true)
        .get();
      stats.activeUsers = userStates.size;

      // Count active sessions
      const sessions = await firebaseService.firestore
        .collection(this.collections.sessions)
        .where('isActive', '==', true)
        .get();
      stats.activeSessions = sessions.size;

      // Count total profiles
      const profiles = await firebaseService.firestore
        .collection(this.collections.userProfiles)
        .count()
        .get();
      stats.totalProfiles = profiles.data().count;

      // Count total interruptions
      const interruptions = await firebaseService.firestore
        .collection(this.collections.interruptions)
        .count()
        .get();
      stats.totalInterruptions = interruptions.data().count;

      return stats;
    } catch (error) {
      logger.error('[SessionPersistence] Get stats failed:', error);
      return {
        activeUsers: 0,
        activeSessions: 0,
        totalProfiles: 0,
        totalInterruptions: 0,
        error: error.message
      };
    }
  }
}

// Singleton instance
const sessionPersistenceService = new SessionPersistenceService();

module.exports = sessionPersistenceService;
