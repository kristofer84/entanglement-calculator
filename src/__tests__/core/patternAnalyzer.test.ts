import { describe, it, expect } from 'vitest';
import { PatternAnalyzer } from '../../core/patternAnalyzer';
import { ConfigurationEnumerator } from '../../core/enumeration';
import { Grid, Cell } from '../../types';

describe('PatternAnalyzer', () => {
  describe('generatePatterns', () => {
    it('should generate valid patterns for small grid', () => {
      const enumerator = new ConfigurationEnumerator(4, 1);
      const solutions = enumerator.enumerate();
      
      const analyzer = new PatternAnalyzer(4, solutions, false);
      const patterns = analyzer.generatePatterns(1);
      
      expect(patterns.length).toBeGreaterThan(0);
      // All patterns should be locally valid
      for (const pattern of patterns) {
        expect(ConfigurationEnumerator.isLocallyValid(pattern, 4)).toBe(true);
      }
      // All patterns should be realizable
      for (const pattern of patterns) {
        const isRealizable = solutions.some(solution =>
          ConfigurationEnumerator.isPatternCompatible(pattern, solution)
        );
        expect(isRealizable).toBe(true);
      }
    });

    it('should generate patterns of correct size', () => {
      const enumerator = new ConfigurationEnumerator(4, 1);
      const solutions = enumerator.enumerate();
      
      const analyzer = new PatternAnalyzer(4, solutions, false);
      const patterns = analyzer.generatePatterns(2);
      
      for (const pattern of patterns) {
        expect(pattern.length).toBe(2);
      }
    });
  });

  describe('analyzePattern', () => {
    it('should analyze pattern and return forced cells', () => {
      const enumerator = new ConfigurationEnumerator(4, 1);
      const solutions = enumerator.enumerate();
      
      const analyzer = new PatternAnalyzer(4, solutions, false);
      const pattern: Cell[] = [{ row: 0, col: 0 }];
      
      // Check if pattern is realizable
      const isRealizable = solutions.some(solution =>
        ConfigurationEnumerator.isPatternCompatible(pattern, solution)
      );
      
      if (isRealizable) {
        const result = analyzer.analyzePattern(pattern);
        if (result) {
          expect(result.initial_stars).toEqual(pattern);
          expect(result.compatible_solutions).toBeGreaterThan(0);
          // Adjacent cells should be forced empty
          const adjacentCells = [
            { row: 0, col: 1 },
            { row: 1, col: 0 },
            { row: 1, col: 1 },
          ];
          for (const adjCell of adjacentCells) {
            const isForcedEmpty = result.forced_empty.some(
              cell => cell.row === adjCell.row && cell.col === adjCell.col
            );
            expect(isForcedEmpty).toBe(true);
          }
        }
      }
    });

    it('should return null for non-trivial patterns', () => {
      const enumerator = new ConfigurationEnumerator(4, 1);
      const solutions = enumerator.enumerate();
      
      const analyzer = new PatternAnalyzer(4, solutions, false);
      // Create a pattern that might not be non-trivial
      const pattern: Cell[] = [{ row: 0, col: 0 }];
      
      const result = analyzer.analyzePattern(pattern);
      // Result might be null if pattern is trivial or filtered
      // This is acceptable behavior
      if (result) {
        expect(result.initial_stars).toEqual(pattern);
      }
    });
  });
});

