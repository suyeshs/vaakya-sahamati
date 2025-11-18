/**
 * Content Management API Routes
 * Allows users to upload and manage their knowledge base
 */

const express = require('express');
const ContentManagementService = require('../services/ContentManagementService');
const { logger } = require('../utils/logger');

const router = express.Router();
const contentService = new ContentManagementService();

/**
 * POST /api/content/upload
 * Upload structured documents (menu items, FAQs, product docs)
 *
 * Body:
 * {
 *   "tenantId": "restaurant_001",
 *   "documents": [
 *     {
 *       "id": "dish_butter_chicken",
 *       "title": "Butter Chicken",
 *       "content": "Creamy tomato curry with tender chicken...",
 *       "category": "main_course",
 *       "metadata": {
 *         "price": "₹450",
 *         "spiceLevel": "medium",
 *         "allergens": ["dairy", "nuts"]
 *       }
 *     }
 *   ]
 * }
 */
router.post('/upload', async (req, res) => {
  try {
    const { tenantId, documents } = req.body;

    if (!tenantId || !documents || !Array.isArray(documents)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenantId, documents (array)'
      });
    }

    // Validate documents
    for (const doc of documents) {
      if (!doc.content) {
        return res.status(400).json({
          success: false,
          error: 'Each document must have "content" field'
        });
      }
    }

    const result = await contentService.uploadDocuments(tenantId, documents);

    res.json({
      success: true,
      message: `Successfully uploaded ${result.imported} documents`,
      ...result
    });
  } catch (error) {
    logger.error('[Content API] Upload failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload documents',
      details: error.message
    });
  }
});

/**
 * POST /api/content/import-urls
 * Import content from URLs
 *
 * Body:
 * {
 *   "tenantId": "restaurant_001",
 *   "urls": [
 *     "https://restaurant.com/menu",
 *     "https://restaurant.com/about"
 *   ]
 * }
 */
router.post('/import-urls', async (req, res) => {
  try {
    const { tenantId, urls } = req.body;

    if (!tenantId || !urls || !Array.isArray(urls)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenantId, urls (array)'
      });
    }

    // Scrape URLs and upload as documents
    const scrapedDocs = [];
    for (const url of urls) {
      try {
        const scraped = await contentService.scrapeUrl(url);
        scrapedDocs.push({
          id: `url_${Buffer.from(url).toString('base64').substring(0, 20)}`,
          title: scraped.title,
          content: scraped.content,
          category: 'webpage',
          metadata: {
            sourceUrl: url,
            scrapedAt: scraped.scrapedAt
          }
        });
      } catch (error) {
        logger.error('[Content API] URL scrape failed:', { url, error: error.message });
        // Continue with other URLs
      }
    }

    if (scrapedDocs.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Failed to scrape any URLs'
      });
    }

    const result = await contentService.uploadDocuments(tenantId, scrapedDocs);

    res.json({
      success: true,
      message: `Successfully imported ${result.imported} pages from ${urls.length} URLs`,
      ...result,
      urlsProcessed: urls.length,
      urlsSucceeded: scrapedDocs.length
    });
  } catch (error) {
    logger.error('[Content API] URL import failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to import URLs',
      details: error.message
    });
  }
});

/**
 * GET /api/content/list/:tenantId
 * List all documents for a tenant
 */
router.get('/list/:tenantId', async (req, res) => {
  try {
    const { tenantId } = req.params;
    const { pageToken, pageSize } = req.query;

    const result = await contentService.listDocuments(tenantId, {
      pageToken,
      pageSize: pageSize ? parseInt(pageSize) : 100
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    logger.error('[Content API] List failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list documents',
      details: error.message
    });
  }
});

/**
 * PUT /api/content/update/:tenantId/:documentId
 * Update a specific document
 *
 * Body:
 * {
 *   "content": "Updated content...",
 *   "title": "Updated Title",
 *   "metadata": { ... }
 * }
 */
router.put('/update/:tenantId/:documentId', async (req, res) => {
  try {
    const { tenantId, documentId } = req.params;
    const updates = req.body;

    const result = await contentService.updateDocument(tenantId, documentId, updates);

    res.json({
      success: true,
      message: 'Document updated successfully',
      document: result
    });
  } catch (error) {
    logger.error('[Content API] Update failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update document',
      details: error.message
    });
  }
});

/**
 * DELETE /api/content/delete/:tenantId/:documentId
 * Delete a specific document
 */
router.delete('/delete/:tenantId/:documentId', async (req, res) => {
  try {
    const { tenantId, documentId } = req.params;

    const result = await contentService.deleteDocument(tenantId, documentId);

    res.json({
      success: true,
      message: 'Document deleted successfully',
      ...result
    });
  } catch (error) {
    logger.error('[Content API] Delete failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete document',
      details: error.message
    });
  }
});

/**
 * POST /api/content/search
 * Search tenant's knowledge base (for testing)
 *
 * Body:
 * {
 *   "tenantId": "restaurant_001",
 *   "query": "What vegetarian dishes do you have?",
 *   "maxResults": 5
 * }
 */
router.post('/search', async (req, res) => {
  try {
    const { tenantId, query, maxResults } = req.body;

    if (!tenantId || !query) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: tenantId, query'
      });
    }

    const results = await contentService.searchKnowledge(tenantId, query, {
      maxResults: maxResults || 5
    });

    res.json({
      success: true,
      query,
      resultCount: results.length,
      results
    });
  } catch (error) {
    logger.error('[Content API] Search failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search knowledge base',
      details: error.message
    });
  }
});

/**
 * POST /api/content/create-datastore
 * Create a new datastore for a tenant (one-time setup)
 *
 * Body:
 * {
 *   "tenantId": "restaurant_001",
 *   "displayName": "Restaurant Menu Knowledge Base"
 * }
 */
router.post('/create-datastore', async (req, res) => {
  try {
    const { tenantId, displayName } = req.body;

    if (!tenantId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: tenantId'
      });
    }

    const result = await contentService.createTenantDatastore(tenantId, {
      displayName
    });

    res.json({
      success: true,
      message: 'Datastore created successfully',
      ...result
    });
  } catch (error) {
    logger.error('[Content API] Datastore creation failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create datastore',
      details: error.message
    });
  }
});

module.exports = router;
