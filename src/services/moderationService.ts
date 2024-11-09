import { LanguageServiceClient } from '@google-cloud/language';
import { TextAnalyticsClient, AzureKeyCredential } from '@azure/ai-text-analytics';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { logger } from '../utils/logger';
import { TextModerationResult, ImageModerationResult } from '../types/moderation';
import { config } from '../config';
import { ApiError } from '../utils/errors';
import { Queue } from 'bull';
import { Redis } from 'ioredis';

export class ModerationService {
  private languageClient: LanguageServiceClient;
  private textAnalyticsClient: TextAnalyticsClient;
  private moderationQueue: Queue;
  private prisma: PrismaClient;
  private redis: Redis;

  constructor() {
    this.initializeServices();
  }

  private async initializeServices() {
    try {
      this.languageClient = new LanguageServiceClient();
      this.textAnalyticsClient = new TextAnalyticsClient(
        config.azure.endpoint,
        new AzureKeyCredential(config.azure.apiKey)
      );
      this.prisma = new PrismaClient();
      this.redis = new Redis(config.redis.url);
      this.moderationQueue = new Queue('content-moderation', {
        redis: { host: config.redis.host, port: config.redis.port }
      });

      await this.setupQueueProcessors();
      logger.info('Moderation services initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize moderation services:', error);
      throw new Error('Service initialization failed');
    }
  }

  private async setupQueueProcessors() {
    this.moderationQueue.process(async (job) => {
      const { content, type } = job.data;
      return type === 'text' ? 
        await this.processTextModeration(content) :
        await this.processImageModeration(content);
    });
  }

  async moderateText(text: string, options = {}): Promise<TextModerationResult> {
    const hash = this.generateHash(text);
    const cacheKey = `moderation:text:${hash}`;

    // Check cache
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Check database
    const existing = await this.prisma.contentClassification.findUnique({
      where: { hash }
    });

    if (existing) {
      await this.redis.set(cacheKey, JSON.stringify(existing.results), 'EX', config.redis.ttl);
      return existing.results as TextModerationResult;
    }

    // Process new content
    const result = await this.processTextModeration(text);

    // Store results
    await this.prisma.contentClassification.create({
      data: {
        content: text,
        contentType: 'text',
        hash,
        results: result,
        metadata: options
      }
    });

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', config.redis.ttl);
    return result;
  }

  private async processTextModeration(text: string): Promise<TextModerationResult> {
    try {
      const [
        sentimentResult,
        contentSafetyResult,
        languageResult
      ] = await Promise.all([
        this.analyzeSentiment(text),
        this.analyzeContentSafety(text),
        this.detectLanguage(text)
      ]);

      return {
        sentiment: sentimentResult,
        contentSafety: contentSafetyResult,
        language: languageResult,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Text moderation processing failed:', error);
      throw new ApiError(500, 'Content moderation failed');
    }
  }

  private async analyzeSentiment(text: string) {
    const [result] = await this.languageClient.analyzeSentiment({
      document: { content: text, type: 'PLAIN_TEXT' }
    });
    return {
      score: result.documentSentiment?.score || 0,
      magnitude: result.documentSentiment?.magnitude || 0
    };
  }

  private async analyzeContentSafety(text: string) {
    const results = await this.textAnalyticsClient.analyzeSentiment([text]);
    return {
      categories: results[0].confidenceScores,
      harmful: results[0].confidenceScores.negative > 0.7,
      moderationFlags: this.extractModerationFlags(results[0])
    };
  }

  private async detectLanguage(text: string) {
    const [result] = await this.languageClient.detectLanguage({
      content: text
    });
    return {
      language: result.languages?.[0]?.languageCode || 'unknown',
      confidence: result.languages?.[0]?.confidence || 0
    };
  }

  private generateHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private extractModerationFlags(result: any) {
    const flags = [];
    if (result.confidenceScores.negative > 0.7) flags.push('toxic');
    if (result.confidenceScores.neutral > 0.8) flags.push('spam');
    return flags;
  }

  async shutdown() {
    await Promise.all([
      this.prisma.$disconnect(),
      this.redis.quit(),
      this.moderationQueue.close()
    ]);
  }
}