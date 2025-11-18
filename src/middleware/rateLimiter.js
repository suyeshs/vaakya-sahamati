const { RateLimitError } = require('../utils/errors');
const { logWarn } = require('../utils/logger');

// In-memory rate limiter (for development)
// In production, use Redis or similar distributed cache
class RateLimiter {
  constructor() {
    this.requests = new Map();
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Clean up every minute
  }

  // Clean up expired entries
  cleanup() {
    const now = Date.now();
    for (const [key, data] of this.requests.entries()) {
      if (now - data.windowStart > data.windowMs) {
        this.requests.delete(key);
      }
    }
  }

  // Check if request is allowed
  isAllowed(key, limit, windowMs) {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const requestKey = `${key}:${windowStart}`;

    const current = this.requests.get(requestKey) || {
      count: 0,
      windowStart,
    };

    if (now - current.windowStart > windowMs) {
      // New window
      current.count = 1;
      current.windowStart = windowStart;
    } else {
      current.count++;
    }

    this.requests.set(requestKey, current);

    return {
      allowed: current.count <= limit,
      remaining: Math.max(0, limit - current.count),
      resetTime: current.windowStart + windowMs,
      totalHits: current.count,
    };
  }

  // Destroy the rate limiter
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.requests.clear();
  }
}

// Global rate limiter instance
const rateLimiter = new RateLimiter();

// Rate limiting middleware factory
const createRateLimit = (options = {}) => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes
    max = 100, // limit each IP to 100 requests per windowMs
    message = 'Too many requests',
    keyGenerator = (req) => req.ip, // Use IP as default key
    skipSuccessfulRequests = false,
    skipFailedRequests = false,
    onLimitReached = null,
  } = options;

  return (req, res, next) => {
    try {
      const key = keyGenerator(req);
      const result = rateLimiter.isAllowed(key, max, windowMs);

      // Set rate limit headers
      res.set({
        'X-RateLimit-Limit': max,
        'X-RateLimit-Remaining': result.remaining,
        'X-RateLimit-Reset': new Date(result.resetTime).toISOString(),
      });

      if (!result.allowed) {
        logWarn('Rate limit exceeded', {
          ip: req.ip,
          key,
          totalHits: result.totalHits,
          limit: max,
          windowMs,
        });

        if (onLimitReached) {
          onLimitReached(req, res, result);
        }

        throw new RateLimitError(message);
      }

      // Skip counting successful/failed requests if configured
      if (skipSuccessfulRequests || skipFailedRequests) {
        const originalSend = res.send;
        res.send = function(data) {
          const isSuccess = res.statusCode < 400;
          
          if ((skipSuccessfulRequests && isSuccess) || 
              (skipFailedRequests && !isSuccess)) {
            // Don't count this request
            const key = keyGenerator(req);
            const current = rateLimiter.requests.get(`${key}:${Math.floor(Date.now() / windowMs) * windowMs}`);
            if (current) {
              current.count = Math.max(0, current.count - 1);
            }
          }
          
          originalSend.call(this, data);
        };
      }

      next();
    } catch (error) {
      next(error);
    }
  };
};

// Predefined rate limiters
const rateLimiters = {
  // General API rate limiter
  api: createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // 1000 requests per 15 minutes
    message: 'API rate limit exceeded',
  }),

  // Authentication rate limiter (stricter)
  auth: createRateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 auth attempts per 15 minutes
    message: 'Authentication rate limit exceeded',
    keyGenerator: (req) => `${req.ip}:auth`,
  }),

  // Message sending rate limiter
  messages: createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60, // 60 messages per minute
    message: 'Message rate limit exceeded',
    keyGenerator: (req) => `${req.user?.uid || req.ip}:messages`,
  }),

  // Search rate limiter
  search: createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 searches per minute
    message: 'Search rate limit exceeded',
    keyGenerator: (req) => `${req.user?.uid || req.ip}:search`,
  }),

  // Vector search rate limiter (more restrictive)
  vectorSearch: createRateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10, // 10 vector searches per minute
    message: 'Vector search rate limit exceeded',
    keyGenerator: (req) => `${req.user?.uid || req.ip}:vector`,
  }),

  // User creation rate limiter
  userCreation: createRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 user creations per hour per IP
    message: 'User creation rate limit exceeded',
    keyGenerator: (req) => `${req.ip}:user-creation`,
  }),

  // Room creation rate limiter
  roomCreation: createRateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20, // 20 rooms per hour per user
    message: 'Room creation rate limit exceeded',
    keyGenerator: (req) => `${req.user?.uid || req.ip}:room-creation`,
  }),
};

// Cleanup on process exit
process.on('SIGINT', () => {
  rateLimiter.destroy();
});

process.on('SIGTERM', () => {
  rateLimiter.destroy();
});

module.exports = {
  createRateLimit,
  rateLimiters,
  RateLimiter,
};