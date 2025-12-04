import * as fs from 'fs';
import * as path from 'path';
import { Output } from './types';

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
export function writeOutput(output: Output, outputPath: string): void {
  ensureOutputDir(outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
}

