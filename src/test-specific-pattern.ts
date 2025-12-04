import { ConfigurationEnumerator } from './enumeration';
import { PatternAnalyzer } from './patternAnalyzer';
import { Cell } from './types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Test a specific pattern: initial stars at (0,1) and (4,5)
 */
async function testSpecificPattern() {
  const gridSize = 10;
  const starsPerLine = 2;
  const patternSize = 2;
  const includeInherent = false;

  console.log('Test: Specific Pattern Analysis');
  console.log('================================');
  console.log(`Grid Size: ${gridSize}x${gridSize}`);
  console.log(`Stars per Row/Column: ${starsPerLine}`);
  console.log(`Initial Stars: [{row: 0, col: 1}, {row: 4, col: 5}]`);
  console.log('');

  // Step 1: Enumerate all valid configurations
  console.log('Step 1: Enumerating valid configurations...');
  const enumerator = new ConfigurationEnumerator(gridSize, starsPerLine);
  const solutions = enumerator.enumerate();
  const totalSolutions = solutions.length;
  console.log(`Found ${totalSolutions.toLocaleString()} valid configurations.`);
  console.log('');

  if (totalSolutions === 0) {
    console.log('No valid configurations found. Cannot test pattern.');
    return;
  }

  // Step 2: Create the specific pattern
  const pattern: Cell[] = [
    { row: 0, col: 1 },
    { row: 4, col: 5 }
  ];

  console.log('Step 2: Analyzing specific pattern...');
  console.log(`Pattern: [${pattern.map(c => `{${c.row},${c.col}}`).join(', ')}]`);
  console.log('');

  // Check if pattern is locally valid
  const isLocallyValid = ConfigurationEnumerator.isLocallyValid(pattern, gridSize);
  console.log(`Pattern is locally valid: ${isLocallyValid}`);
  
  if (!isLocallyValid) {
    console.log('Pattern is not locally valid (stars are adjacent).');
    return;
  }

  // Step 3: Check if pattern is realizable
  const isRealizable = solutions.some(solution => {
    return ConfigurationEnumerator.isPatternCompatible(pattern, solution);
  });
  console.log(`Pattern is realizable: ${isRealizable}`);
  
  if (!isRealizable) {
    console.log('Pattern is not realizable (no compatible solutions found).');
    return;
  }

  // Step 4: Analyze the pattern
  console.log('Step 3: Analyzing pattern...');
  
  // First, let's manually check what compatible solutions look like
  const compatibleSolutions = solutions.filter(solution => {
    return ConfigurationEnumerator.isPatternCompatible(pattern, solution);
  });
  console.log(`Found ${compatibleSolutions.length.toLocaleString()} compatible solutions.`);
  
  // Check specific cells that should be forced stars
  const testCells = [{row: 0, col: 5}, {row: 5, col: 0}];
  console.log('');
  console.log('Checking expected forced stars:');
  for (const testCell of testCells) {
    const starCount = compatibleSolutions.filter(sol => sol[testCell.row][testCell.col] === 1).length;
    const emptyCount = compatibleSolutions.filter(sol => sol[testCell.row][testCell.col] === 0).length;
    console.log(`  Cell {${testCell.row},${testCell.col}}: Stars=${starCount}, Empty=${emptyCount}, Total=${compatibleSolutions.length}`);
    if (starCount === compatibleSolutions.length) {
      console.log(`    -> Should be FORCED STAR`);
    } else if (emptyCount === compatibleSolutions.length) {
      console.log(`    -> Should be FORCED EMPTY`);
    } else {
      console.log(`    -> Should be FLEXIBLE`);
    }
  }
  console.log('');
  
  // Manually analyze to see all cell states
  console.log('Manually checking all cell states...');
  const allForcedEmpty: Cell[] = [];
  const allForcedStar: Cell[] = [];
  const patternSet = new Set(pattern.map(c => `${c.row},${c.col}`));
  
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const key = `${row},${col}`;
      if (!patternSet.has(key)) {
        const starCount = compatibleSolutions.filter(sol => sol[row][col] === 1).length;
        if (starCount === 0) {
          allForcedEmpty.push({ row, col });
        } else if (starCount === compatibleSolutions.length) {
          allForcedStar.push({ row, col });
        }
      }
    }
  }
  
  console.log(`Found ${allForcedEmpty.length} forced_empty cells and ${allForcedStar.length} forced_star cells`);
  if (allForcedStar.length > 0) {
    console.log('');
    console.log('All Forced Star Cells:');
    allForcedStar.forEach(cell => {
      console.log(`  {row: ${cell.row}, col: ${cell.col}}`);
    });
  }
  console.log('');
  
  const analyzer = new PatternAnalyzer(gridSize, solutions, includeInherent);
  const result = analyzer.analyzePattern(pattern);

  if (!result) {
    console.log('Pattern analysis returned null.');
    console.log('Possible reasons:');
    console.log('  1. Pattern is not non-trivial (no forced cells outside pattern)');
    console.log('  2. Pattern was filtered out by skip rules');
    console.log('');
    console.log('Trying with includeInherent=true to see all forced cells...');
    
    const analyzerWithInherent = new PatternAnalyzer(gridSize, solutions, true);
    const resultWithInherent = analyzerWithInherent.analyzePattern(pattern);
    
    if (resultWithInherent) {
      console.log(`With includeInherent=true:`);
      console.log(`  Compatible Solutions: ${resultWithInherent.compatible_solutions.toLocaleString()}`);
      console.log(`  Forced Empty Cells: ${resultWithInherent.forced_empty.length}`);
      console.log(`  Forced Star Cells: ${resultWithInherent.forced_star.length}`);
      
      if (resultWithInherent.forced_star.length > 0) {
        console.log('');
        console.log('Forced Star Cells:');
        resultWithInherent.forced_star.forEach(cell => {
          console.log(`  {row: ${cell.row}, col: ${cell.col}}`);
        });
      }
      
      if (resultWithInherent.forced_empty.length > 0) {
        console.log('');
        console.log('Forced Empty Cells (first 20):');
        resultWithInherent.forced_empty.slice(0, 20).forEach(cell => {
          console.log(`  {row: ${cell.row}, col: ${cell.col}}`);
        });
        if (resultWithInherent.forced_empty.length > 20) {
          console.log(`  ... and ${resultWithInherent.forced_empty.length - 20} more`);
        }
      }
    } else {
      console.log('Still null even with includeInherent=true - pattern was filtered out.');
    }
    return;
  }

  // Step 5: Display results
  console.log('Step 4: Pattern Analysis Results');
  console.log('==================================');
  console.log(`Compatible Solutions: ${result.compatible_solutions.toLocaleString()}`);
  console.log(`Forced Empty Cells: ${result.forced_empty.length}`);
  console.log(`Forced Star Cells: ${result.forced_star.length}`);
  console.log('');

  if (result.forced_empty.length > 0) {
    console.log('Forced Empty Cells:');
    result.forced_empty.forEach(cell => {
      console.log(`  {row: ${cell.row}, col: ${cell.col}}`);
    });
    console.log('');
  }

  if (result.forced_star.length > 0) {
    console.log('Forced Star Cells:');
    result.forced_star.forEach(cell => {
      console.log(`  {row: ${cell.row}, col: ${cell.col}}`);
    });
    console.log('');
  }

  // Step 6: Create a visual representation
  console.log('Visual Representation:');
  console.log('(S = initial star, E = forced_empty, * = forced_star, . = flexible/empty)');
  console.log('');
  
  const patternSetForVisual = new Set(pattern.map(c => `${c.row},${c.col}`));
  const forcedEmptySet = new Set(result.forced_empty.map(c => `${c.row},${c.col}`));
  const forcedStarSet = new Set(result.forced_star.map(c => `${c.row},${c.col}`));

  console.log('  0 1 2 3 4 5 6 7 8 9');
  for (let row = 0; row < gridSize; row++) {
    let line = `${row} `;
    for (let col = 0; col < gridSize; col++) {
      const key = `${row},${col}`;
      if (patternSetForVisual.has(key)) {
        line += 'S ';
      } else if (forcedStarSet.has(key)) {
        line += '* ';
      } else if (forcedEmptySet.has(key)) {
        line += 'E ';
      } else {
        line += '. ';
      }
    }
    console.log(line);
  }
  console.log('');

  // Step 7: Save results to JSON
  const includeCompatibleSolutions = false; // Set to true to include compatible_solutions in test output
  const testPattern: any = {
    initial_stars: pattern.map(cell => [cell.row, cell.col]),
  };
  
  // Only include compatible_solutions if requested
  if (includeCompatibleSolutions) {
    testPattern.compatible_solutions = result.compatible_solutions;
  }
  
  // Only include forced_empty if it's not empty
  if (result.forced_empty.length > 0) {
    testPattern.forced_empty = result.forced_empty.map(cell => [cell.row, cell.col]);
  }
  
  // Only include forced_star if it's not empty
  if (result.forced_star.length > 0) {
    testPattern.forced_star = result.forced_star.map(cell => [cell.row, cell.col]);
  }
  
  const output = {
    board_size: gridSize,
    stars_per_row: starsPerLine,
    stars_per_column: starsPerLine,
    initial_star_count: patternSize,
    total_solutions: totalSolutions,
    test_pattern: testPattern,
  };

  const outputPath = './output/test-pattern-3-3-7-7.json';
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  console.log(`Results saved to ${outputPath}`);
}

// Run the test
testSpecificPattern().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

