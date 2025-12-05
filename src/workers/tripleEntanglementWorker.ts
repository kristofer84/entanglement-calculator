import { parentPort, workerData } from 'worker_threads';
import { Cell } from '../types';

type Point = [number, number];
type GridSolution = number[][];

interface WorkerData {
  starPairs: Cell[][];
  solutions: GridSolution[];
  boardSize: number;
  workerId: number;
  totalWorkers: number;
  minOccurrences: number;
}

interface TripleOccurrence {
  canonicalStars: Point[];
  canonicalCandidate: Point;
  forced: boolean;
  features: any; // TripleFeatures
}

interface TripleBucket {
  canonicalStars: Point[];
  canonicalCandidate: Point;
  occurrences: TripleOccurrence[];
}

// D4 transforms (same as in tripleEntanglementMiner.ts)
const D4_TRANSFORMS: ((p: Point) => Point)[] = [
  ([r, c]) => [ r,  c],
  ([r, c]) => [ r, -c],
  ([r, c]) => [-r,  c],
  ([r, c]) => [-r, -c],
  ([r, c]) => [ c,  r],
  ([r, c]) => [ c, -r],
  ([r, c]) => [-c,  r],
  ([r, c]) => [-c, -r],
];

function canonicalizeTriple(stars: Point[], candidate: Point): { canonicalStars: Point[]; canonicalCandidate: Point } {
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

function keyOfPoint([r, c]: Point): string {
  return `${r},${c}`;
}

function isSolutionCompatible(grid: GridSolution, stars: Point[]): boolean {
  return stars.every(([r, c]) => grid[r][c] === 1);
}

function extractFeatures(
  starsAbs: Point[],
  candidateAbs: Point,
  boardSize: number,
  compatibleSolutions?: GridSolution[],
): any {
  const [r, c] = candidateAbs;
  const last = boardSize - 1;
  const N = boardSize;

  return {
    candidate_on_top_edge: r === 0,
    candidate_on_bottom_edge: r === last,
    candidate_on_left_edge: c === 0,
    candidate_on_right_edge: c === last,
    candidate_on_outer_ring: r === 1 || r === last - 1 || c === 1 || c === last - 1,
    some_star_on_top_edge: starsAbs.some(([sr]) => sr === 0),
    some_star_on_bottom_edge: starsAbs.some(([sr]) => sr === last),
    some_star_on_left_edge: starsAbs.some(([, sc]) => sc === 0),
    some_star_on_right_edge: starsAbs.some(([, sc]) => sc === last),
    candidate_in_same_row_as_any_star: starsAbs.some(([sr]) => sr === r),
    candidate_in_same_column_as_any_star: starsAbs.some(([, sc]) => sc === c),
    candidate_between_stars_in_row: (() => {
      const starsInRow = starsAbs.filter(([sr]) => sr === r);
      if (starsInRow.length >= 2) {
        const cols = starsInRow.map(([, sc]) => sc);
        return c > Math.min(...cols) && c < Math.max(...cols);
      }
      return false;
    })(),
    candidate_between_stars_in_column: (() => {
      const starsInCol = starsAbs.filter(([, sc]) => sc === c);
      if (starsInCol.length >= 2) {
        const rows = starsInCol.map(([sr]) => sr);
        return r > Math.min(...rows) && r < Math.max(...rows);
      }
      return false;
    })(),
    candidate_row_needs_star: compatibleSolutions ? compatibleSolutions.every(grid => {
      for (let col = 0; col < N; col++) {
        if (col !== c && grid[r][col] === 1) return true;
      }
      return false;
    }) : false,
    candidate_column_needs_star: compatibleSolutions ? compatibleSolutions.every(grid => {
      for (let row = 0; row < N; row++) {
        if (row !== r && grid[row][c] === 1) return true;
      }
      return false;
    }) : false,
    ring_index: Math.min(r, c, N - 1 - r, N - 1 - c),
    candidate_in_ring_1: Math.min(r, c, N - 1 - r, N - 1 - c) === 1,
    candidate_in_top_left_KxK: r < 3 && c < 3,
    candidate_in_top_right_KxK: r < 3 && c >= N - 3,
    candidate_in_bottom_left_KxK: r >= N - 3 && c < 3,
    candidate_in_bottom_right_KxK: r >= N - 3 && c >= N - 3,
  };
}

if (parentPort) {
  const { starPairs, solutions, boardSize, workerId, totalWorkers, minOccurrences } = workerData as WorkerData;

  const buckets = new Map<string, TripleBucket>();
  let processed = 0;
  const totalPairs = starPairs.length;
  const reportInterval = Math.max(1, Math.floor(totalPairs / 100)); // Report every 1%

  // Iterate over star pairs assigned to this worker
  for (const starPair of starPairs) {
    const starsAbs: Point[] = starPair.map(cell => [cell.row, cell.col]);
    const compatible = solutions.filter(g => isSolutionCompatible(g, starsAbs));
    
    if (compatible.length === 0) {
      processed++;
      if (processed % reportInterval === 0 || processed === totalPairs) {
        parentPort.postMessage({
          type: 'progress',
          workerId,
          processed,
          total: totalPairs,
        });
      }
      continue;
    }

    const compatCount = compatible.length;
    const starSet = new Set(starsAbs.map(keyOfPoint));

    // Classify all candidate cells
    for (let r = 0; r < boardSize; r++) {
      for (let c = 0; c < boardSize; c++) {
        const keyAbs = keyOfPoint([r, c]);
        if (starSet.has(keyAbs)) continue;

        let starCount = 0;
        for (const g of compatible) {
          if (g[r][c] === 1) starCount++;
        }
        const emptyCount = compatCount - starCount;

        const cell: Point = [r, c];
        const { canonicalStars, canonicalCandidate } = canonicalizeTriple(starsAbs, cell);
        const features = extractFeatures(starsAbs, cell, boardSize, compatible);

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

        if (starCount === 0) {
          bucket.occurrences.push({
            canonicalStars,
            canonicalCandidate,
            forced: true,
            features,
          });
        } else if (emptyCount === 0) {
          // Skip forced stars
          continue;
        } else {
          bucket.occurrences.push({
            canonicalStars,
            canonicalCandidate,
            forced: false,
            features,
          });
        }
      }
    }

    processed++;
    if (processed % reportInterval === 0 || processed === totalPairs) {
      parentPort.postMessage({
        type: 'progress',
        workerId,
        processed,
        total: totalPairs,
      });
    }
  }

  parentPort.postMessage({
    type: 'done',
    workerId,
    buckets: Array.from(buckets.entries()),
  });
}

