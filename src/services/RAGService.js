/**
 * RAG Service for Google Cloud Platform
 * Handles retrieval-augmented generation using Vertex AI Vector Search
 */

const { logger } = require('../utils/logger');
const axios = require('axios');

class RAGService {
  constructor(env) {
    this.env = env;
    this.apiBaseUrl = env.GCP_API_BASE_URL || 'https://us-central1-sahamati-labs.cloudfunctions.net/api';
    this.firebaseToken = env.FIREBASE_TOKEN;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    if (!this.firebaseToken) {
      throw new Error('FIREBASE_TOKEN is required for RAG service');
    }
    
    this.initialized = true;
    logger.info('[RAGService] Initialized');
  }

  async searchRelevantContent(query, contentType = 'all', limit = 5) {
    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/api/vector/search`,
        {
          query,
          contentType,
          limit
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.firebaseToken}`
          },
          timeout: 10000
        }
      );

      if (response.status === 200) {
        const results = response.data.results || [];
        logger.info('[RAGService] Search completed', { 
          query: query.substring(0, 50),
          resultCount: results.length 
        });
        return results;
      } else {
        throw new Error(`Search failed with status: ${response.status}`);
      }
    } catch (error) {
      logger.error('[RAGService] Search error:', error);
      return [];
    }
  }

  async addContentToVectorStore(content, contentType, contentId, metadata = {}) {
    try {
      const response = await axios.post(
        `${this.apiBaseUrl}/api/vector/embeddings`,
        {
          content,
          contentType,
          contentId,
          metadata
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.firebaseToken}`
          },
          timeout: 15000
        }
      );

      if (response.status === 201) {
        logger.info('[RAGService] Content added to vector store', { 
          contentId,
          contentType 
        });
        return response.data;
      } else {
        throw new Error(`Failed to add content with status: ${response.status}`);
      }
    } catch (error) {
      logger.error('[RAGService] Error adding content:', error);
      throw error;
    }
  }

  async buildContextFromSearch(query, conversationHistory = [], maxContextLength = 2000) {
    try {
      // Search for relevant content
      const searchResults = await this.searchRelevantContent(query, 'all', 10);
      
      // Build context from search results and conversation history
      let context = '';
      let currentLength = 0;
      
      // Add relevant search results
      for (const result of searchResults) {
        if (currentLength >= maxContextLength) break;
        
        let content = '';
        if (result.type === 'message') {
          content = result.message?.content || '';
        } else if (result.type === 'user') {
          content = `User profile: ${result.user?.display_name || ''}`;
        } else if (result.type === 'room') {
          content = `Room: ${result.room?.name || ''} - ${result.room?.description || ''}`;
        }
        
        if (content && currentLength + content.length <= maxContextLength) {
          context += `\n${content}`;
          currentLength += content.length;
        }
      }
      
      // Add recent conversation history if space allows
      const recentHistory = conversationHistory.slice(-3);
      for (const message of recentHistory) {
        if (currentLength >= maxContextLength) break;
        
        const historyText = `${message.role}: ${message.content}`;
        if (currentLength + historyText.length <= maxContextLength) {
          context += `\n${historyText}`;
          currentLength += historyText.length;
        }
      }
      
      logger.info('[RAGService] Context built', { 
        contextLength: context.length,
        searchResultsUsed: searchResults.length,
        historyMessagesUsed: recentHistory.length 
      });
      
      return context.trim();
    } catch (error) {
      logger.error('[RAGService] Error building context:', error);
      return '';
    }
  }

  async generateRAGResponse(query, conversationHistory = [], language = 'en') {
    try {
      // Build context using RAG
      const context = await this.buildContextFromSearch(query, conversationHistory);
      
      // If no context found, return empty context
      if (!context) {
        logger.warn('[RAGService] No relevant context found for query');
        return {
          response: '',
          context: '',
          sources: []
        };
      }
      
      // Extract sources from search results
      const searchResults = await this.searchRelevantContent(query, 'all', 5);
      const sources = searchResults.map(result => ({
        type: result.type,
        content: result.type === 'message' ? result.message?.content?.substring(0, 100) : '',
        similarity: result.similarity
      }));
      
      logger.info('[RAGService] RAG response generated', { 
        contextLength: context.length,
        sourceCount: sources.length 
      });
      
      return {
        response: context,
        context,
        sources
      };
    } catch (error) {
      logger.error('[RAGService] Error generating RAG response:', error);
      return {
        response: '',
        context: '',
        sources: []
      };
    }
  }

  async cleanup() {
    logger.info('[RAGService] Cleanup completed');
  }
}

module.exports = RAGService;