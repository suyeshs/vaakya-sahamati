/**
 * Knowledge Base Service - Firestore-backed RAG for Financial Assistant
 * Allows uploading PDFs and URLs that Gemini Live can reference
 */

const axios = require('axios');
const { logger} = require('../utils/logger');
const firebaseService = require('./firebase');

class KnowledgeBaseService {
  constructor() {
    this.collection = 'knowledge_base'; // Firestore collection
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize Firebase/Firestore
      await firebaseService.initialize();

      this.initialized = true;

      // Get document count
      const count = await this.getDocumentCount();

      logger.info('[KnowledgeBase] Service initialized with Firestore', {
        collection: this.collection,
        documentsCount: count
      });
    } catch (error) {
      logger.error('[KnowledgeBase] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Get total document count
   */
  async getDocumentCount() {
    try {
      const snapshot = await firebaseService.firestore
        .collection(this.collection)
        .count()
        .get();
      return snapshot.data().count;
    } catch (error) {
      logger.warn('[KnowledgeBase] Could not get count:', error.message);
      return 0;
    }
  }

  /**
   * Add document from URL
   */
  async addFromUrl(url, metadata = {}) {
    if (!this.initialized) await this.initialize();

    try {
      logger.info('[KnowledgeBase] Fetching URL', { url });

      // Fetch content
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent': 'Samvad-Financial-Assistant/1.0'
        }
      });

      // Extract text content
      const content = this.extractTextFromHtml(response.data);

      // Create document
      const documentId = `url_${Date.now()}`;
      const document = {
        id: documentId,
        type: 'url',
        source: url,
        title: metadata.title || this.extractTitle(response.data) || url,
        content: content,
        category: metadata.category || 'general',
        tags: metadata.tags || [],
        addedAt: new Date().toISOString(),
        metadata: {
          contentLength: content.length,
          sourceType: 'url',
          ...metadata
        }
      };

      // Store in Firestore
      await firebaseService.setDocument(this.collection, documentId, document);

      logger.info('[KnowledgeBase] URL added to Firestore', {
        id: document.id,
        url,
        contentLength: content.length
      });

      return document;
    } catch (error) {
      logger.error('[KnowledgeBase] Failed to add URL:', { url, error: error.message });
      throw new Error(`Failed to fetch URL: ${error.message}`);
    }
  }

  /**
   * Add document from PDF (expects base64 content)
   */
  async addFromPdf(pdfContent, filename, metadata = {}) {
    if (!this.initialized) await this.initialize();

    try {
      logger.info('[KnowledgeBase] Processing PDF', { filename });

      // Extract text from PDF
      const text = await this.extractTextFromPdf(pdfContent);

      // Create document
      const documentId = `pdf_${Date.now()}`;
      const document = {
        id: documentId,
        type: 'pdf',
        source: filename,
        title: metadata.title || filename.replace('.pdf', ''),
        content: text,
        category: metadata.category || 'document',
        tags: metadata.tags || [],
        addedAt: new Date().toISOString(),
        metadata: {
          contentLength: text.length,
          sourceType: 'pdf',
          filename,
          ...metadata
        }
      };

      // Store in Firestore
      await firebaseService.setDocument(this.collection, documentId, document);

      logger.info('[KnowledgeBase] PDF added to Firestore', {
        id: document.id,
        filename,
        contentLength: text.length
      });

      return document;
    } catch (error) {
      logger.error('[KnowledgeBase] Failed to add PDF:', { filename, error: error.message });
      throw new Error(`Failed to process PDF: ${error.message}`);
    }
  }

  /**
   * Add plain text document
   */
  async addText(content, title, metadata = {}) {
    if (!this.initialized) await this.initialize();

    const documentId = metadata.id || `text_${Date.now()}`;
    const document = {
      id: documentId,
      type: 'text',
      source: metadata.sourceUrl || 'manual_entry',
      title: title,
      content: content,
      category: metadata.category || 'general',
      tags: metadata.tags || [],
      addedAt: new Date().toISOString(),
      metadata: {
        contentLength: content.length,
        sourceType: 'text',
        ...metadata
      }
    };

    // Store in Firestore
    await firebaseService.setDocument(this.collection, documentId, document);

    logger.info('[KnowledgeBase] Text document added to Firestore', {
      id: document.id,
      title
    });

    return document;
  }

  /**
   * Search knowledge base with Firestore
   * Uses field indexing for better performance
   */
  async search(query, options = {}) {
    if (!this.initialized) await this.initialize();

    const maxResults = options.maxResults || 3;
    const queryLower = query.toLowerCase();
    const keywords = queryLower.split(/\s+/).filter(w => w.length > 2);

    try {
      // Get all documents (with optional category filter)
      let firestoreQuery = firebaseService.firestore.collection(this.collection);

      if (options.category) {
        firestoreQuery = firestoreQuery.where('category', '==', options.category);
      }

      const snapshot = await firestoreQuery.get();
      const documents = [];

      snapshot.forEach(doc => {
        documents.push({ id: doc.id, ...doc.data() });
      });

      // Score each document
      const scored = documents.map(doc => {
        const titleLower = (doc.title || '').toLowerCase();
        const contentLower = (doc.content || '').toLowerCase();
        const tagsLower = (doc.tags || []).join(' ').toLowerCase();

        let score = 0;

        // Title match (highest weight)
        keywords.forEach(keyword => {
          if (titleLower.includes(keyword)) score += 10;
        });

        // Tag match
        keywords.forEach(keyword => {
          if (tagsLower.includes(keyword)) score += 5;
        });

        // Content match
        keywords.forEach(keyword => {
          const matches = (contentLower.match(new RegExp(keyword, 'g')) || []).length;
          score += matches * 0.5;
        });

        // Category match bonus
        if (options.category && doc.category === options.category) {
          score += 3;
        }

        return { doc, score };
      });

      // Filter and sort
      const results = scored
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, maxResults)
        .map(item => ({
          ...item.doc,
          relevanceScore: item.score
        }));

      logger.info('[KnowledgeBase] Firestore search completed', {
        query: query.substring(0, 50),
        totalDocuments: documents.length,
        resultCount: results.length
      });

      return results;
    } catch (error) {
      logger.error('[KnowledgeBase] Search failed:', error);
      throw error;
    }
  }

  /**
   * Get context for Gemini Live
   * Searches and formats relevant documents
   */
  async getContextForQuery(query, maxLength = 3000) {
    const results = await this.search(query, { maxResults: 3 });

    if (results.length === 0) {
      return '';
    }

    let context = '\n📚 RELEVANT KNOWLEDGE BASE DOCUMENTS:\n\n';
    let currentLength = context.length;

    for (const doc of results) {
      const docText = `📄 ${doc.title}\n${doc.content}\n\n`;

      if (currentLength + docText.length > maxLength) {
        // Truncate to fit
        const available = maxLength - currentLength;
        if (available > 200) {
          context += `📄 ${doc.title}\n${doc.content.substring(0, available - 100)}...\n\n`;
        }
        break;
      }

      context += docText;
      currentLength += docText.length;
    }

    logger.info('[KnowledgeBase] Context generated from Firestore', {
      query: query.substring(0, 50),
      documentsUsed: results.length,
      contextLength: context.length
    });

    return context;
  }

  /**
   * List all documents
   */
  async listAll() {
    if (!this.initialized) await this.initialize();

    try {
      const snapshot = await firebaseService.firestore
        .collection(this.collection)
        .orderBy('addedAt', 'desc')
        .get();

      const documents = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        documents.push({
          id: doc.id,
          title: data.title,
          type: data.type,
          category: data.category,
          tags: data.tags,
          addedAt: data.addedAt,
          contentLength: data.content ? data.content.length : 0
        });
      });

      logger.info('[KnowledgeBase] Listed all documents from Firestore', {
        count: documents.length
      });

      return documents;
    } catch (error) {
      logger.error('[KnowledgeBase] Failed to list documents:', error);
      throw error;
    }
  }

  /**
   * Get document by ID
   */
  async getById(id) {
    if (!this.initialized) await this.initialize();

    try {
      const doc = await firebaseService.getDocument(this.collection, id);
      return doc;
    } catch (error) {
      logger.error('[KnowledgeBase] Failed to get document:', { id, error });
      throw error;
    }
  }

  /**
   * Delete document
   */
  async delete(id) {
    if (!this.initialized) await this.initialize();

    try {
      await firebaseService.deleteDocument(this.collection, id);
      logger.info('[KnowledgeBase] Document deleted from Firestore', { id });
      return true;
    } catch (error) {
      logger.error('[KnowledgeBase] Failed to delete document:', { id, error });
      return false;
    }
  }

  /**
   * Clear all documents
   */
  async clearAll() {
    if (!this.initialized) await this.initialize();

    try {
      // Get all documents
      const snapshot = await firebaseService.firestore
        .collection(this.collection)
        .get();

      // Delete in batch
      const batch = firebaseService.firestore.batch();
      snapshot.docs.forEach(doc => {
        batch.delete(doc.ref);
      });

      await batch.commit();

      logger.info('[KnowledgeBase] All documents cleared from Firestore', {
        count: snapshot.size
      });
    } catch (error) {
      logger.error('[KnowledgeBase] Failed to clear all documents:', error);
      throw error;
    }
  }

  /**
   * Extract text from HTML
   */
  extractTextFromHtml(html) {
    // Remove scripts and styles
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Clean up whitespace
    text = text
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return text;
  }

  /**
   * Extract title from HTML
   */
  extractTitle(html) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : null;
  }

  /**
   * Extract text from PDF
   * NOTE: This is a placeholder - in production, use pdf-parse or Document AI
   */
  async extractTextFromPdf(pdfContent) {
    logger.warn('[KnowledgeBase] PDF parsing not fully implemented - install pdf-parse package');

    // Placeholder implementation
    return "PDF content extraction requires pdf-parse package or Google Document AI. Please use plain text or URLs for now.";

    /*
    // Production implementation would be:
    const pdfParse = require('pdf-parse');
    const buffer = Buffer.from(pdfContent, 'base64');
    const data = await pdfParse(buffer);
    return data.text;
    */
  }
}

// Singleton instance
const knowledgeBaseService = new KnowledgeBaseService();

module.exports = knowledgeBaseService;
