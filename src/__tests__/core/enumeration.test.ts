import { describe, it, expect } from 'vitest';
import { ConfigurationEnumerator } from '../../core/enumeration';
import { Grid, Cell } from '../../types';

describe('ConfigurationEnumerator', () => {
  describe('isLocallyValid', () => {
    it('should return true for non-adjacent cells', () => {
      const cells: Cell[] = [
        { row: 0, col: 0 },
        { row: 2, col: 2 },
      ];
      expect(ConfigurationEnumerator.isLocallyValid(cells, 10)).toBe(true);
    });

    it('should return false for adjacent cells horizontally', () => {
      const cells: Cell[] = [
        { row: 0, col: 0 },
        { row: 0, col: 1 },
      ];
      expect(ConfigurationEnumerator.isLocallyValid(cells, 10)).toBe(false);
    });

    it('should return false for adjacent cells vertically', () => {
      const cells: Cell[] = [
        { row: 0, col: 0 },
        { row: 1, col: 0 },
      ];
      expect(ConfigurationEnumerator.isLocallyValid(cells, 10)).toBe(false);
    });

    it('should return false for diagonally adjacent cells', () => {
      const cells: Cell[] = [
        { row: 0, col: 0 },
        { row: 1, col: 1 },
      ];
      expect(ConfigurationEnumerator.isLocallyValid(cells, 10)).toBe(false);
    });

    it('should return true for empty array', () => {
      expect(ConfigurationEnumerator.isLocallyValid([], 10)).toBe(true);
    });
  });

  describe('isPatternCompatible', () => {
    it('should return true when all pattern cells are stars in solution', () => {
      const pattern: Cell[] = [
        { row: 0, col: 0 },
        { row: 2, col: 2 },
      ];
      const solution: Grid = [
        [1, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 0],
      ];
      expect(ConfigurationEnumerator.isPatternCompatible(pattern, solution)).toBe(true);
    });

    it('should return false when any pattern cell is not a star', () => {
      const pattern: Cell[] = [
        { row: 0, col: 0 },
        { row: 2, col: 2 },
      ];
      const solution: Grid = [
        [1, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ];
      expect(ConfigurationEnumerator.isPatternCompatible(pattern, solution)).toBe(false);
    });

    it('should return true for empty pattern', () => {
      const pattern: Cell[] = [];
      const solution: Grid = [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ];
      expect(ConfigurationEnumerator.isPatternCompatible(pattern, solution)).toBe(true);
    });
  });

  describe('enumerate', () => {
    it('should enumerate solutions for small grid', () => {
      const enumerator = new ConfigurationEnumerator(4, 1);
      const solutions = enumerator.enumerate();
      expect(solutions.length).toBeGreaterThan(0);
      // Verify each solution is valid
      for (const solution of solutions) {
        // Check row constraints
        for (let row = 0; row < 4; row++) {
          const starsInRow = solution[row].reduce((sum, val) => sum + val, 0);
          expect(starsInRow).toBe(1);
        }
        // Check column constraints
        for (let col = 0; col < 4; col++) {
          let starsInCol = 0;
          for (let row = 0; row < 4; row++) {
            starsInCol += solution[row][col];
          }
          expect(starsInCol).toBe(1);
        }
        // Check adjacency (no two stars adjacent)
        for (let row = 0; row < 4; row++) {
          for (let col = 0; col < 4; col++) {
            if (solution[row][col] === 1) {
              // Check all 8 neighbors
              for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                  if (dr === 0 && dc === 0) continue;
                  const nr = row + dr;
                  const nc = col + dc;
                  if (nr >= 0 && nr < 4 && nc >= 0 && nc < 4) {
                    expect(solution[nr][nc]).toBe(0);
                  }
                }
              }
            }
          }
        }
      }
    });
  });
});

