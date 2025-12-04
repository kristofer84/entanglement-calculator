import { Grid, Cell } from './types';

export class ConfigurationEnumerator {
  private boardSize: number;
  private starsPerRow: number;
  private solutions: Grid[] = [];
  private progressCallback?: (solutionsFound: number) => void;
  private lastReportTime: number = 0;
  private reportInterval: number = 1000; // Report every second
  private nodesExplored: number = 0;
  private lastNodeReportTime: number = 0;

  constructor(boardSize: number, starsPerRow: number, progressCallback?: (solutionsFound: number) => void) {
    this.boardSize = boardSize;
    this.starsPerRow = starsPerRow;
    this.progressCallback = progressCallback;
    this.lastReportTime = Date.now();
    this.lastNodeReportTime = Date.now();
  }

  /**
   * Check if placing a star at (row, col) violates adjacency rules
   */
  private isValidPlacement(grid: Grid, row: number, col: number): boolean {
    // Check all 8 adjacent cells (including diagonals)
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr;
        const nc = col + dc;
        if (nr >= 0 && nr < this.boardSize && nc >= 0 && nc < this.boardSize) {
          if (grid[nr][nc] === 1) {
            return false;
          }
        }
      }
    }
    return true;
  }

  /**
   * Count stars in a row
   */
  private countStarsInRow(grid: Grid, row: number): number {
    return grid[row].reduce((sum, val) => sum + val, 0);
  }

  /**
   * Count stars in a column
   */
  private countStarsInColumn(grid: Grid, col: number): number {
    let count = 0;
    for (let row = 0; row < this.boardSize; row++) {
      count += grid[row][col];
    }
    return count;
  }

  /**
   * Create a deep copy of the grid
   */
  private copyGrid(grid: Grid): Grid {
    return grid.map(row => [...row]);
  }

  /**
   * Enumerate all valid configurations using backtracking
   */
  enumerate(): Grid[] {
    this.solutions = [];
    const grid: Grid = Array(this.boardSize)
      .fill(0)
      .map(() => Array(this.boardSize).fill(0));
    
    this.backtrack(grid, 0, 0);
    return this.solutions;
  }

  /**
   * Backtracking algorithm to find all valid configurations
   */
  private backtrack(grid: Grid, row: number, col: number): void {
    // Report exploration progress periodically
    this.nodesExplored++;
    if (this.progressCallback && this.nodesExplored % 100000 === 0) {
      const now = Date.now();
      if (now - this.lastNodeReportTime >= this.reportInterval) {
        this.progressCallback(this.solutions.length);
        this.lastNodeReportTime = now;
      }
    }

    // Base case: if we've processed all cells
    if (row === this.boardSize) {
      // Verify all columns have correct star count
      let valid = true;
      for (let c = 0; c < this.boardSize; c++) {
        if (this.countStarsInColumn(grid, c) !== this.starsPerRow) {
          valid = false;
          break;
        }
      }
      if (valid) {
        this.solutions.push(this.copyGrid(grid));
        // Report progress when solution found
        if (this.progressCallback) {
          const now = Date.now();
          if (now - this.lastReportTime >= this.reportInterval) {
            this.progressCallback(this.solutions.length);
            this.lastReportTime = now;
          }
        }
      }
      return;
    }

    // Calculate remaining cells in current row
    const remainingInRow = this.boardSize - col;
    const starsInRow = this.countStarsInRow(grid, row);
    const starsNeeded = this.starsPerRow - starsInRow;

    // Pruning: if we can't place enough stars, backtrack
    if (starsNeeded > remainingInRow) {
      return;
    }

    // Check column constraints early - if a column already has enough stars, skip placing more
    if (col > 0) {
      const starsInCol = this.countStarsInColumn(grid, col - 1);
      if (starsInCol > this.starsPerRow) {
        return; // Column already has too many stars
      }
    }

    // Move to next row if we've finished current row
    if (col === this.boardSize) {
      // Verify row has correct star count
      if (starsInRow === this.starsPerRow) {
        // Check if columns are still valid before proceeding
        let canProceed = true;
        for (let c = 0; c < this.boardSize; c++) {
          const starsInCol = this.countStarsInColumn(grid, c);
          if (starsInCol > this.starsPerRow) {
            canProceed = false;
            break;
          }
        }
        if (canProceed) {
          this.backtrack(grid, row + 1, 0);
        }
      }
      return;
    }

    // Try placing a star
    if (starsInRow < this.starsPerRow && this.isValidPlacement(grid, row, col)) {
      grid[row][col] = 1;
      this.backtrack(grid, row, col + 1);
      grid[row][col] = 0;
    }

    // Try not placing a star
    this.backtrack(grid, row, col + 1);
  }

  /**
   * Check if a set of cells is locally valid (no adjacency violations)
   */
  static isLocallyValid(cells: Cell[], boardSize: number): boolean {
    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const dr = Math.abs(cells[i].row - cells[j].row);
        const dc = Math.abs(cells[i].col - cells[j].col);
        if (dr <= 1 && dc <= 1) {
          return false; // Adjacent cells
        }
      }
    }
    return true;
  }

  /**
   * Check if a pattern (set of cells) is compatible with a solution
   */
  static isPatternCompatible(pattern: Cell[], solution: Grid): boolean {
    for (const cell of pattern) {
      if (solution[cell.row][cell.col] !== 1) {
        return false;
      }
    }
    return true;
  }
}

