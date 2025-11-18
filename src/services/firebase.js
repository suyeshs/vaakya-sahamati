const admin = require('firebase-admin');
const { logError, logInfo } = require('../utils/logger');
const config = require('../config');

class FirebaseService {
  constructor() {
    this.app = null;
    this.auth = null;
    this.firestore = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (this.initialized) {
        return;
      }

      // Initialize Firebase Admin SDK
      if (!admin.apps.length) {
        this.app = admin.initializeApp({
          credential: admin.credential.applicationDefault(),
          projectId: config.firebase.projectId,
        });
      } else {
        this.app = admin.app();
      }

      this.auth = admin.auth();
      this.firestore = admin.firestore();

      // Configure Firestore settings
      this.firestore.settings({
        ignoreUndefinedProperties: true,
      });

      this.initialized = true;
      logInfo('Firebase Admin SDK initialized', {
        projectId: config.firebase.projectId,
      });
    } catch (error) {
      logError(error, { context: 'Firebase initialization' });
      throw error;
    }
  }

  // Authentication methods
  async verifyIdToken(idToken) {
    try {
      const decodedToken = await this.auth.verifyIdToken(idToken);
      return decodedToken;
    } catch (error) {
      logError(error, { context: 'Token verification' });
      throw new Error('Invalid authentication token');
    }
  }

  async getUser(uid) {
    try {
      const userRecord = await this.auth.getUser(uid);
      return userRecord;
    } catch (error) {
      logError(error, { context: 'Get user', uid });
      throw error;
    }
  }

  async createUser(userData) {
    try {
      const userRecord = await this.auth.createUser({
        email: userData.email,
        password: userData.password,
        displayName: userData.displayName,
        photoURL: userData.avatarUrl,
      });
      return userRecord;
    } catch (error) {
      logError(error, { context: 'Create user' });
      throw error;
    }
  }

  async updateUser(uid, userData) {
    try {
      const updateData = {};
      if (userData.email) updateData.email = userData.email;
      if (userData.displayName) updateData.displayName = userData.displayName;
      if (userData.photoURL) updateData.photoURL = userData.photoURL;

      const userRecord = await this.auth.updateUser(uid, updateData);
      return userRecord;
    } catch (error) {
      logError(error, { context: 'Update user', uid });
      throw error;
    }
  }

  async deleteUser(uid) {
    try {
      await this.auth.deleteUser(uid);
      logInfo('User deleted', { uid });
    } catch (error) {
      logError(error, { context: 'Delete user', uid });
      throw error;
    }
  }

  // Firestore methods for real-time state management (Durable Objects equivalent)
  async getDocument(collection, docId) {
    try {
      const doc = await this.firestore.collection(collection).doc(docId).get();
      if (!doc.exists) {
        return null;
      }
      return { id: doc.id, ...doc.data() };
    } catch (error) {
      logError(error, { context: 'Get document', collection, docId });
      throw error;
    }
  }

  async setDocument(collection, docId, data, merge = false) {
    try {
      const docRef = this.firestore.collection(collection).doc(docId);
      if (merge) {
        await docRef.set(data, { merge: true });
      } else {
        await docRef.set(data);
      }
      return { id: docId, ...data };
    } catch (error) {
      logError(error, { context: 'Set document', collection, docId });
      throw error;
    }
  }

  async updateDocument(collection, docId, data) {
    try {
      await this.firestore.collection(collection).doc(docId).update(data);
      return { id: docId, ...data };
    } catch (error) {
      logError(error, { context: 'Update document', collection, docId });
      throw error;
    }
  }

  async deleteDocument(collection, docId) {
    try {
      await this.firestore.collection(collection).doc(docId).delete();
      logInfo('Document deleted', { collection, docId });
    } catch (error) {
      logError(error, { context: 'Delete document', collection, docId });
      throw error;
    }
  }

  async queryCollection(collection, conditions = [], orderBy = null, limit = null) {
    try {
      let query = this.firestore.collection(collection);

      // Apply conditions
      for (const condition of conditions) {
        const { field, operator, value } = condition;
        query = query.where(field, operator, value);
      }

      // Apply ordering
      if (orderBy) {
        query = query.orderBy(orderBy.field, orderBy.direction || 'asc');
      }

      // Apply limit
      if (limit) {
        query = query.limit(limit);
      }

      const snapshot = await query.get();
      const documents = [];
      snapshot.forEach(doc => {
        documents.push({ id: doc.id, ...doc.data() });
      });

      return documents;
    } catch (error) {
      logError(error, { context: 'Query collection', collection });
      throw error;
    }
  }

  // Real-time state management methods
  async updateUserState(userId, state) {
    try {
      const stateData = {
        ...state,
        userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      return await this.setDocument('user_states', userId, stateData, true);
    } catch (error) {
      logError(error, { context: 'Update user state', userId });
      throw error;
    }
  }

  async getUserState(userId) {
    try {
      return await this.getDocument('user_states', userId);
    } catch (error) {
      logError(error, { context: 'Get user state', userId });
      throw error;
    }
  }

  async updateRoomState(roomId, state) {
    try {
      const stateData = {
        ...state,
        roomId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      return await this.setDocument('room_states', roomId, stateData, true);
    } catch (error) {
      logError(error, { context: 'Update room state', roomId });
      throw error;
    }
  }

  async getRoomState(roomId) {
    try {
      return await this.getDocument('room_states', roomId);
    } catch (error) {
      logError(error, { context: 'Get room state', roomId });
      throw error;
    }
  }

  // Session management
  async createSession(userId, sessionData) {
    try {
      const sessionId = this.firestore.collection('sessions').doc().id;
      const session = {
        id: sessionId,
        userId,
        ...sessionData,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        lastActivity: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true,
      };
      await this.setDocument('sessions', sessionId, session);
      return session;
    } catch (error) {
      logError(error, { context: 'Create session', userId });
      throw error;
    }
  }

  async updateSessionActivity(sessionId) {
    try {
      await this.updateDocument('sessions', sessionId, {
        lastActivity: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (error) {
      logError(error, { context: 'Update session activity', sessionId });
      throw error;
    }
  }

  async getActiveSessions(userId) {
    try {
      return await this.queryCollection('sessions', [
        { field: 'userId', operator: '==', value: userId },
        { field: 'isActive', operator: '==', value: true },
      ], { field: 'lastActivity', direction: 'desc' });
    } catch (error) {
      logError(error, { context: 'Get active sessions', userId });
      throw error;
    }
  }
}

// Singleton instance
const firebaseService = new FirebaseService();

module.exports = firebaseService;