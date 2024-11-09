import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { ApiError } from '../utils/errors';

export const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.header('X-API-Key');

  if (!apiKey || !config.apiKeys.has(apiKey)) {
    throw new ApiError(401, 'Invalid API key');
  }

  next();
};