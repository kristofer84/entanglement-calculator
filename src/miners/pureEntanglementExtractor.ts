import { Pattern, Output } from '../types';
import * as fs from 'fs';
import * as path from 'path';

// Type definitions
export type Point = [number, number]; // [row, col]
type StarPair = [Point, Point];
export type Transform = (row: number, col: number) => Point;

// D4 symmetry group transforms (8 transforms)
export const transforms: Transform[] = [
  // f0: identity
  (r, c) => [r, c],
  // f1: reflect across vertical axis
  (r, c) => [-r, c],
  // f2: reflect across horizontal axis
  (r, c) => [r, -c],
  // f3: reflect across both axes (180° rotation)
  (r, c) => [-r, -c],
  // f4: reflect across main diagonal (swap and reflect)
  (r, c) => [c, r],
  // f5: reflect across anti-diagonal
  (r, c) => [-c, r],
  // f6: reflect across main diagonal then horizontal
  (r, c) => [c, -r],
  // f7: reflect across anti-diagonal then vertical
  (r, c) => [-c, -r],
];

export interface CanonicalizationResult {
  canonicalStars: StarPair;
  transformIndex: number;
  translation: Point; // [min_row, min_col]
}

export interface CanonicalPattern {
  canonicalStars: Point[];
  canonicalCells: Point[];
  transformIndex: number;
  translation: Point;
}

interface StarClass {
  occurrenceCount: number;
  emptiesMap: Map<string, number>; // key is JSON stringified sorted array of points
}

interface PureEntanglementTemplate {
  canonical_stars: Point[];
  canonical_forced_empty: Point[];
  occurrences: number;
}

interface PureEntanglementOutput {
  board_size: number;
  initial_stars: number;
  pure_entanglement_templates: PureEntanglementTemplate[];
}

/**
 * Generic canonicalization function that works with Z stars (any number of stars)
 * Applies D4 symmetry transforms and translation to find canonical form
 */
export function canonicalize(pointsStars: Point[], pointsCells: Point[]): CanonicalPattern {
  if (pointsStars.length === 0) {
    throw new Error('canonicalize expects at least one star');
  }

  let bestStars: Point[] | null = null;
  let bestCells: Point[] = [];
  let bestTransformIndex = 0;
  let bestTranslation: Point = [0, 0];
  let bestKey: string = '';

  // Try all 8 D4 transforms
  for (let t = 0; t < transforms.length; t++) {
    const tf = transforms[t];

    // Apply transform to all stars
    const sT = pointsStars.map(star => tf(star[0], star[1]));
    // Apply transform to all cells
    const cT = pointsCells.map(cell => tf(cell[0], cell[1]));

    // Find minimum row and column among stars
    const minRow = Math.min(...sT.map(p => p[0]));
    const minCol = Math.min(...sT.map(p => p[1]));

    // Translate so minimum star is at origin
    const shift = (p: Point): Point => [p[0] - minRow, p[1] - minCol];

    const sN = sT.map(shift).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cN = cT.map(shift).sort((a, b) => a[0] - b[0] || a[1] - b[1]);

    // Create key for comparison
    const key = JSON.stringify(sN);

    // Keep lexicographically smallest
    if (!bestStars || key < bestKey) {
      bestStars = sN;
      bestCells = cN;
      bestTransformIndex = t;
      bestTranslation = [minRow, minCol];
      bestKey = key;
    }
  }

  if (!bestStars) {
    throw new Error('Failed to canonicalize stars');
  }

  return {
    canonicalStars: bestStars,
    canonicalCells: bestCells,
    transformIndex: bestTransformIndex,
    translation: bestTranslation,
  };
}

/**
 * Canonicalize a star pair using D4 symmetry (backward compatibility wrapper)
 */
export function canonicalizeStars(initialStars: Point[]): CanonicalizationResult {
  if (initialStars.length !== 2) {
    throw new Error('canonicalizeStars expects exactly 2 stars');
  }

  const result = canonicalize(initialStars, []);
  return {
    canonicalStars: [result.canonicalStars[0], result.canonicalStars[1]] as StarPair,
    transformIndex: result.transformIndex,
    translation: result.translation,
  };
}

/**
 * Canonicalize forced-empty cells using the same transform and translation
 */
export function canonicalizeEmpties(
  forcedEmpty: Point[],
  transformIndex: number,
  translation: Point
): Point[] {
  const transform = transforms[transformIndex];
  const [minRow, minCol] = translation;
  
  const canonicalEmpties: Point[] = forcedEmpty.map(([row, col]) => {
    const [tRow, tCol] = transform(row, col);
    return [tRow - minRow, tCol - minCol];
  });
  
  // Sort lexicographically
  canonicalEmpties.sort((a, b) => {
    if (a[0] !== b[0]) return a[0] - b[0];
    return a[1] - b[1];
  });
  
  return canonicalEmpties;
}

/**
 * Extract pure entanglement geometries from patterns
 */
export function extractPureEntanglements(
  output: Output,
  minOccurrences: number = 2
): PureEntanglementOutput {
  const starClasses = new Map<string, StarClass>();
  
  // Process each pattern
  for (const pattern of output.patterns) {
    // Convert initial_stars from Cell[] to Point[]
    const initialStars: Point[] = pattern.initial_stars.map(cell => [cell.row, cell.col]);
    
    // Skip patterns with no stars
    if (initialStars.length === 0) {
      continue;
    }
    
    // Convert forced_empty from Cell[] to Point[]
    const forcedEmpty: Point[] = pattern.forced_empty.map(cell => [cell.row, cell.col]);
    
    // Canonicalize stars and empties together using generic canonicalize
    const { canonicalStars, canonicalCells, transformIndex, translation } = 
      canonicalize(initialStars, forcedEmpty);
    const starKey = JSON.stringify(canonicalStars);
    const emptiesKey = JSON.stringify(canonicalCells);
    
    // Update star class
    if (!starClasses.has(starKey)) {
      starClasses.set(starKey, {
        occurrenceCount: 0,
        emptiesMap: new Map(),
      });
    }
    
    const starClass = starClasses.get(starKey)!;
    starClass.occurrenceCount++;
    starClass.emptiesMap.set(emptiesKey, (starClass.emptiesMap.get(emptiesKey) || 0) + 1);
  }
  
  // Extract pure entanglement templates
  const pureEntanglementTemplates: PureEntanglementTemplate[] = [];
  
  for (const [starKey, starClass] of starClasses.entries()) {
    const distinctForcedPatterns = starClass.emptiesMap.size;
    const totalOccurrences = starClass.occurrenceCount;
    
    // Pure entanglement: exactly one distinct forced-empty pattern and at least minOccurrences occurrences
    if (distinctForcedPatterns === 1 && totalOccurrences >= minOccurrences) {
      const emptiesKey = Array.from(starClass.emptiesMap.keys())[0];
      const canonicalStars: Point[] = JSON.parse(starKey);
      const canonicalForcedEmpty: Point[] = JSON.parse(emptiesKey);
      
      pureEntanglementTemplates.push({
        canonical_stars: canonicalStars,
        canonical_forced_empty: canonicalForcedEmpty,
        occurrences: totalOccurrences,
      });
    }
  }
  
  // Sort by occurrences descending, then by lexicographic order of canonical_stars
  pureEntanglementTemplates.sort((a, b) => {
    if (b.occurrences !== a.occurrences) {
      return b.occurrences - a.occurrences;
    }
    const aKey = JSON.stringify(a.canonical_stars);
    const bKey = JSON.stringify(b.canonical_stars);
    return aKey.localeCompare(bKey);
  });
  
  return {
    board_size: output.board_size,
    initial_stars: output.initial_star_count,
    pure_entanglement_templates: pureEntanglementTemplates,
  };
}

/**
 * Write pure entanglement output to JSON file
 */
export function writePureEntanglementOutput(
  output: PureEntanglementOutput,
  outputPath: string
): void {
  // Ensure output directory exists
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const jsonString = JSON.stringify(output, null, 2);
  fs.writeFileSync(outputPath, jsonString, 'utf-8');
}

/**
 * Load output from JSON file and extract pure entanglements
 */
export function extractFromFile(
  inputPath: string,
  outputPath: string,
  minOccurrences: number = 2
): void {
  const jsonContent = fs.readFileSync(inputPath, 'utf-8');
  const output: Output = JSON.parse(jsonContent);
  
  // Convert compressed format back to Pattern format
  const patterns: Pattern[] = output.patterns.map((p: any) => ({
    initial_stars: p.initial_stars.map(([row, col]: number[]) => ({ row, col })),
    compatible_solutions: p.compatible_solutions || 0,
    forced_empty: (p.forced_empty || []).map(([row, col]: number[]) => ({ row, col })),
    forced_star: (p.forced_star || []).map(([row, col]: number[]) => ({ row, col })),
  }));
  
  const fullOutput: Output = {
    ...output,
    patterns,
  };
  
  const pureEntanglements = extractPureEntanglements(fullOutput, minOccurrences);
  writePureEntanglementOutput(pureEntanglements, outputPath);
  
  console.log(`Extracted ${pureEntanglements.pure_entanglement_templates.length} pure entanglement templates`);
  console.log(`Total occurrences: ${pureEntanglements.pure_entanglement_templates.reduce((sum, t) => sum + t.occurrences, 0)}`);
}
