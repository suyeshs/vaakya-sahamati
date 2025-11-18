/**
 * Analytics API Routes
 * Exposes Opik analytics data
 */

const OpikClient = require('../services/OpikClient.js').default;
const { logger } = require('../utils/logger');

/**
 * Register analytics routes
 */
function registerAnalyticsRoutes(server) {
  /**
   * GET /api/analytics/traces
   * Get conversation traces with pagination
   */
  server.get('/api/analytics/traces', async (req, res) => {
    try {
      if (!OpikClient.isEnabled()) {
        return res.status(503).json({
          error: 'Analytics service not configured'
        });
      }

      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;

      const data = await OpikClient.getTraces(limit, offset);

      if (!data) {
        return res.status(500).json({
          error: 'Failed to fetch traces'
        });
      }

      res.json(data);
    } catch (error) {
      logger.error('[Analytics] Error fetching traces:', error);
      res.status(500).json({
        error: 'Failed to fetch traces',
        message: error.message
      });
    }
  });

  /**
   * GET /api/analytics/evaluations
   * Get conversation evaluations with pagination
   */
  server.get('/api/analytics/evaluations', async (req, res) => {
    try {
      if (!OpikClient.isEnabled()) {
        return res.status(503).json({
          error: 'Analytics service not configured'
        });
      }

      const limit = parseInt(req.query.limit) || 100;
      const offset = parseInt(req.query.offset) || 0;

      const data = await OpikClient.getEvaluations(limit, offset);

      if (!data) {
        return res.status(500).json({
          error: 'Failed to fetch evaluations'
        });
      }

      res.json(data);
    } catch (error) {
      logger.error('[Analytics] Error fetching evaluations:', error);
      res.status(500).json({
        error: 'Failed to fetch evaluations',
        message: error.message
      });
    }
  });

  /**
   * GET /api/analytics/stats
   * Get storage statistics
   */
  server.get('/api/analytics/stats', async (req, res) => {
    try {
      if (!OpikClient.isEnabled()) {
        return res.status(503).json({
          error: 'Analytics service not configured'
        });
      }

      const stats = await OpikClient.getStorageStats();

      if (!stats) {
        return res.status(500).json({
          error: 'Failed to fetch stats'
        });
      }

      res.json(stats);
    } catch (error) {
      logger.error('[Analytics] Error fetching stats:', error);
      res.status(500).json({
        error: 'Failed to fetch stats',
        message: error.message
      });
    }
  });

  /**
   * POST /api/analytics/feedback
   * Log user feedback for a trace
   */
  server.post('/api/analytics/feedback', async (req, res) => {
    try {
      if (!OpikClient.isEnabled()) {
        return res.status(503).json({
          error: 'Analytics service not configured'
        });
      }

      const { traceId, rating, comment, category } = req.body;

      if (!traceId || rating === undefined) {
        return res.status(400).json({
          error: 'Missing required fields: traceId and rating'
        });
      }

      const feedbackId = await OpikClient.logFeedback(
        traceId,
        rating,
        comment,
        category
      );

      if (!feedbackId) {
        return res.status(500).json({
          error: 'Failed to log feedback'
        });
      }

      res.json({
        success: true,
        feedbackId,
        message: 'Feedback logged successfully'
      });
    } catch (error) {
      logger.error('[Analytics] Error logging feedback:', error);
      res.status(500).json({
        error: 'Failed to log feedback',
        message: error.message
      });
    }
  });

  logger.info('[Analytics] Routes registered');
}

module.exports = { registerAnalyticsRoutes };
