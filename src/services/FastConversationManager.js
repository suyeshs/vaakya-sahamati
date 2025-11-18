// Optimized Conversation Management Service
// Uses in-memory cache and lazy loading for better performance

const { logger } = require('../utils/logger');

// In-memory cache for conversation contexts
const conversationCache = new Map();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

class FastConversationManager {
  constructor(sessionId = 'default') {
    this.sessionId = sessionId;
    this.history = [];
    this.conversationFacts = {};
    this.currentLanguage = 'en';
    this.lastAccessed = Date.now();
    this.firestore = null;
  }

  static async getInstance(sessionId) {
    // Check cache first
    if (conversationCache.has(sessionId)) {
      const cached = conversationCache.get(sessionId);
      cached.lastAccessed = Date.now();
      return cached;
    }

    // Create new instance
    const manager = new FastConversationManager(sessionId);
    await manager.initialize();
    conversationCache.set(sessionId, manager);

    // Clean up old sessions
    FastConversationManager.cleanupOldSessions();

    return manager;
  }

  async initialize() {
    try {
      // Initialize Firestore
      const admin = require('firebase-admin');
      if (!admin.apps.length) {
        admin.initializeApp();
      }
      this.firestore = admin.firestore();

      // Load conversation data in background (non-blocking for first request)
      this.loadFromStorage().catch(err => {
        logger.error('[FastConversationManager] Background load error:', err);
      });

      logger.info('[FastConversationManager] Initialized', { sessionId: this.sessionId });
    } catch (error) {
      logger.error('[FastConversationManager] Initialization error:', error);
    }
  }

  async loadFromStorage() {
    try {
      const conversationDoc = `conversations/${this.sessionId}`;
      const historyCollection = `${conversationDoc}/history`;

      // Load only recent history (last 20 messages)
      const historySnapshot = await this.firestore
        .collection(historyCollection)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get();

      this.history = historySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .reverse(); // Reverse to get chronological order

      // Load conversation facts
      const factsDoc = await this.firestore.doc(conversationDoc).get();
      if (factsDoc.exists) {
        this.conversationFacts = factsDoc.data();
      }

      logger.info('[FastConversationManager] Loaded from storage', {
        sessionId: this.sessionId,
        historyCount: this.history.length
      });
    } catch (error) {
      logger.error('[FastConversationManager] Load error:', error);
    }
  }

  addMessageToMemory(role, content) {
    const message = {
      role,
      content,
      timestamp: Date.now()
    };

    // Add to in-memory history
    this.history.push(message);

    // Keep only last 20 messages in memory
    if (this.history.length > 20) {
      this.history.shift();
    }

    // Persist to Firestore asynchronously (non-blocking)
    this.persistMessage(role, content).catch(err => {
      logger.error('[FastConversationManager] Persist error:', err);
    });

    return message;
  }

  async persistMessage(role, content) {
    try {
      const conversationDoc = `conversations/${this.sessionId}`;
      const historyCollection = `${conversationDoc}/history`;

      await this.firestore.collection(historyCollection).add({
        role,
        content,
        timestamp: Date.now()
      });
    } catch (error) {
      logger.error('[FastConversationManager] Persist message error:', error);
    }
  }

  addUserMessage(message) {
    return this.addMessageToMemory('user', message);
  }

  addAssistantMessage(message) {
    return this.addMessageToMemory('assistant', message);
  }

  getContext() {
    return {
      history: this.history,
      facts: this.conversationFacts,
      // Maintain both keys for backward compatibility
      currentLanguage: this.currentLanguage,
      language: this.currentLanguage,
      sessionId: this.sessionId
    };
  }

  getRecentHistory(limit = 10) {
    return this.history.slice(-limit);
  }

  static cleanupOldSessions() {
    const now = Date.now();
    const toDelete = [];

    conversationCache.forEach((manager, sessionId) => {
      if (now - manager.lastAccessed > CACHE_TTL) {
        toDelete.push(sessionId);
      }
    });

    toDelete.forEach(sessionId => {
      conversationCache.delete(sessionId);
      logger.info('[FastConversationManager] Cleaned up session', { sessionId });
    });
  }

  static getCacheStats() {
    return {
      size: conversationCache.size,
      sessions: Array.from(conversationCache.keys())
    };
  }
}

module.exports = FastConversationManager;