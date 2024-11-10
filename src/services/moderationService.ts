import { LanguageServiceClient } from '@google-cloud/language';
import { TextAnalyticsClient, AzureKeyCredential } from '@azure/ai-text-analytics';
import { PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import { Redis } from 'ioredis';
import { Queue } from 'bull';
import { logger } from '../utils/logger';
import { ApiError } from '../utils/errors';
import { config } from '../config';
import { 
  TextModerationResult, 
  ImageAnalysisResult, 
  SpamDetectionConfig 
} from '../types/moderation';
import { ProfanityAnalyzer } from './contentAnalysis/profanityAnalyzer';
import { SpamAnalyzer } from './contentAnalysis/spamAnalyzer';
import { ImageAnalyzer } from './contentAnalysis/imageAnalyzer';

export class ModerationService {
  private languageClient: LanguageServiceClient;
  private textAnalyticsClient: TextAnalyticsClient;
  private moderationQueue: Queue;
  private prisma: PrismaClient;
  private redis: Redis;
  private profanityAnalyzer: ProfanityAnalyzer;
  private spamAnalyzer: SpamAnalyzer;
  private imageAnalyzer: ImageAnalyzer;

  constructor() {
    this.initializeServices();
  }

  private async initializeServices() {
    try {
      // Initialize NLP clients
      this.languageClient = new LanguageServiceClient();
      this.textAnalyticsClient = new TextAnalyticsClient(
        config.azure.endpoint,
        new AzureKeyCredential(config.azure.apiKey)
      );

      // Initialize database and cache
      this.prisma = new PrismaClient();
      this.redis = new Redis(config.redis.url);

      // Initialize content analyzers
      this.profanityAnalyzer = new ProfanityAnalyzer();
      this.spamAnalyzer = new SpamAnalyzer(this.getSpamConfig());
      this.imageAnalyzer = new ImageAnalyzer();
      await this.imageAnalyzer.initialize();

      // Initialize job queue
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

  private getSpamConfig(): SpamDetectionConfig {
    return {
      thresholds: {
        spam: 0.7,
        repetition: 0.3,
        linkDensity: 0.1,
        monetization: 0.4,
        urgency: 0.3,
        deception: 0.3
      },
      patterns: {
        monetization: [
          /\b(free|discount|save|offer|deal|limited[- ]time)\b/gi,
          /\b(\d+%|percent)\s+off\b/gi
        ],
        urgency: [
          /\b(urgent|hurry|limited|expires?|ending)\b/gi,
          /\b(today|now|soon)\s+only\b/gi
        ],
        deception: [
          /\b(guarantee|promise|risk[- ]free)\b/gi,
          /\b(no\s+risk|100%|absolutely)\b/gi
        ]
      }
    };
  }

  private async setupQueueProcessors() {
    this.moderationQueue.process(async (job) => {
      const { content, type } = job.data;
      return type === 'text' ? 
        await this.processTextModeration(content) :
        await this.processImageModeration(content);
    });

    this.moderationQueue.on('failed', (job, error) => {
      logger.error('Moderation job failed:', {
        jobId: job.id,
        type: job.data.type,
        error: error.message
      });
    });
  }

  async moderateText(text: string, options = {}): Promise<TextModerationResult> {
    const hash = this.generateHash(text);
    const cacheKey = `moderation:text:${hash}`;

    try {
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
    } catch (error) {
      logger.error('Text moderation failed:', error);
      throw new ApiError(500, 'Content moderation failed');
    }
  }

  async moderateImage(imageBuffer: Buffer, options = {}): Promise<ImageAnalysisResult> {
    const hash = this.generateHash(imageBuffer.toString('base64'));
    const cacheKey = `moderation:image:${hash}`;

    try {
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
        return existing.results as ImageAnalysisResult;
      }

      // Process new content
      const result = await this.imageAnalyzer.analyze(imageBuffer);

      // Store results
      await this.prisma.contentClassification.create({
        data: {
          content: hash,
          contentType: 'image',
          hash,
          results: result,
          metadata: options
        }
      });

      await this.redis.set(cacheKey, JSON.stringify(result), 'EX', config.redis.ttl);
      return result;
    } catch (error) {
      logger.error('Image moderation failed:', error);
      throw new ApiError(500, 'Image moderation failed');
    }
  }

  private async processTextModeration(text: string): Promise<TextModerationResult> {
    try {
      const [
        sentimentResult,
        contentSafetyResult,
        languageResult,
        profanityResult,
        spamResult
      ] = await Promise.all([
        this.analyzeSentiment(text),
        this.analyzeContentSafety(text),
        this.detectLanguage(text),
        this.profanityAnalyzer.analyze(text),
        this.spamAnalyzer.analyze(text)
      ]);

      return {
        classifications: this.generateClassifications(contentSafetyResult),
        toxicity: {
          score: contentSafetyResult.categories.negative,
          categories: {
            hate: contentSafetyResult.categories.negative * 0.8,
            harassment: contentSafetyResult.categories.negative * 0.6,
            profanity: profanityResult.score,
            threat: contentSafetyResult.categories.negative * 0.7
          }
        },
        sentiment: {
          score: sentimentResult.score,
          magnitude: sentimentResult.magnitude,
          label: this.getSentimentLabel(sentimentResult.score)
        },
        spam: spamResult,
        language: {
          detected: languageResult.language,
          confidence: languageResult.confidence
        }
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
      harmful: results[0].confidenceScores.negative > 0.7
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

  private generateClassifications(contentSafety: any) {
    return Object.entries(contentSafety.categories).map(([category, confidence]) => ({
      category,
      confidence: confidence as number
    }));
  }

  private getSentimentLabel(score: number): 'positive' | 'negative' | 'neutral' {
    if (score > 0.2) return 'positive';
    if (score < -0.2) return 'negative';
    return 'neutral';
  }

  private generateHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  async shutdown() {
    await Promise.all([
      this.prisma.$disconnect(),
      this.redis.quit(),
      this.moderationQueue.close(),
      this.imageAnalyzer.dispose()
    ]);
  }
}