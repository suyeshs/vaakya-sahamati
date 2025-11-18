// Conversation Management Service for GCP
// Handles conversation history, facts extraction, and context management
// Replicates Cloudflare Durable Object conversation state management

const { logger } = require('../utils/logger');

class ConversationManager {
  constructor(env, sessionId = 'default') {
    this.env = env;
    this.sessionId = sessionId;
    this.history = [];
    this.conversationFacts = {};
    this.currentLanguage = 'en';
    this.initialized = false;
    
    // Firestore document paths - using single document per session
    this.conversationDoc = `conversations/${sessionId}`;
    this.historyCollection = `conversations/${sessionId}/history`;
  }

  async initialize() {
    if (this.initialized) return;
    
    try {
      // Initialize Firestore if not already done
      if (!this.firestore) {
        const admin = require('firebase-admin');
        if (!admin.apps.length) {
          admin.initializeApp({
            projectId: this.env.GOOGLE_CLOUD_PROJECT_ID
          });
        }
        this.firestore = admin.firestore();
      }
      
      // Load existing conversation data
      await this.loadFromStorage();
      
      this.initialized = true;
      logger.info('[ConversationManager] Initialized', { sessionId: this.sessionId });
    } catch (error) {
      logger.error('[ConversationManager] Initialization error:', error);
      throw error;
    }
  }

  async loadFromStorage() {
    try {
      // Load conversation history
      const historySnapshot = await this.firestore
        .collection(this.historyCollection)
        .orderBy('timestamp', 'asc')
        .get();
      
      this.history = historySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Load conversation facts
      const factsDoc = await this.firestore
        .doc(this.conversationDoc)
        .get();
      
      if (factsDoc.exists) {
        this.conversationFacts = factsDoc.data();
      }
      
      logger.info('[ConversationManager] Loaded from storage', { 
        historyCount: this.history.length,
        factsKeys: Object.keys(this.conversationFacts)
      });
    } catch (error) {
      logger.error('[ConversationManager] Load from storage error:', error);
      // Continue with empty state if loading fails
    }
  }

  async addMessage(role, content) {
    try {
      const message = {
        role,
        content,
        timestamp: Date.now(),
        sessionId: this.sessionId
      };
      
      // Add to local history
      this.history.push(message);
      
      // Persist to Firestore
      await this.firestore
        .collection(this.historyCollection)
        .add(message);
      
      logger.info('[ConversationManager] Message added', { role, contentLength: content.length });
    } catch (error) {
      logger.error('[ConversationManager] Add message error:', error);
      throw error;
    }
  }

  async addUserMessage(content) {
    await this.addMessage('user', content);
    this.updateConversationFactsFromMessage(content);
    await this.persistFacts();
    logger.info('[ConversationManager] Updated facts:', this.conversationFacts);
  }

  async addAssistantMessage(content) {
    await this.addMessage('assistant', content);
  }

  getHistory() {
    return this.history;
  }

  getRecentHistory(count = 4) {
    return this.history.slice(-count);
  }

  getConversationFacts() {
    return this.conversationFacts;
  }

  getCurrentLanguage() {
    return this.currentLanguage;
  }

  setLanguage(language) {
    this.currentLanguage = language;
  }

  getContext() {
    return {
      history: this.history,
      facts: this.conversationFacts,
      currentLanguage: this.currentLanguage,
      sessionId: this.sessionId
    };
  }

  async clearHistory() {
    try {
      // Clear local state
      this.history = [];
      this.conversationFacts = {};
      
      // Clear Firestore data
      const batch = this.firestore.batch();
      
      // Delete all history documents
      const historySnapshot = await this.firestore
        .collection(this.historyCollection)
        .get();
      
      historySnapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });
      
      // Delete facts document
      const factsRef = this.firestore.doc(this.conversationDoc);
      batch.delete(factsRef);
      
      await batch.commit();
      
      logger.info('[ConversationManager] History cleared', { sessionId: this.sessionId });
    } catch (error) {
      logger.error('[ConversationManager] Clear history error:', error);
      throw error;
    }
  }

  // Quick recall for previously mentioned values
  getRecallResponse(transcript) {
    const recallRegex = /(what\s+was\s+the\s+(loan|amount)|how\s+much\s+did\s+i\s+(ask|say)|loan\s+amount\s*\?*)/i;
    
    if (recallRegex.test(transcript) && this.conversationFacts.lastLoanAmount) {
      const amount = this.conversationFacts.lastLoanAmount;
      const purpose = this.conversationFacts.lastLoanPurpose ? ` for ${this.conversationFacts.lastLoanPurpose}` : '';
      return `You mentioned a loan amount of ${amount.toLocaleString('en-IN')} rupees${purpose}.`;
    }
    
    return null;
  }

  // Build facts context for LLM prompts
  buildFactsContext() {
    if (!this.conversationFacts || Object.keys(this.conversationFacts).length === 0) {
      return '';
    }

    const parts = [];
    if (this.conversationFacts.lastLoanAmount) {
      parts.push(`Last mentioned loan amount: ${this.conversationFacts.lastLoanAmount}`);
    }
    if (this.conversationFacts.lastLoanPurpose) {
      parts.push(`Loan purpose: ${this.conversationFacts.lastLoanPurpose}`);
    }
    if (this.conversationFacts.lastLoanType) {
      parts.push(`Loan type: ${this.conversationFacts.lastLoanType}`);
    }

    return parts.length > 0 ? `\nFACTS: ${parts.join(' | ')}` : '';
  }

  // Persist facts to Firestore
  async persistFacts() {
    try {
      await this.firestore
        .doc(this.conversationDoc)
        .set(this.conversationFacts, { merge: true });
      
      logger.info('[ConversationManager] Facts persisted', { 
        factsKeys: Object.keys(this.conversationFacts)
      });
    } catch (error) {
      logger.error('[ConversationManager] Persist facts error:', error);
      throw error;
    }
  }

  // Extract facts from user messages
  updateConversationFactsFromMessage(message) {
    try {
      logger.info('[ConversationManager] Extracting facts from:', message);
      const lower = message.toLowerCase();
      const amountNumeric = this.parseAmountFromText(message);

      if (amountNumeric) {
        this.conversationFacts.lastLoanAmount = amountNumeric;
        logger.info('[ConversationManager] Extracted amount:', amountNumeric);
      }

      // Identify loan purpose
      const forMatch = lower.match(/loan\s+for\s+(a\s+)?([a-z ]{2,20})/i);
      if (forMatch && forMatch[2]) {
        const purpose = forMatch[2].trim().replace(/[^a-z ]/gi, '').trim();
        if (purpose) {
          this.conversationFacts.lastLoanPurpose = purpose;
          logger.info('[ConversationManager] Extracted purpose:', purpose);
        }
        const loanType = this.determineLoanTypeFromPurpose(purpose);
        if (loanType) {
          this.conversationFacts.lastLoanType = loanType;
          logger.info('[ConversationManager] Extracted loan type:', loanType);
        }
      }

      // Detect purpose by keywords
      const keywordPurpose = this.detectPurposeByKeywords(lower);
      if (keywordPurpose && !this.conversationFacts.lastLoanPurpose) {
        this.conversationFacts.lastLoanPurpose = keywordPurpose;
        logger.info('[ConversationManager] Extracted keyword purpose:', keywordPurpose);
      }
      const keywordType = this.determineLoanTypeFromPurpose(keywordPurpose || lower);
      if (keywordType && !this.conversationFacts.lastLoanType) {
        this.conversationFacts.lastLoanType = keywordType;
        logger.info('[ConversationManager] Extracted keyword loan type:', keywordType);
      }
    } catch (e) {
      logger.warn('[ConversationManager] Failed to update conversation facts:', e);
    }
  }

  parseAmountFromText(text) {
    const t = text.toLowerCase();

    // Handle various formats: 25k, 250 thousand, 1,50,000, 5 lakh, 2 crore
    let m = t.match(/\b(\d{1,3}(?:\,\d{2})*(?:\,\d{3})|\d+)\s*k\b/i);
    if (m && m[1]) {
      const base = parseInt(m[1].replace(/,/g, ''), 10);
      if (!isNaN(base)) return base * 1000;
    }

    m = t.match(/\b(\d{1,3}(?:\,\d{2})*(?:\,\d{3})|\d+)\s*(thousand|lakh|lac|crore)\b/i);
    if (m && m[1]) {
      const base = parseInt(m[1].replace(/,/g, ''), 10);
      if (!isNaN(base)) {
        const unit = (m[2] || '').toLowerCase();
        const mul = unit === 'thousand' ? 1_000 : unit === 'lakh' || unit === 'lac' ? 100_000 : 10_000_000;
        return base * mul;
      }
    }

    m = t.match(/\b(\d{1,3}(?:,\d{2})*(?:,\d{3})|\d{4,9})\b/);
    if (m && m[1]) {
      const num = parseInt(m[1].replace(/,/g, ''), 10);
      if (!isNaN(num)) return num;
    }

    return null;
  }

  determineLoanTypeFromPurpose(purpose) {
    const p = purpose.toLowerCase();
    if (/(bike|two\s*-?wheeler|two\s* wheeler|scooter|motorcycle|moped)/.test(p)) return 'personal_two_wheeler';
    if (/(car|auto|four\s*-?wheeler|vehicle)/.test(p)) return 'auto';
    if (/(home|house|housing|mortgage|property)/.test(p)) return 'home';
    if (/(education|college|tuition|school|university)/.test(p)) return 'education';
    if (/(medical|health|treatment|hospital|surgery)/.test(p)) return 'personal_medical';
    return 'personal';
  }

  detectPurposeByKeywords(text) {
    if (/(bike|two\s*-?wheeler|scooter|motorcycle|moped)/.test(text)) return 'bike';
    if (/(car|auto|four\s*-?wheeler|vehicle)/.test(text)) return 'car';
    if (/(education|college|tuition|school|university)/.test(text)) return 'education expenses';
    if (/(medical|health|treatment|hospital|surgery)/.test(text)) return 'medical expenses';
    if (/(home|house|housing|mortgage|property)/.test(text)) return 'home purchase';
    return null;
  }

  async cleanup() {
    logger.info('[ConversationManager] Cleanup completed');
  }
}

module.exports = ConversationManager;