import { Router } from 'express';
import { moderationController } from '../controllers/moderationController';
import { validateModerateTextRequest, validateModerateImageRequest } from '../middleware/validation';

export const router = Router();

router.post('/moderate/text',
  validateModerateTextRequest,
  moderationController.moderateText
);

router.post('/moderate/image',
  validateModerateImageRequest,
  moderationController.moderateImage
);

router.post('/moderate/batch',
  moderationController.moderateBatch
);