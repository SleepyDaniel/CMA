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
  spam: SpamAnalysisResult;
  language: {
    detected: string;
    confidence: number;
  };
}

export interface SpamAnalysisResult {
  isSpam: boolean;
  confidence: number;
  categories: string[];
  indicators: {
    repetition: Record<string, number>;
    formatting: {
      allCaps: boolean;
      excessiveSpacing: number;
      longLines: number;
    };
    links: {
      count: number;
      density: number;
      suspicious: number;
    };
    patterns: {
      monetization: number;
      urgency: number;
      deception: number;
    };
  };
}

export interface ImageAnalysisResult {
  nsfw: {
    score: number;
    categories: {
      adult: number;
      suggestive: number;
      violence: number;
      hate: number;
    };
    predictions: Array<{
      category: string;
      confidence: number;
    }>;
  };
  objects: Array<{
    class: string;
    confidence: number;
    bbox: BoundingBox;
  }>;
  faces: {
    count: number;
    detections: Array<{
      confidence: number;
      bbox: BoundingBox;
      landmarks: Array<Point>;
    }>;
  };
  metadata: {
    dimensions: {
      width: number;
      height: number;
    };
    format: string;
    size: number;
  };
}

export interface SpamDetectionConfig {
  thresholds: {
    spam: number;
    repetition: number;
    linkDensity: number;
    monetization: number;
    urgency: number;
    deception: number;
  };
  patterns: {
    monetization: RegExp[];
    urgency: RegExp[];
    deception: RegExp[];
  };
}

interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Point {
  x: number;
  y: number;
}