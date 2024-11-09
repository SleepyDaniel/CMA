export interface ContentClassification {
  category: string;
  confidence: number;
}

export interface TextModerationResult {
  classifications: ContentClassification[];
  toxicity: {
    score: number;
    categories: {
      hate: number;
      harassment: number;
      profanity: number;
      threat: number;
    };
  };
  sentiment: {
    score: number;
    magnitude: number;
    label: 'positive' | 'negative' | 'neutral';
  };
  spam: {
    isSpam: boolean;
    confidence: number;
    categories: string[];
  };
  language: {
    detected: string;
    confidence: number;
  };
}

export interface ImageModerationResult {
  nsfw: {
    score: number;
    categories: {
      adult: number;
      suggestive: number;
      violence: number;
      hate: number;
    };
  };
  objects: {
    name: string;
    confidence: number;
  }[];
  faces: {
    count: number;
    details: {
      confidence: number;
      boundingBox: {
        x: number;
        y: number;
        width: number;
        height: number;
      };
    }[];
  };
}

export interface ModerationConfig {
  minConfidenceThreshold: number;
  maxContentLength: number;
  supportedLanguages: string[];
  cacheExpiration: number;
  batchSize: number;
}