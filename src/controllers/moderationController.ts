import { Request, Response, NextFunction } from 'express';
import { ModerationService } from '../services/moderationService';
import { redisClient } from '../utils/redis';
import { ApiError } from '../utils/errors';

const moderationService = new ModerationService(redisClient);

export const moderationController = {
  async moderateText(req: Request, res: Response, next: NextFunction) {
    try {
      const { text } = req.body;
      const result = await moderationService.moderateText(text);
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async moderateImage(req: Request, res: Response, next: NextFunction) {
    try {
      const imageBuffer = req.body.image;
      if (!imageBuffer) {
        throw new ApiError(400, 'Image data is required');
      }

      const result = await moderationService.moderateImage(Buffer.from(imageBuffer));
      res.json(result);
    } catch (error) {
      next(error);
    }
  },

  async moderateBatch(req: Request, res: Response, next: NextFunction) {
    try {
      const { items } = req.body;
      const results = await Promise.all(
        items.map(async (item: any) => {
          if (item.type === 'text') {
            return moderationService.moderateText(item.content);
          } else if (item.type === 'image') {
            return moderationService.moderateImage(Buffer.from(item.content));
          }
          throw new ApiError(400, `Unsupported content type: ${item.type}`);
        })
      );
      res.json(results);
    } catch (error) {
      next(error);
    }
  }
};