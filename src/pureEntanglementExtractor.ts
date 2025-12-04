import { Pattern, Output } from './types';
import * as fs from 'fs';
import * as path from 'path';

// Type definitions
type Point = [number, number]; // [row, col]
type StarPair = [Point, Point];
type Transform = (row: number, col: number) => Point;

// D4 symmetry group transforms (8 transforms)
const transforms: Transform[] = [
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

interface CanonicalizationResult {
  canonicalStars: StarPair;
  transformIndex: number;
  translation: Point; // [min_row, min_col]
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
 * Canonicalize a star pair using D4 symmetry
 */
function canonicalizeStars(initialStars: Point[]): CanonicalizationResult {
  if (initialStars.length !== 2) {
    throw new Error('canonicalizeStars expects exactly 2 stars');
  }

  const [star1, star2] = initialStars;
  let bestResult: CanonicalizationResult | null = null;
  let bestKey: string = '';

  // Try all 8 transforms
  for (let i = 0; i < transforms.length; i++) {
    const transform = transforms[i];
    
    // Apply transform to both stars
    const [t1_row, t1_col] = transform(star1[0], star1[1]);
    const [t2_row, t2_col] = transform(star2[0], star2[1]);
    
    // Find minimum row and column
    const minRow = Math.min(t1_row, t2_row);
    const minCol = Math.min(t1_col, t2_col);
    
    // Translate to origin
    const p1: Point = [t1_row - minRow, t1_col - minCol];
    const p2: Point = [t2_row - minRow, t2_col - minCol];
    
    // Sort lexicographically (by row then column)
    let sortedPair: StarPair;
    if (p1[0] < p2[0] || (p1[0] === p2[0] && p1[1] < p2[1])) {
      sortedPair = [p1, p2];
    } else {
      sortedPair = [p2, p1];
    }
    
    // Create a key for comparison
    const key = JSON.stringify(sortedPair);
    
    // Keep the lexicographically smallest
    if (bestResult === null || key < bestKey) {
      bestResult = {
        canonicalStars: sortedPair,
        transformIndex: i,
        translation: [minRow, minCol],
      };
      bestKey = key;
    }
  }

  if (!bestResult) {
    throw new Error('Failed to canonicalize stars');
  }

  return bestResult;
}

/**
 * Canonicalize forced-empty cells using the same transform and translation
 */
function canonicalizeEmpties(
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
    
    // Convert forced_empty from Cell[] to Point[]
    const forcedEmpty: Point[] = pattern.forced_empty.map(cell => [cell.row, cell.col]);
    
    // Canonicalize stars
    const { canonicalStars, transformIndex, translation } = canonicalizeStars(initialStars);
    const starKey = JSON.stringify(canonicalStars);
    
    // Canonicalize empties
    const canonicalEmpties = canonicalizeEmpties(forcedEmpty, transformIndex, translation);
    const emptiesKey = JSON.stringify(canonicalEmpties);
    
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
