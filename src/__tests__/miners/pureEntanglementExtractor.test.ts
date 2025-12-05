import { describe, it, expect } from 'vitest';
import { canonicalize, canonicalizeStars, extractPureEntanglements } from '../../miners/pureEntanglementExtractor';
import { Output } from '../../types';
import type { Point } from '../../miners/pureEntanglementExtractor';

describe('PureEntanglementExtractor', () => {
  describe('canonicalizeStars', () => {
    it('should canonicalize star pair', () => {
      const stars: Point[] = [[1, 2], [3, 4]];
      const result = canonicalizeStars(stars);
      
      expect(result.canonicalStars).toHaveLength(2);
      expect(result.translation).toBeDefined();
      expect(result.transformIndex).toBeGreaterThanOrEqual(0);
      expect(result.transformIndex).toBeLessThan(8);
    });

    it('should throw error for non-pair stars', () => {
      const stars: Point[] = [[1, 2]];
      expect(() => canonicalizeStars(stars)).toThrow('canonicalizeStars expects exactly 2 stars');
    });
  });

  describe('canonicalize', () => {
    it('should canonicalize points with stars and cells', () => {
      const stars: Point[] = [[1, 2], [3, 4]];
      const cells: Point[] = [[0, 0], [5, 5]];
      const result = canonicalize(stars, cells);
      
      expect(result.canonicalStars).toHaveLength(2);
      expect(result.canonicalCells).toHaveLength(2);
      expect(result.transformIndex).toBeGreaterThanOrEqual(0);
      expect(result.transformIndex).toBeLessThan(8);
    });

    it('should throw error for empty stars', () => {
      expect(() => canonicalize([], [])).toThrow('canonicalize expects at least one star');
    });
  });

  describe('extractPureEntanglements', () => {
    it('should extract pure entanglements from output', () => {
      const output: Output = {
        board_size: 4,
        stars_per_row: 1,
        stars_per_column: 1,
        initial_star_count: 2,
        total_solutions: 4,
        patterns: [
          {
            initial_stars: [{ row: 0, col: 0 }, { row: 2, col: 2 }],
            compatible_solutions: 1,
            forced_empty: [{ row: 0, col: 1 }, { row: 1, col: 0 }],
            forced_star: [],
          },
        ],
      };

      const result = extractPureEntanglements(output, 1);
      
      expect(result.board_size).toBe(4);
      expect(result.initial_stars).toBe(2);
      expect(result.pure_entanglement_templates).toBeDefined();
    });

    it('should filter by minOccurrences', () => {
      const output: Output = {
        board_size: 4,
        stars_per_row: 1,
        stars_per_column: 1,
        initial_star_count: 2,
        total_solutions: 4,
        patterns: [
          {
            initial_stars: [{ row: 0, col: 0 }, { row: 2, col: 2 }],
            compatible_solutions: 1,
            forced_empty: [{ row: 0, col: 1 }],
            forced_star: [],
          },
        ],
      };

      const result = extractPureEntanglements(output, 2);
      
      // Should filter out patterns with less than 2 occurrences
      expect(result.pure_entanglement_templates.length).toBe(0);
    });
  });
});

