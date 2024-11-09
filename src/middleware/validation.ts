import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ApiError } from '../utils/errors';

const textSchema = Joi.object({
  text: Joi.string().required().max(10000)
});

const imageSchema = Joi.object({
  image: Joi.binary().required().max(5 * 1024 * 1024) // 5MB limit
});

export const validateModerateTextRequest = (req: Request, res: Response, next: NextFunction) => {
  const { error } = textSchema.validate(req.body);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }
  next();
};

export const validateModerateImageRequest = (req: Request, res: Response, next: NextFunction) => {
  const { error } = imageSchema.validate(req.body);
  if (error) {
    throw new ApiError(400, error.details[0].message);
  }
  next();
};