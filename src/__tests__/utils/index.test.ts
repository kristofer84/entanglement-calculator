import { describe, it, expect } from 'vitest';
import { calculateIterations, formatNumber } from '../../utils';

describe('Utils', () => {
  describe('calculateIterations', () => {
    it('should calculate iterations for given board size and pattern size', () => {
      const result = calculateIterations(10, 2);
      
      expect(result.patterns).toBeGreaterThan(0);
      expect(result.solutions).toBeGreaterThan(0);
    });

    it('should return larger pattern count for larger boards', () => {
      const small = calculateIterations(5, 2);
      const large = calculateIterations(10, 2);
      
      expect(large.patterns).toBeGreaterThan(small.patterns);
    });

    it('should return larger pattern count for larger pattern sizes', () => {
      const small = calculateIterations(10, 1);
      const large = calculateIterations(10, 2);
      
      expect(large.patterns).toBeGreaterThan(small.patterns);
    });
  });

  describe('formatNumber', () => {
    it('should format numbers with commas', () => {
      expect(formatNumber(1000)).toBe('1,000');
      expect(formatNumber(1000000)).toBe('1,000,000');
    });

    it('should format small numbers without commas', () => {
      expect(formatNumber(100)).toBe('100');
      expect(formatNumber(42)).toBe('42');
    });
  });
});

