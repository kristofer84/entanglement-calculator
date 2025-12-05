import { Grid, Cell, Pattern } from '../types';
import { ConfigurationEnumerator } from './enumeration';

export class PatternAnalyzer {
  private boardSize: number;
  private solutions: Grid[];
  private progressCallback?: (patternsGenerated: number) => void;
  private lastReportTime: number = 0;
  private reportInterval: number = 1000; // Report every second
  private includeInherent: boolean;

  constructor(boardSize: number, solutions: Grid[], includeInherent: boolean = false, progressCallback?: (patternsGenerated: number) => void) {
    this.boardSize = boardSize;
    this.solutions = solutions;
    this.includeInherent = includeInherent;
    this.progressCallback = progressCallback;
    this.lastReportTime = Date.now();
  }

  /**
   * Generate all valid initial-star patterns of given size
   */
  generatePatterns(patternSize: number): Cell[][] {
    const patterns: Cell[][] = [];
    const cells: Cell[] = [];

    // Generate all cells
    const allCells: Cell[] = [];
    for (let row = 0; row < this.boardSize; row++) {
      for (let col = 0; col < this.boardSize; col++) {
        allCells.push({ row, col });
      }
    }

    // Generate all combinations of patternSize cells
    this.generateCombinations(allCells, patternSize, 0, cells, patterns);

    // Filter to only locally valid patterns
    const validPatterns = patterns.filter(p => 
      ConfigurationEnumerator.isLocallyValid(p, this.boardSize)
    );

    // Filter to only realizable patterns (have at least one compatible solution)
    const realizablePatterns = validPatterns.filter(pattern => {
      return this.solutions.some(solution =>
        ConfigurationEnumerator.isPatternCompatible(pattern, solution)
      );
    });

    return realizablePatterns;
  }

  /**
   * Generate all combinations of k elements from array
   */
  private generateCombinations(
    array: Cell[],
    k: number,
    start: number,
    current: Cell[],
    result: Cell[][]
  ): void {
    if (current.length === k) {
      result.push([...current]);
      // Report progress periodically
      if (this.progressCallback && result.length % 100 === 0) {
        const now = Date.now();
        if (now - this.lastReportTime >= this.reportInterval) {
          this.progressCallback(result.length);
          this.lastReportTime = now;
        }
      }
      return;
    }

    for (let i = start; i < array.length; i++) {
      current.push(array[i]);
      this.generateCombinations(array, k, i + 1, current, result);
      current.pop();
    }
  }

  /**
   * Analyze a pattern and compute cell states
   */
  analyzePattern(pattern: Cell[]): Pattern | null {
    // Find all compatible solutions
    const compatibleSolutions = this.solutions.filter(solution =>
      ConfigurationEnumerator.isPatternCompatible(pattern, solution)
    );

    if (compatibleSolutions.length === 0) {
      return null;
    }

    // Initialize cell states matrix
    const cellStates: string[][] = Array(this.boardSize)
      .fill(0)
      .map(() => Array(this.boardSize).fill('flexible'));

    // First, identify all cells adjacent to initial stars (including diagonals)
    // These must be empty in all solutions due to adjacency rules
    const adjacentToStars = new Set<string>();
    const patternSet = new Set(pattern.map(c => `${c.row},${c.col}`));
    
    for (const star of pattern) {
      // Check all 8 neighbors (horizontal, vertical, diagonal)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue; // Skip the star itself
          const nr = star.row + dr;
          const nc = star.col + dc;
          if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize) {
            const key = `${nr},${nc}`;
            if (!patternSet.has(key)) {
              adjacentToStars.add(key);
            }
          }
        }
      }
    }

    // For each cell, determine its state
    for (let row = 0; row < this.boardSize; row++) {
      for (let col = 0; col < this.boardSize; col++) {
        const isInPattern = pattern.some(
          c => c.row === row && c.col === col
        );

        if (isInPattern) {
          cellStates[row][col] = 'forced_star';
        } else {
          const key = `${row},${col}`;
          // Cells adjacent to initial stars must be empty (adjacency rule)
          if (adjacentToStars.has(key)) {
            cellStates[row][col] = 'forced_empty';
          } else {
            // Check if this cell is always star or always empty
            const starCount = compatibleSolutions.filter(
              sol => sol[row][col] === 1
            ).length;

            if (starCount === 0) {
              cellStates[row][col] = 'forced_empty';
            } else if (starCount === compatibleSolutions.length) {
              cellStates[row][col] = 'forced_star';
            } else {
              cellStates[row][col] = 'flexible';
            }
          }
        }
      }
    }

    // Check if pattern is non-trivial
    const isNonTrivial = this.isNonTrivial(pattern, cellStates);
    if (!isNonTrivial) {
      return null;
    }

    // Extract only forced cells (excluding initial stars themselves)
    // Reuse patternSet and adjacentToStars from above
    // Also exclude inherently forced_empty cells:
    // 1. All adjacent cells (to initial stars)
    // 2. All cells on same row/column if all initial stars are on a line
    const forcedEmpty: Cell[] = [];
    const forcedStar: Cell[] = [];
    
    // Check if all initial stars are on the same row/column
    const firstRow = pattern.length > 0 ? pattern[0].row : -1;
    const firstCol = pattern.length > 0 ? pattern[0].col : -1;
    const allSameRow = pattern.length > 0 && pattern.every(c => c.row === firstRow);
    const allSameCol = pattern.length > 0 && pattern.every(c => c.col === firstCol);
    
    for (let row = 0; row < this.boardSize; row++) {
      for (let col = 0; col < this.boardSize; col++) {
        const key = `${row},${col}`;
        const state = cellStates[row][col];
        // Include forced cells that are not in the initial pattern
        if (!patternSet.has(key)) {
          if (state === 'forced_empty') {
            // Skip inherently forced_empty cells unless includeInherent is true:
            // 1. Adjacent to initial stars
            const isAdjacent = adjacentToStars.has(key);
            // 2. On same row/column if all initial stars are on a line
            const isOnSameLine = (allSameRow && row === firstRow) || (allSameCol && col === firstCol);
            
            // Include if includeInherent is true OR if it's NOT inherently forced_empty
            if (this.includeInherent || (!isAdjacent && !isOnSameLine)) {
              forcedEmpty.push({ row, col });
            }
          } else if (state === 'forced_star') {
            forcedStar.push({ row, col });
          }
        }
      }
    }

    // Check if pattern should be filtered out
    // Pass cellStates so filter can check ALL forced cells (including inherent ones)
    if (this.shouldSkipPattern(pattern, cellStates)) {
      return null;
    }

    return {
      initial_stars: pattern,
      compatible_solutions: compatibleSolutions.length,
      forced_empty: forcedEmpty,
      forced_star: forcedStar,
    };
  }

  /**
   * Check if a pattern is non-trivial (has forced cells outside the pattern)
   */
  private isNonTrivial(pattern: Cell[], cellStates: string[][]): boolean {
    const patternSet = new Set(
      pattern.map(c => `${c.row},${c.col}`)
    );

    for (let row = 0; row < this.boardSize; row++) {
      for (let col = 0; col < this.boardSize; col++) {
        const key = `${row},${col}`;
        if (!patternSet.has(key)) {
          const state = cellStates[row][col];
          if (state === 'forced_star' || state === 'forced_empty') {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Check if pattern should be skipped based on filtering rules
   * Skip in two cases:
   * 1. If only adjacent cells are forced_empty (and no forced_star)
   * 2. If all initial stars are on a line (row or col) AND all forced_empty are either on that same line or adjacent
   */
  private shouldSkipPattern(pattern: Cell[], cellStates: string[][]): boolean {
    if (pattern.length === 0) return false;

    // Get all adjacent cells to initial stars
    // Note: Initial stars are guaranteed to not be adjacent to each other (enforced by isLocallyValid)
    const adjacentCells = new Set<string>();
    const patternSet = new Set(pattern.map(c => `${c.row},${c.col}`));
    
    for (const star of pattern) {
      // Check all 8 neighbors (horizontal, vertical, diagonal)
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue; // Skip the star itself
          const nr = star.row + dr;
          const nc = star.col + dc;
          if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize) {
            const key = `${nr},${nc}`;
            // Exclude initial stars themselves from adjacent cells
            if (!patternSet.has(key)) {
              adjacentCells.add(key);
            }
          }
        }
      }
    }

    // Extract all forced_empty and forced_star cells from cellStates
    const allForcedEmpty: Cell[] = [];
    const allForcedStar: Cell[] = [];
    
    for (let row = 0; row < this.boardSize; row++) {
      for (let col = 0; col < this.boardSize; col++) {
        const key = `${row},${col}`;
        if (!patternSet.has(key)) {
          const state = cellStates[row][col];
          if (state === 'forced_empty') {
            allForcedEmpty.push({ row, col });
          } else if (state === 'forced_star') {
            allForcedStar.push({ row, col });
          }
        }
      }
    }

    // Case 1: Skip if only adjacent cells are forced_empty (and no forced_star)
    const forcedEmptyAdjacent = allForcedEmpty.filter(cell => {
      const key = `${cell.row},${cell.col}`;
      return adjacentCells.has(key);
    });
    const forcedStarAdjacent = allForcedStar.filter(cell => {
      const key = `${cell.row},${cell.col}`;
      return adjacentCells.has(key);
    });
    const forcedEmptyNotAdjacent = allForcedEmpty.filter(cell => {
      const key = `${cell.row},${cell.col}`;
      return !adjacentCells.has(key);
    });
    const forcedStarNotAdjacent = allForcedStar.filter(cell => {
      const key = `${cell.row},${cell.col}`;
      return !adjacentCells.has(key);
    });

    // Case 1: Only adjacent cells are forced_empty, and no forced_star anywhere
    if (forcedEmptyNotAdjacent.length === 0 && 
        forcedStarAdjacent.length === 0 && 
        forcedStarNotAdjacent.length === 0 &&
        forcedEmptyAdjacent.length > 0) {
      return true;
    }

    // Case 2: All initial stars on same row/column AND all forced_empty are either on that line or adjacent
    const firstRow = pattern[0].row;
    const allSameRow = pattern.every(c => c.row === firstRow);
    const firstCol = pattern[0].col;
    const allSameCol = pattern.every(c => c.col === firstCol);

    if (allSameRow || allSameCol) {
      // Check if all forced_empty cells are either on the same line or adjacent
      const allForcedEmptyOnLineOrAdjacent = allForcedEmpty.every(cell => {
        const key = `${cell.row},${cell.col}`;
        const isAdjacent = adjacentCells.has(key);
        const isOnSameRow = allSameRow && cell.row === firstRow;
        const isOnSameCol = allSameCol && cell.col === firstCol;
        return isAdjacent || isOnSameRow || isOnSameCol;
      });

      // Also check if there are any forced_star cells - if there are, don't skip
      if (allForcedEmptyOnLineOrAdjacent && allForcedEmpty.length > 0 && allForcedStar.length === 0) {
        return true;
      }
    }

    return false;
  }
}

