const Joi = require('joi');

// Common validation schemas
const commonSchemas = {
  // User ID validation
  userId: Joi.string().min(1).max(255).required(),
  
  // Room ID validation
  roomId: Joi.string().min(1).max(255).required(),
  
  // Message ID validation
  messageId: Joi.string().min(1).max(255).required(),
  
  // Email validation
  email: Joi.string().email().required(),
  
  // Display name validation
  displayName: Joi.string().min(2).max(100).required(),
  
  // Password validation
  password: Joi.string().min(6).max(128).required(),
  
  // Language code validation
  languageCode: Joi.string().length(2).pattern(/^[a-z]{2}$/),
  
  // Timezone validation
  timezone: Joi.string().max(50),
  
  // URL validation
  url: Joi.string().uri().max(2048),
  
  // Pagination validation
  pagination: Joi.object({
    limit: Joi.number().min(1).max(100).default(20),
    offset: Joi.number().min(0).default(0),
  }),
  
  // Timestamp validation
  timestamp: Joi.string().isoDate(),
  
  // JSON metadata validation
  metadata: Joi.object().unknown(true),
};

// Message validation schemas
const messageSchemas = {
  content: Joi.string().min(1).max(4000).required(),
  messageType: Joi.string().valid('text', 'image', 'file', 'system').default('text'),
  replyTo: Joi.string().min(1).max(255),
  metadata: commonSchemas.metadata,
};

// Room validation schemas
const roomSchemas = {
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().max(500),
  roomType: Joi.string().valid('direct', 'group', 'channel').default('group'),
  participantIds: Joi.array().items(commonSchemas.userId).min(1).max(100),
  settings: commonSchemas.metadata,
};

// User validation schemas
const userSchemas = {
  email: commonSchemas.email,
  password: commonSchemas.password,
  displayName: commonSchemas.displayName,
  avatarUrl: commonSchemas.url,
  languagePreference: commonSchemas.languageCode,
  timezone: commonSchemas.timezone,
  status: Joi.string().valid('available', 'busy', 'away', 'invisible'),
  customStatus: Joi.string().max(100),
};

// Vector search validation schemas
const vectorSchemas = {
  query: Joi.string().min(1).max(1000).required(),
  contentType: Joi.string().valid('message', 'user_profile', 'room_description', 'all').default('all'),
  limit: Joi.number().min(1).max(50).default(10),
  content: Joi.string().min(1).max(10000).required(),
  contentId: commonSchemas.messageId,
};

// State management validation schemas
const stateSchemas = {
  isOnline: Joi.boolean(),
  lastSeen: commonSchemas.timestamp,
  currentRoom: commonSchemas.roomId,
  typingIn: commonSchemas.roomId,
  status: Joi.string().valid('available', 'busy', 'away', 'invisible'),
  customStatus: Joi.string().max(100),
  isTyping: Joi.array().items(commonSchemas.userId),
  activeUsers: Joi.array().items(commonSchemas.userId),
  lastActivity: commonSchemas.timestamp,
  messageCount: Joi.number().min(0),
};

// Validation helper functions
const validateRequest = (schema, data) => {
  const { error, value } = schema.validate(data, {
    abortEarly: false,
    stripUnknown: true,
  });
  
  if (error) {
    const errorDetails = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value,
    }));
    
    throw new Error(`Validation failed: ${errorDetails.map(e => e.message).join(', ')}`);
  }
  
  return value;
};

const validateQuery = (schema, query) => {
  return validateRequest(schema, query);
};

const validateBody = (schema, body) => {
  return validateRequest(schema, body);
};

const validateParams = (schema, params) => {
  return validateRequest(schema, params);
};

// Middleware factory for validation
const createValidationMiddleware = (schema, source = 'body') => {
  return (req, res, next) => {
    try {
      const data = source === 'body' ? req.body : 
                   source === 'query' ? req.query : 
                   source === 'params' ? req.params : req.body;
      
      const validatedData = validateRequest(schema, data);
      
      // Replace the original data with validated data
      if (source === 'body') req.body = validatedData;
      else if (source === 'query') req.query = validatedData;
      else if (source === 'params') req.params = validatedData;
      
      next();
    } catch (error) {
      res.status(400).json({
        error: 'Validation failed',
        message: error.message,
      });
    }
  };
};

// Sanitization functions
const sanitizeString = (str, maxLength = 1000) => {
  if (typeof str !== 'string') return '';
  return str.trim().substring(0, maxLength);
};

const sanitizeEmail = (email) => {
  if (typeof email !== 'string') return '';
  return email.toLowerCase().trim();
};

const sanitizeUrl = (url) => {
  if (typeof url !== 'string') return '';
  try {
    const urlObj = new URL(url);
    return urlObj.toString();
  } catch {
    return '';
  }
};

const sanitizeMetadata = (metadata) => {
  if (typeof metadata !== 'object' || metadata === null) return {};
  
  // Remove any potentially dangerous properties
  const sanitized = { ...metadata };
  delete sanitized.__proto__;
  delete sanitized.constructor;
  delete sanitized.prototype;
  
  return sanitized;
};

module.exports = {
  schemas: {
    common: commonSchemas,
    message: messageSchemas,
    room: roomSchemas,
    user: userSchemas,
    vector: vectorSchemas,
    state: stateSchemas,
  },
  validateRequest,
  validateQuery,
  validateBody,
  validateParams,
  createValidationMiddleware,
  sanitizeString,
  sanitizeEmail,
  sanitizeUrl,
  sanitizeMetadata,
};