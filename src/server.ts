import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { router } from './routes';
import { errorHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { validateApiKey } from './middleware/auth';
import { config } from './config';
import { logger } from './utils/logger';

const app = express();

app.use(helmet());
app.use(cors(config.cors));
app.use(express.json({ limit: '10mb' }));

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

app.use(requestLogger);
app.use(validateApiKey);

app.use('/api/v1', router);

app.use(errorHandler);

const PORT = config.app.port || 3000;

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

export default app;