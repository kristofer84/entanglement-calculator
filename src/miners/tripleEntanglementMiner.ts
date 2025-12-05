import * as fs from 'fs';
import * as path from 'path';
import { Output } from '../types';

type Point = [number, number];

interface Pattern {
  initial_stars: Point[];
  compatible_solutions?: number;
  forced_empty?: Point[];
  forced_star?: Point[];
}

interface EntanglementInput {
  board_size: number;
  stars_per_row: number;
  stars_per_column: number;
  initial_star_count: number;
  total_solutions: number;
  patterns: Pattern[];
}

type GridSolution = number[][]; // board_size x board_size, 1 = star, 0 = empty
type CoordSolution = Point[];   // list of star coordinates

interface SolutionsFile {
  board_size: number;
  stars_per_row: number;
  stars_per_column: number;
  solutions: (GridSolution | CoordSolution)[];
}

interface TripleRule {
  canonical_stars: Point[];
  canonical_candidate: Point;
  constraint_features: string[];
  forced: boolean;
  occurrences: number;
}

interface TripleOutput {
  board_size: number;
  initial_stars: number;
  unconstrained_rules: TripleRule[];
  constrained_rules: TripleRule[];
}

// ----------------- Canonicalisation (D4 + translation) -----------------

const D4_TRANSFORMS: ((p: Point) => Point)[] = [
  ([r, c]) => [ r,  c],  // identity
  ([r, c]) => [ r, -c],  // reflect vertical
  ([r, c]) => [-r,  c],  // reflect horizontal
  ([r, c]) => [-r, -c],  // rotate 180
  ([r, c]) => [ c,  r],  // transpose
  ([r, c]) => [ c, -r],
  ([r, c]) => [-c,  r],
  ([r, c]) => [-c, -r],
];

interface CanonicalTriple {
  canonicalStars: Point[];
  canonicalCandidate: Point;
}

function canonicalizeTriple(stars: Point[], candidate: Point): CanonicalTriple {
  let bestStars: Point[] | null = null;
  let bestCandidate: Point = [0, 0];

  for (let t = 0; t < D4_TRANSFORMS.length; t++) {
    const tf = D4_TRANSFORMS[t];

    const sT = stars.map(tf);
    const cT = tf(candidate);

    const minRow = Math.min(...sT.map(p => p[0]));
    const minCol = Math.min(...sT.map(p => p[1]));

    const shift = (p: Point): Point => [p[0] - minRow, p[1] - minCol];

    const sN = sT.map(shift).sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
    const cN = shift(cT);

    if (!bestStars) {
      bestStars = sN;
      bestCandidate = cN;
    } else {
      const current = JSON.stringify(sN);
      const best = JSON.stringify(bestStars);
      if (current < best) {
        bestStars = sN;
        bestCandidate = cN;
      }
    }
  }

  return {
    canonicalStars: bestStars!,
    canonicalCandidate: bestCandidate,
  };
}

// ----------------- Feature extraction for constrained rules -----------------

interface TripleFeatures {
  candidate_on_top_edge: boolean;
  candidate_on_bottom_edge: boolean;
  candidate_on_left_edge: boolean;
  candidate_on_right_edge: boolean;
  candidate_on_outer_ring: boolean; // distance 1 from edge
  some_star_on_top_edge: boolean;
  some_star_on_bottom_edge: boolean;
  some_star_on_left_edge: boolean;
  some_star_on_right_edge: boolean;
  // Star alignment features
  candidate_in_same_row_as_any_star: boolean;
  candidate_in_same_column_as_any_star: boolean;
  candidate_between_stars_in_row: boolean;
  candidate_between_stars_in_column: boolean;
  // Row/column structural needs
  candidate_row_needs_star: boolean;
  candidate_column_needs_star: boolean;
  // Ring index
  ring_index: number;
  candidate_in_ring_1: boolean;
  // Corner K×K blocks
  candidate_in_top_left_KxK: boolean;
  candidate_in_top_right_KxK: boolean;
  candidate_in_bottom_left_KxK: boolean;
  candidate_in_bottom_right_KxK: boolean;
}

function extractFeatures(
  starsAbs: Point[],
  candidateAbs: Point,
  boardSize: number,
  compatibleSolutions?: GridSolution[],
  forcedStar?: Point[],
  cornerBlockSize: number = 3,
): TripleFeatures {
  const [r, c] = candidateAbs;
  const last = boardSize - 1;
  const N = boardSize;

  // Existing edge features
  const candidate_on_top_edge = r === 0;
  const candidate_on_bottom_edge = r === last;
  const candidate_on_left_edge = c === 0;
  const candidate_on_right_edge = c === last;

  // "Ring" one cell in from the edge, similar to the Kris guide: distance 1 from any side
  const candidate_on_outer_ring =
    r === 1 || r === last - 1 || c === 1 || c === last - 1;

  const some_star_on_top_edge = starsAbs.some(([sr]) => sr === 0);
  const some_star_on_bottom_edge = starsAbs.some(([sr]) => sr === last);
  const some_star_on_left_edge = starsAbs.some(([, sc]) => sc === 0);
  const some_star_on_right_edge = starsAbs.some(([, sc]) => sc === last);

  // 1. Star alignment features
  const candidate_in_same_row_as_any_star = starsAbs.some(([sr]) => sr === r);
  const candidate_in_same_column_as_any_star = starsAbs.some(([, sc]) => sc === c);

  // candidate_between_stars_in_row: at least two stars share the candidate's row
  // and candidate.col lies strictly between their min and max columns
  const starsInRow = starsAbs.filter(([sr]) => sr === r);
  let candidate_between_stars_in_row = false;
  if (starsInRow.length >= 2) {
    const cols = starsInRow.map(([, sc]) => sc);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    candidate_between_stars_in_row = c > minCol && c < maxCol;
  }

  // candidate_between_stars_in_column: at least two stars share the candidate's column
  // and candidate.row lies strictly between their min and max rows
  const starsInCol = starsAbs.filter(([, sc]) => sc === c);
  let candidate_between_stars_in_column = false;
  if (starsInCol.length >= 2) {
    const rows = starsInCol.map(([sr]) => sr);
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    candidate_between_stars_in_column = r > minRow && r < maxRow;
  }

  // 2. Row/column structural needs
  let candidate_row_needs_star = false;
  let candidate_column_needs_star = false;

  if (compatibleSolutions && compatibleSolutions.length > 0) {
    // Check if every compatible solution places at least one star in the candidate's row
    // outside the candidate cell
    candidate_row_needs_star = compatibleSolutions.every(grid => {
      for (let col = 0; col < N; col++) {
        if (col !== c && grid[r][col] === 1) {
          return true; // Found a star in the row outside candidate cell
        }
      }
      return false; // No star found in row outside candidate cell
    });

    // Check if every compatible solution places at least one star in the candidate's column
    // outside the candidate cell
    candidate_column_needs_star = compatibleSolutions.every(grid => {
      for (let row = 0; row < N; row++) {
        if (row !== r && grid[row][c] === 1) {
          return true; // Found a star in the column outside candidate cell
        }
      }
      return false; // No star found in column outside candidate cell
    });
  }

  // 3. Ring index
  const ring_index = Math.min(r, c, N - 1 - r, N - 1 - c);
  const candidate_in_ring_1 = ring_index === 1;

  // 4. Corner K×K blocks
  const K = cornerBlockSize;
  const candidate_in_top_left_KxK = r < K && c < K;
  const candidate_in_top_right_KxK = r < K && c >= N - K;
  const candidate_in_bottom_left_KxK = r >= N - K && c < K;
  const candidate_in_bottom_right_KxK = r >= N - K && c >= N - K;

  return {
    candidate_on_top_edge,
    candidate_on_bottom_edge,
    candidate_on_left_edge,
    candidate_on_right_edge,
    candidate_on_outer_ring,
    some_star_on_top_edge,
    some_star_on_bottom_edge,
    some_star_on_left_edge,
    some_star_on_right_edge,
    candidate_in_same_row_as_any_star,
    candidate_in_same_column_as_any_star,
    candidate_between_stars_in_row,
    candidate_between_stars_in_column,
    candidate_row_needs_star,
    candidate_column_needs_star,
    ring_index,
    candidate_in_ring_1,
    candidate_in_top_left_KxK,
    candidate_in_top_right_KxK,
    candidate_in_bottom_left_KxK,
    candidate_in_bottom_right_KxK,
  };
}

// ----------------- Utilities -----------------

function keyOfPoint([r, c]: Point): string {
  return `${r},${c}`;
}

function parseSolutions(input: SolutionsFile | GridSolution[], boardSize: number): GridSolution[] {
  // Handle both formats: array directly or object with solutions property
  const solutions = Array.isArray(input) ? input : input.solutions;
  
  if (!solutions) {
    throw new Error('Solutions file must contain a solutions array or be an array directly');
  }
  
  return solutions.map(sol => {
    const first = sol[0] as any;

    // Grid form: board_size x board_size of 0/1
    if (Array.isArray(first) && typeof first[0] === 'number' &&
        (sol as any).length === boardSize &&
        (sol as any)[0].length === boardSize) {
      return sol as GridSolution;
    }

    // Coordinate form: list of [row, col]
    if (Array.isArray(first) && first.length === 2) {
      const grid: GridSolution = Array.from({ length: boardSize }, () =>
        Array(boardSize).fill(0),
      );
      (sol as CoordSolution).forEach(([r, c]) => {
        grid[r][c] = 1;
      });
      return grid;
    }

    throw new Error('Unsupported solutions format');
  });
}

function isSolutionCompatible(grid: GridSolution, stars: Point[]): boolean {
  return stars.every(([r, c]) => grid[r][c] === 1);
}

// ----------------- Main mining logic -----------------

interface TripleOccurrence {
  canonicalStars: Point[];
  canonicalCandidate: Point;
  forced: boolean;
  features: TripleFeatures;
}

interface TripleBucket {
  canonicalStars: Point[];
  canonicalCandidate: Point;
  occurrences: TripleOccurrence[];
}

export function mineTripleFromFile(
  inputPath: string,
  solutionsPath: string,
  outputPath: string,
  minOccurrences: number,
): void {
  const rawEnt = fs.readFileSync(inputPath, 'utf-8');
  const entData: EntanglementInput = JSON.parse(rawEnt);

  const rawSol = fs.readFileSync(solutionsPath, 'utf-8');
  const solData: SolutionsFile | GridSolution[] = JSON.parse(rawSol);
  const boardSize = entData.board_size;

  const grids = parseSolutions(solData, boardSize);

  console.log(`Loaded ${grids.length.toLocaleString()} solutions from ${solutionsPath}`);
  console.log(`Loaded ${entData.patterns.length.toLocaleString()} patterns from ${inputPath}`);
  console.log('');

  const buckets = new Map<string, TripleBucket>();

  // Iterate patterns
  for (const pattern of entData.patterns) {
    const starsAbs: Point[] = pattern.initial_stars;
    const forcedEmpty: Point[] = pattern.forced_empty || [];
    const forcedStar: Point[] = pattern.forced_star || [];

    // Compute compatible solutions for this pattern
    const compatible = grids.filter(g => isSolutionCompatible(g, starsAbs));
    if (compatible.length === 0) {
      continue;
    }

    const compatCount = compatible.length;

    const forcedEmptySet = new Set(forcedEmpty.map(keyOfPoint));
    const forcedStarSet = new Set(forcedStar.map(keyOfPoint));
    const starSet = new Set(starsAbs.map(keyOfPoint));

    // 1) Forced triples: candidate is always empty (these are your current rules)
    for (const cell of forcedEmpty) {
      const { canonicalStars, canonicalCandidate } = canonicalizeTriple(starsAbs, cell);
      const features = extractFeatures(starsAbs, cell, boardSize, compatible, forcedStar);

      const key = JSON.stringify({ canonicalStars, canonicalCandidate });
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          canonicalStars,
          canonicalCandidate,
          occurrences: [],
        };
        buckets.set(key, bucket);
      }

      bucket.occurrences.push({
        canonicalStars,
        canonicalCandidate,
        forced: true,
        features,
      });
    }

    // 2) Flexible triples: candidate is sometimes star and sometimes empty
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const keyAbs = keyOfPoint([r, c]);
        if (starSet.has(keyAbs)) continue;        // initial star
        if (forcedEmptySet.has(keyAbs)) continue; // already handled as forced
        if (forcedStarSet.has(keyAbs)) continue;  // you can exclude inherently forced stars

        let starCount = 0;
        for (const g of compatible) {
          if (g[r][c] === 1) starCount++;
        }

        if (starCount === 0 || starCount === compatCount) {
          // Always empty or always star → not a flexible triple
          continue;
        }

        const cell: Point = [r, c];
        const { canonicalStars, canonicalCandidate } = canonicalizeTriple(starsAbs, cell);
        const features = extractFeatures(starsAbs, cell, boardSize, compatible, forcedStar);

        const key = JSON.stringify({ canonicalStars, canonicalCandidate });
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = {
            canonicalStars,
            canonicalCandidate,
            occurrences: [],
          };
          buckets.set(key, bucket);
        }

        bucket.occurrences.push({
          canonicalStars,
          canonicalCandidate,
          forced: false,
          features,
        });
      }
    }
  }

  // Build rules from buckets
  const unconstrained_rules: TripleRule[] = [];
  const constrained_rules: TripleRule[] = [];

  for (const bucket of buckets.values()) {
    const pos = bucket.occurrences.filter(o => o.forced);
    const neg = bucket.occurrences.filter(o => !o.forced);

    const positiveCount = pos.length;
    const negativeCount = neg.length;

    if (positiveCount < minOccurrences) {
      continue;
    }

    // Pure / unconstrained triple entanglement (no observed flexible counterpart)
    if (negativeCount === 0) {
      unconstrained_rules.push({
        canonical_stars: bucket.canonicalStars,
        canonical_candidate: bucket.canonicalCandidate,
        constraint_features: [],
        forced: true,
        occurrences: positiveCount,
      });
      continue;
    }

    // Constrained rules: need at least one positive and one negative
    const featureNames = Object.keys(pos[0].features) as (keyof TripleFeatures)[];
    const chosen: string[] = [];

    for (const fname of featureNames) {
      const allPosHave = pos.every(o => o.features[fname]);
      const someNegLack = neg.some(o => !o.features[fname]);

      if (allPosHave && someNegLack) {
        chosen.push(fname);
      }
    }

    if (chosen.length > 0) {
      constrained_rules.push({
        canonical_stars: bucket.canonicalStars,
        canonical_candidate: bucket.canonicalCandidate,
        constraint_features: chosen,
        forced: true,
        occurrences: positiveCount,
      });
    } else {
      // If no separating feature, fall back to unconstrained rule
      unconstrained_rules.push({
        canonical_stars: bucket.canonicalStars,
        canonical_candidate: bucket.canonicalCandidate,
        constraint_features: [],
        forced: true,
        occurrences: positiveCount,
      });
    }
  }

  // Sort for stable output
  const sortRule = (a: TripleRule, b: TripleRule) =>
    JSON.stringify(a.canonical_stars).localeCompare(JSON.stringify(b.canonical_stars)) ||
    JSON.stringify(a.canonical_candidate).localeCompare(JSON.stringify(b.canonical_candidate));

  unconstrained_rules.sort(sortRule);
  constrained_rules.sort(sortRule);

  const out: TripleOutput = {
    board_size: entData.board_size,
    initial_stars: entData.initial_star_count,
    unconstrained_rules,
    constrained_rules,
  };

  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(out, null, 2), 'utf-8');
  console.log(`Wrote triple entanglements to ${outputPath}`);
}

export function mineTripleEntanglements(
  output: Output,
  solutions: GridSolution[],
  minOccurrences: number = 2,
): TripleOutput {
  const boardSize = output.board_size;
  const grids = solutions;

  const buckets = new Map<string, TripleBucket>();

  // Iterate patterns
  for (const pattern of output.patterns) {
    // Convert initial_stars from Cell[] to Point[]
    const starsAbs: Point[] = pattern.initial_stars.map(cell => [cell.row, cell.col]);
    const forcedEmpty: Point[] = (pattern.forced_empty || []).map(cell => [cell.row, cell.col]);
    const forcedStar: Point[] = (pattern.forced_star || []).map(cell => [cell.row, cell.col]);

    // Compute compatible solutions for this pattern
    const compatible = grids.filter(g => isSolutionCompatible(g, starsAbs));
    if (compatible.length === 0) {
      continue;
    }

    const compatCount = compatible.length;

    const forcedEmptySet = new Set(forcedEmpty.map(keyOfPoint));
    const forcedStarSet = new Set(forcedStar.map(keyOfPoint));
    const starSet = new Set(starsAbs.map(keyOfPoint));

    // 1) Forced triples: candidate is always empty (these are your current rules)
    for (const cell of forcedEmpty) {
      const { canonicalStars, canonicalCandidate } = canonicalizeTriple(starsAbs, cell);
      const features = extractFeatures(starsAbs, cell, boardSize, compatible, forcedStar);

      const key = JSON.stringify({ canonicalStars, canonicalCandidate });
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          canonicalStars,
          canonicalCandidate,
          occurrences: [],
        };
        buckets.set(key, bucket);
      }

      bucket.occurrences.push({
        canonicalStars,
        canonicalCandidate,
        forced: true,
        features,
      });
    }

    // 2) Flexible triples: candidate is sometimes star and sometimes empty
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const keyAbs = keyOfPoint([r, c]);
        if (starSet.has(keyAbs)) continue;        // initial star
        if (forcedEmptySet.has(keyAbs)) continue; // already handled as forced
        if (forcedStarSet.has(keyAbs)) continue;  // you can exclude inherently forced stars

        let starCount = 0;
        for (const g of compatible) {
          if (g[r][c] === 1) starCount++;
        }

        if (starCount === 0 || starCount === compatCount) {
          // Always empty or always star → not a flexible triple
          continue;
        }

        const cell: Point = [r, c];
        const { canonicalStars, canonicalCandidate } = canonicalizeTriple(starsAbs, cell);
        const features = extractFeatures(starsAbs, cell, boardSize, compatible, forcedStar);

        const key = JSON.stringify({ canonicalStars, canonicalCandidate });
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = {
            canonicalStars,
            canonicalCandidate,
            occurrences: [],
          };
          buckets.set(key, bucket);
        }

        bucket.occurrences.push({
          canonicalStars,
          canonicalCandidate,
          forced: false,
          features,
        });
      }
    }
  }

  // Build rules from buckets
  const unconstrained_rules: TripleRule[] = [];
  const constrained_rules: TripleRule[] = [];

  for (const bucket of buckets.values()) {
    const pos = bucket.occurrences.filter(o => o.forced);
    const neg = bucket.occurrences.filter(o => !o.forced);

    const positiveCount = pos.length;
    const negativeCount = neg.length;

    if (positiveCount < minOccurrences) {
      continue;
    }

    // Pure / unconstrained triple entanglement (no observed flexible counterpart)
    if (negativeCount === 0) {
      unconstrained_rules.push({
        canonical_stars: bucket.canonicalStars,
        canonical_candidate: bucket.canonicalCandidate,
        constraint_features: [],
        forced: true,
        occurrences: positiveCount,
      });
      continue;
    }

    // Constrained rules: need at least one positive and one negative
    const featureNames = Object.keys(pos[0].features) as (keyof TripleFeatures)[];
    const chosen: string[] = [];

    for (const fname of featureNames) {
      const allPosHave = pos.every(o => o.features[fname]);
      const someNegLack = neg.some(o => !o.features[fname]);

      if (allPosHave && someNegLack) {
        chosen.push(fname);
      }
    }

    if (chosen.length > 0) {
      constrained_rules.push({
        canonical_stars: bucket.canonicalStars,
        canonical_candidate: bucket.canonicalCandidate,
        constraint_features: chosen,
        forced: true,
        occurrences: positiveCount,
      });
    } else {
      // If no separating feature, fall back to unconstrained rule
      unconstrained_rules.push({
        canonical_stars: bucket.canonicalStars,
        canonical_candidate: bucket.canonicalCandidate,
        constraint_features: [],
        forced: true,
        occurrences: positiveCount,
      });
    }
  }

  // Sort for stable output
  const sortRule = (a: TripleRule, b: TripleRule) =>
    JSON.stringify(a.canonical_stars).localeCompare(JSON.stringify(b.canonical_stars)) ||
    JSON.stringify(a.canonical_candidate).localeCompare(JSON.stringify(b.canonical_candidate));

  unconstrained_rules.sort(sortRule);
  constrained_rules.sort(sortRule);

  return {
    board_size: output.board_size,
    initial_stars: output.initial_star_count,
    unconstrained_rules,
    constrained_rules,
  };
}

export function writeTripleEntanglementOutput(
  tripleEntanglements: TripleOutput,
  outputPath: string,
): void {
  const outDir = path.dirname(outputPath);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(tripleEntanglements, null, 2), 'utf-8');
}
