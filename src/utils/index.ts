import * as fs from 'fs';
import * as path from 'path';
import { Output } from '../types';

/**
 * Calculate the number of iterations required
 */
export function calculateIterations(
  boardSize: number,
  patternSize: number
): { patterns: number; solutions: number } {
  // Estimate number of patterns: C(n^2, patternSize) where n = boardSize
  // This is an upper bound - actual will be less due to filtering
  const totalCells = boardSize * boardSize;
  
  // Calculate combinations: C(totalCells, patternSize)
  let patterns = 1;
  for (let i = 0; i < patternSize; i++) {
    patterns *= (totalCells - i) / (i + 1);
  }

  // Solutions count is unknown until enumeration, but we can estimate
  // This is a rough estimate - actual count depends on constraints
  const solutions = Math.pow(boardSize, boardSize); // Very rough upper bound

  return {
    patterns: Math.floor(patterns),
    solutions: solutions,
  };
}

/**
 * Format large numbers with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

/**
 * Prompt user for confirmation
 */
export function promptConfirmation(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    readline.question(message, (answer: string) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

/**
 * Ensure output directory exists
 */
export function ensureOutputDir(outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write output to JSON file
 */
export function writeOutput(output: Output, outputPath: string, includeCompatibleSolutions: boolean = false): void {
  ensureOutputDir(outputPath);
  
  // Transform cell objects to compressed [row, col] arrays and omit empty arrays
  const compressedOutput = {
    ...output,
    patterns: output.patterns.map(pattern => {
      const compressedPattern: any = {
        initial_stars: pattern.initial_stars.map(cell => [cell.row, cell.col]),
      };
      
      // Only include compatible_solutions if requested
      if (includeCompatibleSolutions) {
        compressedPattern.compatible_solutions = pattern.compatible_solutions;
      }
      
      // Only include forced_empty if it's not empty
      if (pattern.forced_empty.length > 0) {
        compressedPattern.forced_empty = pattern.forced_empty.map(cell => [cell.row, cell.col]);
      }
      
      // Only include forced_star if it's not empty
      if (pattern.forced_star.length > 0) {
        compressedPattern.forced_star = pattern.forced_star.map(cell => [cell.row, cell.col]);
      }
      
      return compressedPattern;
    }),
  };
  const jsonString = JSON.stringify(compressedOutput)
  // const minifiedJsonString = jsonString.replace(/\[(?:[^\[\]]|\[(?:[^\[\]]|\[[^\[\]]*\])*\])*\]/g, m =>
  //   m.replace(/\s+/g, '').replace(/,\]/g, ']')
  // );
  
  fs.writeFileSync(outputPath, jsonString, 'utf-8');
}

