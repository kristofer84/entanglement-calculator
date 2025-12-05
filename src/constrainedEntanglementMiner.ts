import { Pattern, Output } from './types';
import { canonicalize, Point } from './pureEntanglementExtractor';
import * as fs from 'fs';
import * as path from 'path';

// Type definitions
interface Occurrence {
  canonical_stars: Point[];
  canonical_forced_empty: Point[];
  abs_stars: Point[];
  abs_forced_empty: Point[];
  compatible_solutions?: number;
  extra_features: FeatureSet;
}

interface FeatureSet {
  // Star-based features (work for any Z)
  anyStarOnTopEdge: boolean;
  anyStarOnBottomEdge: boolean;
  anyStarOnLeftEdge: boolean;
  anyStarOnRightEdge: boolean;
  allStarsInLeftHalf: boolean;
  allStarsInRightHalf: boolean;
  allStarsInTopHalf: boolean;
  allStarsInBottomHalf: boolean;
  
  // Combined star position features
  min_row_is_0: boolean;
  max_row_is_board_size_minus_1: boolean;
  min_col_is_0: boolean;
  max_col_is_board_size_minus_1: boolean;
  
  // Empty cell features
  has_empty_on_row0: boolean;
  has_empty_on_row_board_size_minus_1: boolean;
  has_empty_on_col0: boolean;
  has_empty_on_col_board_size_minus_1: boolean;
  has_empty_in_top_left_3x3: boolean;
  has_empty_in_top_right_3x3: boolean;
  has_empty_in_bottom_left_3x3: boolean;
  has_empty_in_bottom_right_3x3: boolean;
}

interface ConstrainedRule {
  canonical_stars: Point[];
  canonical_forced_empty: Point[];
  constraint_features: string[];
  occurrences: number;
}

interface ConstrainedEntanglementOutput {
  board_size: number;
  initial_stars: number;
  unconstrained_rules: ConstrainedRule[];
  constrained_rules: ConstrainedRule[];
}

/**
 * Extract features from an occurrence (works for any Z stars)
 */
function extractFeatures(
  occurrence: Occurrence,
  boardSize: number
): FeatureSet {
  const stars = occurrence.abs_stars;
  
  if (stars.length === 0) {
    throw new Error('extractFeatures expects at least one star');
  }
  
  const minRow = Math.min(...stars.map(([r]) => r));
  const maxRow = Math.max(...stars.map(([r]) => r));
  const minCol = Math.min(...stars.map(([, c]) => c));
  const maxCol = Math.max(...stars.map(([, c]) => c));
  
  const halfSize = Math.floor(boardSize / 2);
  
  // Check for empties in specific regions
  const empties = occurrence.abs_forced_empty;
  const emptyRows = new Set(empties.map(([r]) => r));
  const emptyCols = new Set(empties.map(([, c]) => c));
  
  const hasEmptyInRegion = (minR: number, maxR: number, minC: number, maxC: number): boolean => {
    return empties.some(([r, c]) => r >= minR && r <= maxR && c >= minC && c <= maxC);
  };
  
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
    
    // Combined star position features
    min_row_is_0: minRow === 0,
    max_row_is_board_size_minus_1: maxRow === boardSize - 1,
    min_col_is_0: minCol === 0,
    max_col_is_board_size_minus_1: maxCol === boardSize - 1,
    
    // Empty cell features
    has_empty_on_row0: emptyRows.has(0),
    has_empty_on_row_board_size_minus_1: emptyRows.has(boardSize - 1),
    has_empty_on_col0: emptyCols.has(0),
    has_empty_on_col_board_size_minus_1: emptyCols.has(boardSize - 1),
    has_empty_in_top_left_3x3: hasEmptyInRegion(0, 2, 0, 2),
    has_empty_in_top_right_3x3: hasEmptyInRegion(0, 2, boardSize - 3, boardSize - 1),
    has_empty_in_bottom_left_3x3: hasEmptyInRegion(boardSize - 3, boardSize - 1, 0, 2),
    has_empty_in_bottom_right_3x3: hasEmptyInRegion(boardSize - 3, boardSize - 1, boardSize - 3, boardSize - 1),
  };
}

/**
 * Get all feature names from FeatureSet
 */
function getFeatureNames(): string[] {
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
    'has_empty_on_row0',
    'has_empty_on_row_board_size_minus_1',
    'has_empty_on_col0',
    'has_empty_on_col_board_size_minus_1',
    'has_empty_in_top_left_3x3',
    'has_empty_in_top_right_3x3',
    'has_empty_in_bottom_left_3x3',
    'has_empty_in_bottom_right_3x3',
  ];
}

/**
 * Get feature value from occurrence
 */
function getFeatureValue(occurrence: Occurrence, featureName: string): boolean {
  return (occurrence.extra_features as any)[featureName] || false;
}

/**
 * Mine constrained entanglements from patterns
 */
export function mineConstrainedEntanglements(
  output: Output,
  minOccurrences: number = 2
): ConstrainedEntanglementOutput {
  const occurrences: Occurrence[] = [];
  
  // Step 1: Process all patterns and store full occurrence information
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
    const { canonicalStars, canonicalCells } = canonicalize(initialStars, forcedEmpty);
    
    // Create occurrence record
    const occurrence: Occurrence = {
      canonical_stars: canonicalStars,
      canonical_forced_empty: canonicalCells,
      abs_stars: initialStars,
      abs_forced_empty: forcedEmpty,
      compatible_solutions: pattern.compatible_solutions,
      extra_features: {} as FeatureSet, // Will be filled below
    };
    
    // Extract features
    occurrence.extra_features = extractFeatures(occurrence, output.board_size);
    
    occurrences.push(occurrence);
  }
  
  // Step 2: Group occurrences by canonical_stars, then by canonical_forced_empty
  const starGroups = new Map<string, Map<string, Occurrence[]>>();
  
  for (const occ of occurrences) {
    const starKey = JSON.stringify(occ.canonical_stars);
    const emptiesKey = JSON.stringify(occ.canonical_forced_empty);
    
    if (!starGroups.has(starKey)) {
      starGroups.set(starKey, new Map());
    }
    
    const emptiesMap = starGroups.get(starKey)!;
    if (!emptiesMap.has(emptiesKey)) {
      emptiesMap.set(emptiesKey, []);
    }
    
    emptiesMap.get(emptiesKey)!.push(occ);
  }
  
  // Step 3: Mine constraints
  const unconstrainedRules: ConstrainedRule[] = [];
  const constrainedRules: ConstrainedRule[] = [];
  const featureNames = getFeatureNames();
  
  for (const [starKey, emptiesMap] of starGroups.entries()) {
    const canonicalStars: Point[] = JSON.parse(starKey);
    const distinctEmptiesPatterns = Array.from(emptiesMap.keys());
    
    if (distinctEmptiesPatterns.length === 1) {
      // Unconstrained: single empties pattern
      const emptiesKey = distinctEmptiesPatterns[0];
      const occs = emptiesMap.get(emptiesKey)!;
      
      if (occs.length >= minOccurrences) {
        const canonicalForcedEmpty: Point[] = JSON.parse(emptiesKey);
        unconstrainedRules.push({
          canonical_stars: canonicalStars,
          canonical_forced_empty: canonicalForcedEmpty,
          constraint_features: [],
          occurrences: occs.length,
        });
      }
    } else {
      // Constrained: multiple empties patterns - try to find separating constraints
      for (const emptiesKey of distinctEmptiesPatterns) {
        const posOccs = emptiesMap.get(emptiesKey)!;
        
        if (posOccs.length < minOccurrences) {
          continue;
        }
        
        // Collect negative examples (same star geometry, different empties)
        const negOccs: Occurrence[] = [];
        for (const [otherEmptiesKey, otherOccs] of emptiesMap.entries()) {
          if (otherEmptiesKey !== emptiesKey) {
            negOccs.push(...otherOccs);
          }
        }
        
        if (negOccs.length === 0) {
          continue;
        }
        
        // Try single-feature constraints
        const singleFeatureConstraints: string[] = [];
        for (const featureName of featureNames) {
          // Check if all positive examples have this feature true
          const allPosHaveFeature = posOccs.every(occ => getFeatureValue(occ, featureName));
          
          if (allPosHaveFeature) {
            // Check if NO negative example has this feature true (all negatives have it false)
            const noNegHasFeature = !negOccs.some(occ => getFeatureValue(occ, featureName));
            
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
                getFeatureValue(occ, f1) && getFeatureValue(occ, f2)
              );
              
              if (allPosHaveBoth) {
                // Check if no negative example has both features true
                const noNegHasBoth = !negOccs.some(occ => 
                  getFeatureValue(occ, f1) && getFeatureValue(occ, f2)
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
        
        const canonicalForcedEmpty: Point[] = JSON.parse(emptiesKey);
        
        if (bestConstraints.length > 0) {
          constrainedRules.push({
            canonical_stars: canonicalStars,
            canonical_forced_empty: canonicalForcedEmpty,
            constraint_features: bestConstraints,
            occurrences: posOccs.length,
          });
        }
        // If no constraints found, we skip this pattern (could mark as "not separable")
      }
    }
  }
  
  // Sort rules
  const sortRules = (rules: ConstrainedRule[]) => {
    rules.sort((a, b) => {
      if (b.occurrences !== a.occurrences) {
        return b.occurrences - a.occurrences;
      }
      const aKey = JSON.stringify(a.canonical_stars);
      const bKey = JSON.stringify(b.canonical_stars);
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
 * Write constrained entanglement output to JSON file
 */
export function writeConstrainedEntanglementOutput(
  output: ConstrainedEntanglementOutput,
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
 * Load output from JSON file and mine constrained entanglements
 */
export function mineFromFile(
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
  
  const constrainedEntanglements = mineConstrainedEntanglements(fullOutput, minOccurrences);
  writeConstrainedEntanglementOutput(constrainedEntanglements, outputPath);
  
  console.log(`Found ${constrainedEntanglements.unconstrained_rules.length} unconstrained rules`);
  console.log(`Found ${constrainedEntanglements.constrained_rules.length} constrained rules`);
  console.log(`Total unconstrained occurrences: ${constrainedEntanglements.unconstrained_rules.reduce((sum, r) => sum + r.occurrences, 0)}`);
  console.log(`Total constrained occurrences: ${constrainedEntanglements.constrained_rules.reduce((sum, r) => sum + r.occurrences, 0)}`);
}
