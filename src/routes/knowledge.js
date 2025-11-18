/**
 * Knowledge Base API Routes
 * Allows users to upload and manage documents for RAG
 */

const express = require('express');
const knowledgeBaseService = require('../services/KnowledgeBaseService');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/knowledge/add-url
 * Add document from URL
 *
 * Body:
 * {
 *   "url": "https://example.com/document",
 *   "title": "Optional Title",
 *   "category": "financial_policy",
 *   "tags": ["loan", "interest"]
 * }
 */
router.post('/add-url', async (req, res) => {
  try {
    const { url, title, category, tags } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: url'
      });
    }

    const metadata = {
      title,
      category,
      tags: tags || []
    };

    const document = await knowledgeBaseService.addFromUrl(url, metadata);

    res.json({
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
    });
  } catch (error) {
    logger.error('[Knowledge API] Add URL failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add document from URL',
      details: error.message
    });
  }
});

/**
 * POST /api/knowledge/add-text
 * Add plain text document
 *
 * Body:
 * {
 *   "content": "Document content here...",
 *   "title": "Document Title",
 *   "category": "general",
 *   "tags": ["tag1", "tag2"]
 * }
 */
router.post('/add-text', async (req, res) => {
  try {
    const { content, title, category, tags } = req.body;

    if (!content || !title) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: content, title'
      });
    }

    const metadata = {
      category,
      tags: tags || []
    };

    const document = await knowledgeBaseService.addText(content, title, metadata);

    res.json({
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
    });
  } catch (error) {
    logger.error('[Knowledge API] Add text failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add text document',
      details: error.message
    });
  }
});

/**
 * POST /api/knowledge/add-pdf
 * Add document from PDF (base64 encoded)
 *
 * Body:
 * {
 *   "pdfContent": "base64_encoded_pdf_data",
 *   "filename": "document.pdf",
 *   "title": "Optional Title",
 *   "category": "document",
 *   "tags": ["tag1"]
 * }
 */
router.post('/add-pdf', async (req, res) => {
  try {
    const { pdfContent, filename, title, category, tags } = req.body;

    if (!pdfContent || !filename) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: pdfContent (base64), filename'
      });
    }

    const metadata = {
      title,
      category,
      tags: tags || []
    };

    const document = await knowledgeBaseService.addFromPdf(pdfContent, filename, metadata);

    res.json({
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
    });
  } catch (error) {
    logger.error('[Knowledge API] Add PDF failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to add PDF document',
      details: error.message
    });
  }
});

/**
 * GET /api/knowledge/list
 * List all documents in knowledge base
 */
router.get('/list', async (req, res) => {
  try {
    const documents = await knowledgeBaseService.listAll();

    res.json({
      success: true,
      count: documents.length,
      documents
    });
  } catch (error) {
    logger.error('[Knowledge API] List failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list documents',
      details: error.message
    });
  }
});

/**
 * GET /api/knowledge/:id
 * Get specific document by ID
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const document = await knowledgeBaseService.getById(id);

    if (!document) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    res.json({
      success: true,
      document
    });
  } catch (error) {
    logger.error('[Knowledge API] Get by ID failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get document',
      details: error.message
    });
  }
});

/**
 * DELETE /api/knowledge/:id
 * Delete document by ID
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existed = await knowledgeBaseService.delete(id);

    if (!existed) {
      return res.status(404).json({
        success: false,
        error: 'Document not found'
      });
    }

    res.json({
      success: true,
      message: 'Document deleted successfully',
      documentId: id
    });
  } catch (error) {
    logger.error('[Knowledge API] Delete failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete document',
      details: error.message
    });
  }
});

/**
 * DELETE /api/knowledge
 * Clear all documents
 */
router.delete('/', async (req, res) => {
  try {
    await knowledgeBaseService.clearAll();

    res.json({
      success: true,
      message: 'All documents cleared successfully'
    });
  } catch (error) {
    logger.error('[Knowledge API] Clear all failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear documents',
      details: error.message
    });
  }
});

/**
 * POST /api/knowledge/search
 * Search knowledge base (for testing)
 *
 * Body:
 * {
 *   "query": "search query",
 *   "maxResults": 3,
 *   "category": "optional_category_filter"
 * }
 */
router.post('/search', async (req, res) => {
  try {
    const { query, maxResults, category } = req.body;

    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: query'
      });
    }

    const results = knowledgeBaseService.search(query, {
      maxResults: maxResults || 3,
      category
    });

    res.json({
      success: true,
      query,
      resultCount: results.length,
      results
    });
  } catch (error) {
    logger.error('[Knowledge API] Search failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search knowledge base',
      details: error.message
    });
  }
});

module.exports = router;
