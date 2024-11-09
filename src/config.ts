import dotenv from 'dotenv';
import { CorsOptions } from 'cors';

dotenv.config();

export const config = {
  app: {
    env: process.env.NODE_ENV,
    port: parseInt(process.env.PORT || '3000', 10),
    apiVersion: 'v1',
    rateLimitWindow: 15 * 60 * 1000, // 15 minutes
    rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100', 10)
  },
  
  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: '24h',
    apiKeys: new Set(process.env.API_KEYS?.split(',') || [])
  },

  google: {
    projectId: process.env.GOOGLE_PROJECT_ID,
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS || '{}')
  },

  azure: {
    endpoint: process.env.AZURE_ENDPOINT || '',
    apiKey: process.env.AZURE_API_KEY || ''
  },

  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    ttl: 3600, // 1 hour cache TTL
    prefix: 'moderation:'
  },

  database: {
    url: process.env.DATABASE_URL
  },

  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining']
  } as CorsOptions,

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    pretty: process.env.NODE_ENV !== 'production'
  },

  monitoring: {
    enabled: true,
    metricsInterval: 60000,
    healthCheckPath: '/health'
  }
};