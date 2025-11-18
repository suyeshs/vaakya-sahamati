/**
 * Content Management Service
 * Allows tenants to upload and manage their own knowledge base
 * Uses Vertex AI Search for managed RAG
 */

const { DiscoveryEngineClient } = require('@google-cloud/discoveryengine').v1;
const axios = require('axios');
const { logger } = require('../utils/logger');

class ContentManagementService {
  constructor() {
    this.client = null;
    this.projectId = process.env.GOOGLE_CLOUD_PROJECT_ID || 'sahamati-labs';
    this.location = 'global'; // Vertex AI Search is global
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      this.client = new DiscoveryEngineClient();
      this.initialized = true;
      logger.info('[ContentManagement] Service initialized');
    } catch (error) {
      logger.error('[ContentManagement] Initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create a new datastore for a tenant
   * This is done once during tenant onboarding
   */
  async createTenantDatastore(tenantId, config = {}) {
    if (!this.initialized) await this.initialize();

    try {
      const datastoreId = `${tenantId}_knowledge`;
      const parent = `projects/${this.projectId}/locations/${this.location}/collections/default_collection`;

      const dataStore = {
        displayName: config.displayName || `${tenantId} Knowledge Base`,
        industryVertical: 'GENERIC', // or 'RETAIL', 'MEDIA', etc.
        solutionTypes: ['SOLUTION_TYPE_SEARCH'],
        contentConfig: 'CONTENT_REQUIRED',
      };

      const request = {
        parent,
        dataStore,
        dataStoreId: datastoreId,
      };

      const [operation] = await this.client.createDataStore(request);
      const [response] = await operation.promise();

      logger.info('[ContentManagement] Datastore created', {
        tenantId,
        datastoreId,
        name: response.name
      });

      return {
        datastoreId,
        name: response.name
      };
    } catch (error) {
      logger.error('[ContentManagement] Failed to create datastore:', error);
      throw error;
    }
  }

  /**
   * Import content from URLs
   * User provides array of URLs to scrape and index
   */
  async importFromUrls(tenantId, urls, options = {}) {
    if (!this.initialized) await this.initialize();

    try {
      const datastoreId = `${tenantId}_knowledge`;
      const parent = `projects/${this.projectId}/locations/${this.location}/collections/default_collection/dataStores/${datastoreId}/branches/default_branch`;

      // Prepare import request
      const importRequest = {
        parent,
        reconciliationMode: 'INCREMENTAL', // Don't delete existing docs
        inputConfig: {
          gcsSource: null, // We'll use inline for now
          bigquerySource: null,
        },
        errorConfig: {
          gcsPrefix: null // Optional: log errors to GCS
        }
      };

      // For URLs, we can use Vertex AI Search's built-in web connector
      // OR scrape ourselves and upload as documents

      // Method 1: Let Vertex AI Search crawl the URLs
      const websiteDataSourceId = `${tenantId}_website`;
      await this.createWebsiteDataSource(datastoreId, urls, websiteDataSourceId);

      logger.info('[ContentManagement] URL import initiated', {
        tenantId,
        urlCount: urls.length
      });

      return {
        status: 'importing',
        urls: urls.length,
        datastoreId
      };
    } catch (error) {
      logger.error('[ContentManagement] URL import failed:', error);
      throw error;
    }
  }

  /**
   * Create website data source for URL crawling
   */
  async createWebsiteDataSource(datastoreId, urls, dataSourceId) {
    // This tells Vertex AI Search to crawl and index these URLs
    const parent = `projects/${this.projectId}/locations/${this.location}/collections/default_collection/dataStores/${datastoreId}`;

    // Note: Website crawling is an advanced feature
    // For MVP, we'll scrape and upload documents ourselves
    logger.info('[ContentManagement] Website data source would be created here', {
      urls
    });
  }

  /**
   * Upload structured documents directly
   * For menu items, FAQs, product docs, etc.
   */
  async uploadDocuments(tenantId, documents) {
    if (!this.initialized) await this.initialize();

    try {
      const datastoreId = `${tenantId}_knowledge`;
      const parent = `projects/${this.projectId}/locations/${this.location}/collections/default_collection/dataStores/${datastoreId}/branches/default_branch`;

      // Convert documents to Vertex AI Search format
      const formattedDocs = documents.map((doc, index) => ({
        id: doc.id || `doc_${Date.now()}_${index}`,
        structData: {
          // Document content
          content: doc.content,
          title: doc.title || `Document ${index + 1}`,

          // Metadata for filtering
          category: doc.category || 'general',
          tags: doc.tags || [],

          // Custom fields
          ...doc.metadata
        }
      }));

      const request = {
        parent,
        documents: formattedDocs,
        reconciliationMode: 'INCREMENTAL'
      };

      const [operation] = await this.client.importDocuments(request);
      const [response] = await operation.promise();

      logger.info('[ContentManagement] Documents uploaded', {
        tenantId,
        count: documents.length,
        datastoreId
      });

      return {
        status: 'success',
        imported: documents.length,
        datastoreId
      };
    } catch (error) {
      logger.error('[ContentManagement] Document upload failed:', error);
      throw error;
    }
  }

  /**
   * Search tenant's knowledge base
   * This is called during conversations for RAG
   */
  async searchKnowledge(tenantId, query, options = {}) {
    if (!this.initialized) await this.initialize();

    try {
      const datastoreId = `${tenantId}_knowledge`;
      const servingConfig = `projects/${this.projectId}/locations/${this.location}/collections/default_collection/dataStores/${datastoreId}/servingConfigs/default_search`;

      const request = {
        servingConfig,
        query,
        pageSize: options.maxResults || 5,
        queryExpansionSpec: {
          condition: 'AUTO', // Expand query for better results
        },
        spellCorrectionSpec: {
          mode: 'AUTO', // Fix spelling errors
        }
      };

      const [response] = await this.client.search(request);

      const results = response.results.map(result => ({
        id: result.document.id,
        content: result.document.structData?.content || '',
        title: result.document.structData?.title || '',
        category: result.document.structData?.category || '',
        relevanceScore: result.relevanceScore || 0,
        metadata: result.document.structData || {}
      }));

      logger.info('[ContentManagement] Knowledge search completed', {
        tenantId,
        query: query.substring(0, 50),
        resultCount: results.length
      });

      return results;
    } catch (error) {
      logger.error('[ContentManagement] Knowledge search failed:', error);
      return [];
    }
  }

  /**
   * Update specific document
   */
  async updateDocument(tenantId, documentId, updates) {
    if (!this.initialized) await this.initialize();

    try {
      const datastoreId = `${tenantId}_knowledge`;
      const documentPath = `projects/${this.projectId}/locations/${this.location}/collections/default_collection/dataStores/${datastoreId}/branches/default_branch/documents/${documentId}`;

      const request = {
        document: {
          name: documentPath,
          structData: updates
        },
        allowMissing: false
      };

      const [document] = await this.client.updateDocument(request);

      logger.info('[ContentManagement] Document updated', {
        tenantId,
        documentId
      });

      return document;
    } catch (error) {
      logger.error('[ContentManagement] Document update failed:', error);
      throw error;
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(tenantId, documentId) {
    if (!this.initialized) await this.initialize();

    try {
      const datastoreId = `${tenantId}_knowledge`;
      const name = `projects/${this.projectId}/locations/${this.location}/collections/default_collection/dataStores/${datastoreId}/branches/default_branch/documents/${documentId}`;

      await this.client.deleteDocument({ name });

      logger.info('[ContentManagement] Document deleted', {
        tenantId,
        documentId
      });

      return { status: 'deleted', documentId };
    } catch (error) {
      logger.error('[ContentManagement] Document deletion failed:', error);
      throw error;
    }
  }

  /**
   * List all documents for a tenant
   */
  async listDocuments(tenantId, options = {}) {
    if (!this.initialized) await this.initialize();

    try {
      const datastoreId = `${tenantId}_knowledge`;
      const parent = `projects/${this.projectId}/locations/${this.location}/collections/default_collection/dataStores/${datastoreId}/branches/default_branch`;

      const request = {
        parent,
        pageSize: options.pageSize || 100,
        pageToken: options.pageToken || ''
      };

      const [response] = await this.client.listDocuments(request);

      const documents = response.documents.map(doc => ({
        id: doc.id,
        name: doc.name,
        content: doc.structData?.content || '',
        title: doc.structData?.title || '',
        metadata: doc.structData || {}
      }));

      return {
        documents,
        nextPageToken: response.nextPageToken
      };
    } catch (error) {
      logger.error('[ContentManagement] List documents failed:', error);
      throw error;
    }
  }

  /**
   * Scrape URL and extract content
   * Helper method for URL import
   */
  async scrapeUrl(url) {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Samvad-Content-Bot/1.0'
        }
      });

      // Simple HTML to text extraction
      // In production, use a proper HTML parser
      const html = response.data;
      const text = html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return {
        url,
        title: this.extractTitle(html),
        content: text,
        scrapedAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('[ContentManagement] URL scraping failed:', { url, error: error.message });
      throw error;
    }
  }

  /**
   * Extract title from HTML
   */
  extractTitle(html) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : 'Untitled';
  }
}

module.exports = ContentManagementService;
