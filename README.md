# Content Moderation API

Сontent moderation API built with Node.js, TypeScript, and Express.

> [!WARNING]  
> This project is unfinished, but I'm trying to finish it as soon as possible.

## Features

- Text moderation with customizable profanity lists
- Sentiment analysis
- Spam detection
- NSFW image detection
- API key authentication
- Rate limiting
- Request logging
- Caching with Redis
- Batch processing support

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and configure variables
4. Start Redis server
5. Run development server: `npm run dev`
6. Run tests: `npm test`

## API Documentation

### Endpoints

#### POST /api/v1/moderate/text
Moderates text content for profanity, sentiment, and spam.

```bash
curl -X POST http://localhost:3000/api/v1/moderate/text \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"text": "Hello world"}'
```

#### POST /api/v1/moderate/image
Analyzes images for NSFW content.

```bash
curl -X POST http://localhost:3000/api/v1/moderate/image \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"image": "base64_encoded_image"}'
```

#### POST /api/v1/moderate/batch
Process multiple items in a single request.

```bash
curl -X POST http://localhost:3000/api/v1/moderate/batch \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{"items": [{"type": "text", "content": "Hello"}, {"type": "image", "content": "base64_image"}]}'
```

## Deployment

1. Build the project: `npm run build`
2. Set environment variables
3. Ensure Redis is available
4. Start the server: `npm start`
