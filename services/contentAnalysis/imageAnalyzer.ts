import * as tf from '@tensorflow/tfjs-node';
import * as nsfwjs from 'nsfwjs';
import { ImageAnalysisResult } from '../../types/moderation';
import { logger } from '../../utils/logger';

export class ImageAnalyzer {
  private nsfwModel: nsfwjs.NSFWJS | null = null;
  private objectModel: tf.GraphModel | null = null;
  private faceModel: tf.GraphModel | null = null;

  async initialize() {
    try {
      [this.nsfwModel, this.objectModel, this.faceModel] = await Promise.all([
        nsfwjs.load(),
        tf.loadGraphModel('https://tfhub.dev/tensorflow/ssd_mobilenet_v2/2'),
        tf.loadGraphModel('https://tfhub.dev/tensorflow/tfjs-model/blazeface/1/default/1')
      ]);
      logger.info('Image analysis models loaded successfully');
    } catch (error) {
      logger.error('Failed to load image analysis models:', error);
      throw error;
    }
  }

  async analyze(imageBuffer: Buffer): Promise<ImageAnalysisResult> {
    try {
      const image = await tf.node.decodeImage(imageBuffer, 3);
      
      const [nsfwResults, objectResults, faceResults] = await Promise.all([
        this.analyzeNSFW(image as tf.Tensor3D),
        this.analyzeObjects(image as tf.Tensor3D),
        this.analyzeFaces(image as tf.Tensor3D)
      ]);

      image.dispose();

      return {
        nsfw: nsfwResults,
        objects: objectResults,
        faces: faceResults,
        metadata: {
          dimensions: {
            width: image.shape[1],
            height: image.shape[0]
          },
          format: this.detectImageFormat(imageBuffer),
          size: imageBuffer.length
        }
      };
    } catch (error) {
      logger.error('Image analysis failed:', error);
      throw error;
    }
  }

  private async analyzeNSFW(image: tf.Tensor3D) {
    if (!this.nsfwModel) throw new Error('NSFW model not initialized');

    const predictions = await this.nsfwModel.classify(image);
    return this.processNSFWPredictions(predictions);
  }

  private async analyzeObjects(image: tf.Tensor3D) {
    if (!this.objectModel) throw new Error('Object detection model not initialized');

    const tensor = image.expandDims(0);
    const predictions = await this.objectModel.executeAsync(tensor);
    const results = await this.processObjectDetections(predictions);
    
    tf.dispose(predictions);
    tensor.dispose();

    return results;
  }

  private async analyzeFaces(image: tf.Tensor3D) {
    if (!this.faceModel) throw new Error('Face detection model not initialized');

    const tensor = image.expandDims(0);
    const predictions = await this.faceModel.predict(tensor);
    const results = await this.processFaceDetections(predictions);
    
    tf.dispose(predictions);
    tensor.dispose();

    return results;
  }

  private processNSFWPredictions(predictions: nsfwjs.predictionType[]) {
    const categories = {
      adult: 0,
      suggestive: 0,
      violence: 0,
      hate: 0
    };

    predictions.forEach(pred => {
      switch (pred.className.toLowerCase()) {
        case 'porn':
        case 'hentai':
          categories.adult = Math.max(categories.adult, pred.probability);
          break;
        case 'sexy':
          categories.suggestive = pred.probability;
          break;
        case 'violence':
        case 'gore':
          categories.violence = pred.probability;
          break;
      }
    });

    return {
      categories,
      score: Math.max(...Object.values(categories)),
      predictions: predictions.map(p => ({
        category: p.className,
        confidence: p.probability
      }))
    };
  }

  private async processObjectDetections(predictions: tf.Tensor[]) {
    const [boxes, scores, classes, validDetections] = predictions as tf.Tensor[];
    const detections = [];

    const numDetections = validDetections.dataSync()[0];
    const boxesData = boxes.dataSync();
    const scoresData = scores.dataSync();
    const classesData = classes.dataSync();

    for (let i = 0; i < numDetections; i++) {
      if (scoresData[i] > 0.5) {
        detections.push({
          class: this.getObjectClassName(classesData[i]),
          confidence: scoresData[i],
          bbox: {
            x: boxesData[i * 4],
            y: boxesData[i * 4 + 1],
            width: boxesData[i * 4 + 2] - boxesData[i * 4],
            height: boxesData[i * 4 + 3] - boxesData[i * 4 + 1]
          }
        });
      }
    }

    return detections;
  }

  private async processFaceDetections(predictions: tf.Tensor | tf.Tensor[]) {
    const detections = await (Array.isArray(predictions) ? predictions[0] : predictions).array();
    
    return {
      count: detections.length,
      detections: detections.map((detection: number[]) => ({
        confidence: detection[0],
        bbox: {
          x: detection[1],
          y: detection[2],
          width: detection[3] - detection[1],
          height: detection[4] - detection[2]
        },
        landmarks: detection.slice(5).map((coord, i) => ({
          x: coord,
          y: detection[5 + i + 1]
        }))
      }))
    };
  }

  private getObjectClassName(classId: number): string {
    return this.cocoClasses[classId] || 'unknown';
  }

  private detectImageFormat(buffer: Buffer): string {
    const signatures = {
      jpeg: [0xFF, 0xD8, 0xFF],
      png: [0x89, 0x50, 0x4E, 0x47],
      gif: [0x47, 0x49, 0x46, 0x38],
      webp: [0x52, 0x49, 0x46, 0x46]
    };

    for (const [format, signature] of Object.entries(signatures)) {
      if (signature.every((byte, i) => buffer[i] === byte)) {
        return format;
      }
    }

    return 'unknown';
  }

  private readonly cocoClasses = [
    'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train',
    'truck', 'boat', 'traffic light', 'fire hydrant', 'stop sign',
    'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep',
    'cow', 'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella',
    'handbag', 'tie', 'suitcase', 'frisbee', 'skis', 'snowboard',
    'sports ball', 'kite', 'baseball bat', 'baseball glove', 'skateboard',
    'surfboard', 'tennis racket', 'bottle', 'wine glass', 'cup', 'fork',
    'knife', 'spoon', 'bowl', 'banana', 'apple', 'sandwich', 'orange',
    'broccoli', 'carrot', 'hot dog', 'pizza', 'donut', 'cake', 'chair',
    'couch', 'potted plant', 'bed', 'dining table', 'toilet', 'tv',
    'laptop', 'mouse', 'remote', 'keyboard', 'cell phone', 'microwave',
    'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock', 'vase',
    'scissors', 'teddy bear', 'hair drier', 'toothbrush'
  ];

  async dispose() {
    tf.dispose([this.objectModel, this.faceModel]);
    this.nsfwModel = null;
    this.objectModel = null;
    this.faceModel = null;
  }
}