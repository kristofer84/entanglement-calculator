export interface Cell {
  row: number;
  col: number;
}

export interface Config {
  board_size: number;
  stars_per_row: number;
  stars_per_column: number;
  initial_star_count: number;
}

export interface Pattern {
  initial_stars: Cell[];
  compatible_solutions: number;
  forced_empty: Cell[];
  forced_star: Cell[];
}

export interface Output {
  board_size: number;
  stars_per_row: number;
  stars_per_column: number;
  initial_star_count: number;
  total_solutions: number;
  patterns: Pattern[];
}

export type Grid = number[][]; // 0 or 1 matrix

