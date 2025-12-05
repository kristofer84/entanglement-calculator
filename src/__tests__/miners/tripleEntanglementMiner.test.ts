import { describe, it, expect } from 'vitest';
import { mineTripleEntanglements } from '../../miners/tripleEntanglementMiner';
import { Output } from '../../types';

describe('TripleEntanglementMiner', () => {
  describe('mineTripleEntanglements', () => {
    it('should mine triple entanglements from output', () => {
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

      // Create mock solutions (GridSolution is number[][])
      const solutions: number[][] = [
        [1, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 0],
      ];

      const result = mineTripleEntanglements(output, [solutions], 1);
      
      expect(result.board_size).toBe(4);
      expect(result.initial_stars).toBe(2);
      expect(result.unconstrained_rules).toBeDefined();
      expect(result.constrained_rules).toBeDefined();
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

      const solutions: number[][] = [
        [1, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 1, 0],
        [0, 0, 0, 0],
      ];

      const result = mineTripleEntanglements(output, [solutions], 2);
      
      // Should filter out rules with less than 2 occurrences
      expect(result.unconstrained_rules.length).toBe(0);
      expect(result.constrained_rules.length).toBe(0);
    });
  });
});

