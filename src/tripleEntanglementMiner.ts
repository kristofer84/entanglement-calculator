import { Pattern, Output, Cell, Grid } from './types';
import { canonicalize, transforms, Point } from './pureEntanglementExtractor';
import { ConfigurationEnumerator } from './enumeration';
import * as fs from 'fs';
import * as path from 'path';

// Type definitions
interface TripleOccurrence {
  canonical_stars: Point[];
  canonical_candidate: Point;
  abs_stars: Point[];
  abs_candidate: Point;
  is_forced: boolean; // true if forced empty, false if flexible
  extra_features: TripleFeatureSet;
}

interface TripleFeatureSet {
  // Star-based features (work for any Z)
  anyStarOnTopEdge: boolean;
  anyStarOnBottomEdge: boolean;
  anyStarOnLeftEdge: boolean;
  anyStarOnRightEdge: boolean;
  allStarsInLeftHalf: boolean;
  allStarsInRightHalf: boolean;
  allStarsInTopHalf: boolean;
  allStarsInBottomHalf: boolean;
  min_row_is_0: boolean;
  max_row_is_board_size_minus_1: boolean;
  min_col_is_0: boolean;
  max_col_is_board_size_minus_1: boolean;
  
  // Candidate cell features
  candidate_on_top_edge: boolean;
  candidate_on_bottom_edge: boolean;
  candidate_on_left_edge: boolean;
  candidate_on_right_edge: boolean;
  candidate_on_outer_ring: boolean; // on any edge
  candidate_in_top_left_3x3: boolean;
  candidate_in_top_right_3x3: boolean;
  candidate_in_bottom_left_3x3: boolean;
  candidate_in_bottom_right_3x3: boolean;
}

interface TripleRule {
  canonical_stars: Point[];
  canonical_candidate: Point;
  constraint_features: string[];
  forced: boolean;
  occurrences: number;
}

interface TripleEntanglementOutput {
  board_size: number;
  initial_stars: number;
  unconstrained_rules: TripleRule[];
  constrained_rules: TripleRule[];
}

/**
 * Canonicalize a triple (Z stars + candidate cell) using D4 symmetry
 * Works with any number of stars
 */
function canonicalizeTriple(
  stars: Point[],
  candidate: Point
): { canonicalStars: Point[]; canonicalCandidate: Point; transformIndex: number; translation: Point } {
  if (stars.length === 0) {
    throw new Error('canonicalizeTriple expects at least one star');
  }

  // Use the generic canonicalize function, treating candidate as a cell
  const result = canonicalize(stars, [candidate]);
  
  // Extract candidate from canonicalCells (should be single element)
  if (result.canonicalCells.length !== 1) {
    throw new Error('Expected exactly one candidate cell after canonicalization');
  }

  return {
    canonicalStars: result.canonicalStars,
    canonicalCandidate: result.canonicalCells[0],
    transformIndex: result.transformIndex,
    translation: result.translation,
  };
}

/**
 * Extract features from a triple occurrence (works for any Z stars)
 */
function extractTripleFeatures(
  occurrence: TripleOccurrence,
  boardSize: number
): TripleFeatureSet {
  const stars = occurrence.abs_stars;
  const [c_row, c_col] = occurrence.abs_candidate;
  
  if (stars.length === 0) {
    throw new Error('extractTripleFeatures expects at least one star');
  }
  
  const minRow = Math.min(...stars.map(([r]) => r));
  const maxRow = Math.max(...stars.map(([r]) => r));
  const minCol = Math.min(...stars.map(([, c]) => c));
  const maxCol = Math.max(...stars.map(([, c]) => c));
  
  const halfSize = Math.floor(boardSize / 2);
  
  // Aggregate star features
  const anyStarOnTopEdge = stars.some(([r]) => r === 0);
  const anyStarOnBottomEdge = stars.some(([r]) => r === boardSize - 1);
  const anyStarOnLeftEdge = stars.some(([, c]) => c === 0);
  const anyStarOnRightEdge = stars.some(([, c]) => c === boardSize - 1);
  
  const allStarsInTopHalf = stars.every(([r]) => r < halfSize);
  const allStarsInBottomHalf = stars.every(([r]) => r >= halfSize);
  const allStarsInLeftHalf = stars.every(([, c]) => c < halfSize);
  const allStarsInRightHalf = stars.every(([, c]) => c >= halfSize);
  
  return {
    // Star-based features (work for any Z)
    anyStarOnTopEdge,
    anyStarOnBottomEdge,
    anyStarOnLeftEdge,
    anyStarOnRightEdge,
    allStarsInLeftHalf,
    allStarsInRightHalf,
    allStarsInTopHalf,
    allStarsInBottomHalf,
    min_row_is_0: minRow === 0,
    max_row_is_board_size_minus_1: maxRow === boardSize - 1,
    min_col_is_0: minCol === 0,
    max_col_is_board_size_minus_1: maxCol === boardSize - 1,
    
    // Candidate cell features
    candidate_on_top_edge: c_row === 0,
    candidate_on_bottom_edge: c_row === boardSize - 1,
    candidate_on_left_edge: c_col === 0,
    candidate_on_right_edge: c_col === boardSize - 1,
    candidate_on_outer_ring: c_row === 0 || c_row === boardSize - 1 || c_col === 0 || c_col === boardSize - 1,
    candidate_in_top_left_3x3: c_row >= 0 && c_row <= 2 && c_col >= 0 && c_col <= 2,
    candidate_in_top_right_3x3: c_row >= 0 && c_row <= 2 && c_col >= boardSize - 3 && c_col <= boardSize - 1,
    candidate_in_bottom_left_3x3: c_row >= boardSize - 3 && c_row <= boardSize - 1 && c_col >= 0 && c_col <= 2,
    candidate_in_bottom_right_3x3: c_row >= boardSize - 3 && c_row <= boardSize - 1 && c_col >= boardSize - 3 && c_col <= boardSize - 1,
  };
}

/**
 * Get all feature names from TripleFeatureSet
 */
function getTripleFeatureNames(): string[] {
  return [
    'anyStarOnTopEdge',
    'anyStarOnBottomEdge',
    'anyStarOnLeftEdge',
    'anyStarOnRightEdge',
    'allStarsInLeftHalf',
    'allStarsInRightHalf',
    'allStarsInTopHalf',
    'allStarsInBottomHalf',
    'min_row_is_0',
    'max_row_is_board_size_minus_1',
    'min_col_is_0',
    'max_col_is_board_size_minus_1',
    'candidate_on_top_edge',
    'candidate_on_bottom_edge',
    'candidate_on_left_edge',
    'candidate_on_right_edge',
    'candidate_on_outer_ring',
    'candidate_in_top_left_3x3',
    'candidate_in_top_right_3x3',
    'candidate_in_bottom_left_3x3',
    'candidate_in_bottom_right_3x3',
  ];
}

/**
 * Get feature value from occurrence
 */
function getTripleFeatureValue(occurrence: TripleOccurrence, featureName: string): boolean {
  return (occurrence.extra_features as any)[featureName] || false;
}

/**
 * Check if a candidate cell is forced empty for a given star pattern
 */
function isCandidateForcedEmpty(
  stars: Cell[],
  candidate: Cell,
  solutions: Grid[]
): boolean {
  // Find compatible solutions
  const compatibleSolutions = solutions.filter(solution =>
    ConfigurationEnumerator.isPatternCompatible(stars, solution)
  );
  
  if (compatibleSolutions.length === 0) {
    return false; // Pattern not realizable
  }
  
  // Check if candidate is empty in all compatible solutions
  return compatibleSolutions.every(solution =>
    solution[candidate.row][candidate.col] === 0
  );
}

/**
 * Mine triple entanglements from patterns
 */
export function mineTripleEntanglements(
  output: Output,
  solutions: Grid[],
  minOccurrences: number = 2
): TripleEntanglementOutput {
  const tripleOccurrences: TripleOccurrence[] = [];
  
  // Step 1: Process all patterns and build triples
  for (const pattern of output.patterns) {
    // Skip patterns with no stars
    if (pattern.initial_stars.length === 0) {
      continue;
    }
    
    // Convert initial_stars from Cell[] to Point[]
    const initialStars: Point[] = pattern.initial_stars.map(cell => [cell.row, cell.col]);
    
    // For each forced_empty cell, create a triple
    for (const emptyCell of pattern.forced_empty) {
      const candidate: Point = [emptyCell.row, emptyCell.col];
      
      // Canonicalize triple
      const { canonicalStars, canonicalCandidate } = canonicalizeTriple(initialStars, candidate);
      
      // Check if candidate is forced empty (should be true since it's in forced_empty)
      const isForced = isCandidateForcedEmpty(pattern.initial_stars, emptyCell, solutions);
      
      // Create occurrence record
      const occurrence: TripleOccurrence = {
        canonical_stars: canonicalStars,
        canonical_candidate: canonicalCandidate,
        abs_stars: initialStars,
        abs_candidate: candidate,
        is_forced: isForced,
        extra_features: {} as TripleFeatureSet, // Will be filled below
      };
      
      // Extract features
      occurrence.extra_features = extractTripleFeatures(occurrence, output.board_size);
      
      tripleOccurrences.push(occurrence);
    }
  }
  
  // Step 2: Also check all possible placements of canonical triples
  // For each canonical triple discovered from patterns, find all placements on the board
  const canonicalTriples = new Map<string, { stars: Point[]; candidate: Point }>();
  const seenPlacements = new Set<string>(); // Track seen (canonical_triple, abs_stars, abs_candidate) to avoid duplicates
  
  for (const occ of tripleOccurrences) {
    const key = JSON.stringify([occ.canonical_stars, occ.canonical_candidate]);
    if (!canonicalTriples.has(key)) {
      canonicalTriples.set(key, {
        stars: occ.canonical_stars,
        candidate: occ.canonical_candidate,
      });
    }
    // Mark this placement as seen
    const placementKey = JSON.stringify([key, occ.abs_stars, occ.abs_candidate]);
    seenPlacements.add(placementKey);
  }
  
  // For each canonical triple, try all placements
  for (const [tripleKey, triple] of canonicalTriples.entries()) {
    const [canonStars, canonCandidate] = JSON.parse(tripleKey);
    const [c0_row, c0_col] = canonCandidate;
    
    // Try all translations that fit on the board
    for (let baseRow = 0; baseRow < output.board_size; baseRow++) {
      for (let baseCol = 0; baseCol < output.board_size; baseCol++) {
        // Calculate absolute positions for all stars
        const absStars: Point[] = canonStars.map((star: Point) => [baseRow + star[0], baseCol + star[1]]);
        const absCandidate: Point = [baseRow + c0_row, baseCol + c0_col];
        
        // Check bounds for all stars and candidate
        let outOfBounds = false;
        for (const star of absStars) {
          if (star[0] < 0 || star[0] >= output.board_size ||
              star[1] < 0 || star[1] >= output.board_size) {
            outOfBounds = true;
            break;
          }
        }
        if (outOfBounds || 
            absCandidate[0] < 0 || absCandidate[0] >= output.board_size ||
            absCandidate[1] < 0 || absCandidate[1] >= output.board_size) {
          continue;
        }
        
        // Check adjacency (stars can't be adjacent to each other)
        let hasAdjacentStars = false;
        for (let i = 0; i < absStars.length; i++) {
          for (let j = i + 1; j < absStars.length; j++) {
            const rowDiff = Math.abs(absStars[i][0] - absStars[j][0]);
            const colDiff = Math.abs(absStars[i][1] - absStars[j][1]);
            if (rowDiff <= 1 && colDiff <= 1) {
              hasAdjacentStars = true;
              break;
            }
          }
          if (hasAdjacentStars) break;
        }
        if (hasAdjacentStars) {
          continue; // Stars are adjacent, invalid
        }
        
        // Convert to Cell format
        const starCells: Cell[] = absStars.map(([r, c]) => ({ row: r, col: c }));
        const candidateCell: Cell = { row: absCandidate[0], col: absCandidate[1] };
        
        // Check if this pattern is compatible with any solution
        const hasCompatibleSolution = solutions.some(solution =>
          ConfigurationEnumerator.isPatternCompatible(starCells, solution)
        );
        
        if (!hasCompatibleSolution) {
          continue; // Pattern not realizable
        }
        
        // Check if we've already seen this placement
        const placementKey = JSON.stringify([tripleKey, absStars, absCandidate]);
        if (seenPlacements.has(placementKey)) {
          continue; // Already processed from patterns
        }
        seenPlacements.add(placementKey);
        
        // Check if candidate is forced empty
        const isForced = isCandidateForcedEmpty(starCells, candidateCell, solutions);
        
        // Create occurrence
        const occurrence: TripleOccurrence = {
          canonical_stars: canonStars,
          canonical_candidate: canonCandidate,
          abs_stars: absStars,
          abs_candidate: absCandidate,
          is_forced: isForced,
          extra_features: {} as TripleFeatureSet,
        };
        
        // Extract features
        occurrence.extra_features = extractTripleFeatures(occurrence, output.board_size);
        
        tripleOccurrences.push(occurrence);
      }
    }
  }
  
  // Step 3: Group occurrences by canonical triple
  const tripleGroups = new Map<string, TripleOccurrence[]>();
  
  for (const occ of tripleOccurrences) {
    const key = JSON.stringify([occ.canonical_stars, occ.canonical_candidate]);
    if (!tripleGroups.has(key)) {
      tripleGroups.set(key, []);
    }
    tripleGroups.get(key)!.push(occ);
  }
  
  // Step 4: Mine constraints
  const unconstrainedRules: TripleRule[] = [];
  const constrainedRules: TripleRule[] = [];
  const featureNames = getTripleFeatureNames();
  
  for (const [tripleKey, occurrences] of tripleGroups.entries()) {
    const [canonStars, canonCandidate] = JSON.parse(tripleKey);
    
    // Separate forced and flexible occurrences
    const posOccs = occurrences.filter(occ => occ.is_forced);
    const negOccs = occurrences.filter(occ => !occ.is_forced);
    
    if (posOccs.length < minOccurrences) {
      continue;
    }
    
    if (negOccs.length === 0) {
      // Only forced occurrences - unconstrained rule
      unconstrainedRules.push({
        canonical_stars: canonStars,
        canonical_candidate: canonCandidate,
        constraint_features: [],
        forced: true,
        occurrences: posOccs.length,
      });
    } else {
      // Both forced and flexible - try to find constraints
      // Try single-feature constraints
      const singleFeatureConstraints: string[] = [];
      for (const featureName of featureNames) {
        // Check if all positive examples have this feature true
        const allPosHaveFeature = posOccs.every(occ => getTripleFeatureValue(occ, featureName));
        
        if (allPosHaveFeature) {
          // Check if NO negative example has this feature true
          const noNegHasFeature = !negOccs.some(occ => getTripleFeatureValue(occ, featureName));
          
          if (noNegHasFeature) {
            singleFeatureConstraints.push(featureName);
          }
        }
      }
      
      // Try two-feature conjunctions if single features don't work
      let bestConstraints: string[] = singleFeatureConstraints;
      
      if (singleFeatureConstraints.length === 0) {
        // Try pairs of features
        for (let i = 0; i < featureNames.length; i++) {
          for (let j = i + 1; j < featureNames.length; j++) {
            const f1 = featureNames[i];
            const f2 = featureNames[j];
            
            // Check if all positive examples have both features true
            const allPosHaveBoth = posOccs.every(occ => 
              getTripleFeatureValue(occ, f1) && getTripleFeatureValue(occ, f2)
            );
            
            if (allPosHaveBoth) {
              // Check if no negative example has both features true
              const noNegHasBoth = !negOccs.some(occ => 
                getTripleFeatureValue(occ, f1) && getTripleFeatureValue(occ, f2)
              );
              
              if (noNegHasBoth) {
                // Found a separating pair
                if (bestConstraints.length === 0 || bestConstraints.length > 2) {
                  bestConstraints = [f1, f2];
                }
              }
            }
          }
        }
      } else {
        // Use the first single feature constraint (simplest)
        bestConstraints = [singleFeatureConstraints[0]];
      }
      
      if (bestConstraints.length > 0) {
        constrainedRules.push({
          canonical_stars: canonStars,
          canonical_candidate: canonCandidate,
          constraint_features: bestConstraints,
          forced: true,
          occurrences: posOccs.length,
        });
      }
    }
  }
  
  // Sort rules
  const sortRules = (rules: TripleRule[]) => {
    rules.sort((a, b) => {
      if (b.occurrences !== a.occurrences) {
        return b.occurrences - a.occurrences;
      }
      const aKey = JSON.stringify([a.canonical_stars, a.canonical_candidate]);
      const bKey = JSON.stringify([b.canonical_stars, b.canonical_candidate]);
      return aKey.localeCompare(bKey);
    });
  };
  
  sortRules(unconstrainedRules);
  sortRules(constrainedRules);
  
  return {
    board_size: output.board_size,
    initial_stars: output.initial_star_count,
    unconstrained_rules: unconstrainedRules,
    constrained_rules: constrainedRules,
  };
}

/**
 * Write triple entanglement output to JSON file
 */
export function writeTripleEntanglementOutput(
  output: TripleEntanglementOutput,
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
 * Load output from JSON file and mine triple entanglements
 */
export function mineTripleFromFile(
  inputPath: string,
  solutionsPath: string,
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
  
  // Load solutions
  const solutionsContent = fs.readFileSync(solutionsPath, 'utf-8');
  const solutions: Grid[] = JSON.parse(solutionsContent);
  
  const tripleEntanglements = mineTripleEntanglements(fullOutput, solutions, minOccurrences);
  writeTripleEntanglementOutput(tripleEntanglements, outputPath);
  
  console.log(`Found ${tripleEntanglements.unconstrained_rules.length} unconstrained triple rules`);
  console.log(`Found ${tripleEntanglements.constrained_rules.length} constrained triple rules`);
  console.log(`Total unconstrained occurrences: ${tripleEntanglements.unconstrained_rules.reduce((sum, r) => sum + r.occurrences, 0)}`);
  console.log(`Total constrained occurrences: ${tripleEntanglements.constrained_rules.reduce((sum, r) => sum + r.occurrences, 0)}`);
}
