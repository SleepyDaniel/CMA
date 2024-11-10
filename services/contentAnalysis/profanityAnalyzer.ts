import { readFileSync } from 'fs';
import path from 'path';
import { logger } from '../../utils/logger';

export class ProfanityAnalyzer {
  private profanityData: {
    words: Set<string>;
    patterns: RegExp[];
    severityLevels: Map<string, number>;
  };

  constructor() {
    this.profanityData = this.loadProfanityData();
  }

  private loadProfanityData() {
    try {
      const data = JSON.parse(
        readFileSync(path.join(__dirname, '../../data/profanity-rules.json'), 'utf-8')
      );

      return {
        words: new Set(data.words),
        patterns: data.patterns.map((p: string) => new RegExp(p, 'gi')),
        severityLevels: new Map(Object.entries(data.severityLevels))
      };
    } catch (error) {
      logger.error('Failed to load profanity data:', error);
      return { words: new Set(), patterns: [], severityLevels: new Map() };
    }
  }

  analyze(text: string) {
    const words = text.toLowerCase().split(/\s+/);
    const matches = new Map<string, number>();
    let totalSeverity = 0;
    let matchCount = 0;

    // Check exact matches
    words.forEach(word => {
      if (this.profanityData.words.has(word)) {
        matches.set(word, (matches.get(word) || 0) + 1);
        matchCount++;
        totalSeverity += this.profanityData.severityLevels.get(word) || 1;
      }
    });

    // Check patterns
    this.profanityData.patterns.forEach(pattern => {
      const patternMatches = text.match(pattern) || [];
      matchCount += patternMatches.length;
    });

    const score = matchCount > 0 ? totalSeverity / (words.length * 3) : 0;

    return {
      score: Math.min(score, 1),
      matches: Object.fromEntries(matches),
      severity: totalSeverity / (matchCount || 1),
      containsProfanity: matchCount > 0
    };
  }
}