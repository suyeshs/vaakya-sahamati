const { VertexAI } = require('@google-cloud/vertexai');
const { logError, logInfo, logDebug } = require('../utils/logger');
const config = require('../config');

class VertexAIService {
  constructor() {
    this.vertexAI = null;
    this.generativeModel = null;
    this.initialized = false;
  }

  async initialize() {
    try {
      if (this.initialized) {
        return;
      }

      // Initialize Vertex AI
      this.vertexAI = new VertexAI({
        project: config.googleCloud.projectId,
        location: config.vertexAI.location,
      });

      // Initialize the generative model
      this.generativeModel = this.vertexAI.getGenerativeModel({
        model: config.vertexAI.model,
      });

      this.initialized = true;
      logInfo('Vertex AI service initialized', {
        project: config.googleCloud.projectId,
        location: config.vertexAI.location,
        model: config.vertexAI.model,
      });
    } catch (error) {
      logError(error, { context: 'Vertex AI initialization' });
      throw error;
    }
  }

  // Generate embeddings for text content
  async generateEmbedding(text, contentType = 'text') {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const prompt = `Generate a high-quality embedding for the following ${contentType} content. Focus on semantic meaning and context:\n\n${text}`;
      
      const result = await this.generativeModel.generateContent(prompt);
      const response = await result.response;
      
      // For now, we'll use a simplified approach to generate embeddings
      // In a production environment, you would use the dedicated embedding model
      const embedding = this._generateSimpleEmbedding(text);
      
      logDebug('Embedding generated', {
        contentType,
        textLength: text.length,
        embeddingDimensions: embedding.length,
      });

      return {
        embedding,
        model: config.vertexAI.model,
        dimensions: embedding.length,
        contentType,
        textLength: text.length,
      };
    } catch (error) {
      logError(error, { context: 'Generate embedding', contentType });
      throw error;
    }
  }

  // Generate embeddings for multiple texts
  async generateEmbeddings(texts, contentType = 'text') {
    try {
      const embeddings = [];
      
      for (const text of texts) {
        const embedding = await this.generateEmbedding(text, contentType);
        embeddings.push(embedding);
      }

      logInfo('Batch embeddings generated', {
        count: embeddings.length,
        contentType,
      });

      return embeddings;
    } catch (error) {
      logError(error, { context: 'Generate batch embeddings', contentType });
      throw error;
    }
  }

  // Perform similarity search using embeddings
  async findSimilarContent(queryEmbedding, contentEmbeddings, topK = 5) {
    try {
      const similarities = [];

      for (const content of contentEmbeddings) {
        const similarity = this._calculateCosineSimilarity(
          queryEmbedding.embedding,
          content.embedding
        );
        
        similarities.push({
          ...content,
          similarity,
        });
      }

      // Sort by similarity and return top K results
      const results = similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, topK);

      logDebug('Similarity search completed', {
        queryDimensions: queryEmbedding.embedding.length,
        contentCount: contentEmbeddings.length,
        topK,
        resultsCount: results.length,
      });

      return results;
    } catch (error) {
      logError(error, { context: 'Find similar content' });
      throw error;
    }
  }

  // Generate AI responses for chat
  async generateChatResponse(messages, context = {}) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const systemPrompt = `You are an intelligent assistant for the Samvad chat application. 
      You help users with their conversations, provide relevant information, and maintain context.
      Current context: ${JSON.stringify(context)}`;

      const chatMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.map(msg => ({
          role: msg.role || 'user',
          content: msg.content,
        })),
      ];

      const result = await this.generativeModel.generateContent({
        contents: chatMessages,
      });

      const response = await result.response;
      const generatedText = response.text();

      logDebug('Chat response generated', {
        messagesCount: messages.length,
        responseLength: generatedText.length,
      });

      return {
        content: generatedText,
        model: config.vertexAI.model,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logError(error, { context: 'Generate chat response' });
      throw error;
    }
  }

  // Summarize conversation or content
  async summarizeContent(content, maxLength = 200) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const prompt = `Please provide a concise summary of the following content in no more than ${maxLength} characters:\n\n${content}`;

      const result = await this.generativeModel.generateContent(prompt);
      const response = await result.response;
      const summary = response.text();

      logDebug('Content summarized', {
        originalLength: content.length,
        summaryLength: summary.length,
        maxLength,
      });

      return {
        summary,
        originalLength: content.length,
        summaryLength: summary.length,
        model: config.vertexAI.model,
      };
    } catch (error) {
      logError(error, { context: 'Summarize content' });
      throw error;
    }
  }

  // Extract keywords from content
  async extractKeywords(content, maxKeywords = 10) {
    try {
      if (!this.initialized) {
        await this.initialize();
      }

      const prompt = `Extract the most important keywords from the following content. Return them as a comma-separated list (maximum ${maxKeywords} keywords):\n\n${content}`;

      const result = await this.generativeModel.generateContent(prompt);
      const response = await result.response;
      const keywordsText = response.text();

      const keywords = keywordsText
        .split(',')
        .map(keyword => keyword.trim())
        .filter(keyword => keyword.length > 0)
        .slice(0, maxKeywords);

      logDebug('Keywords extracted', {
        contentLength: content.length,
        keywordsCount: keywords.length,
        keywords,
      });

      return {
        keywords,
        count: keywords.length,
        model: config.vertexAI.model,
      };
    } catch (error) {
      logError(error, { context: 'Extract keywords' });
      throw error;
    }
  }

  // Helper method to generate simple embeddings (placeholder implementation)
  _generateSimpleEmbedding(text) {
    // This is a simplified embedding generation for demonstration
    // In production, use a proper embedding model like text-embedding-004
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(768).fill(0);
    
    // Simple word frequency-based embedding
    words.forEach(word => {
      const hash = this._simpleHash(word);
      const index = hash % 768;
      embedding[index] += 1;
    });

    // Normalize the embedding
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return embedding.map(val => val / magnitude);
  }

  // Simple hash function
  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  // Calculate cosine similarity between two vectors
  _calculateCosineSimilarity(vecA, vecB) {
    if (vecA.length !== vecB.length) {
      throw new Error('Vectors must have the same length');
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    normA = Math.sqrt(normA);
    normB = Math.sqrt(normB);

    if (normA === 0 || normB === 0) {
      return 0;
    }

    return dotProduct / (normA * normB);
  }
}

// Singleton instance
const vertexAIService = new VertexAIService();

module.exports = vertexAIService;