import * as path from 'path';
import { ConfigurationEnumerator } from './enumeration';
import { PatternAnalyzer } from './patternAnalyzer';
import { calculateIterations, formatNumber, promptConfirmation, writeOutput } from './utils';
import { Output } from './types';
import { Worker } from 'worker_threads';
import * as os from 'os';

// Parse command line arguments manually to handle --key=value format
function parseArgs(): { gridSize: number; starsPerLine: number; entangledStars: number; output: string; includeInherent: boolean; includeCompatibleSolutions: boolean } {
  const args = process.argv.slice(2);
  const result: any = {
    gridSize: 10,
    starsPerLine: 2,
    entangledStars: 2,
    output: './output/result.json',
    includeInherent: false,
    includeCompatibleSolutions: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      if (key === 'gridSize' && value) {
        result.gridSize = parseInt(value, 10);
      } else if (key === 'starsPerLine' && value) {
        result.starsPerLine = parseInt(value, 10);
      } else if (key === 'entangledStars' && value) {
        result.entangledStars = parseInt(value, 10);
      } else if (key === 'output' && value) {
        result.output = value;
      } else if (key === 'includeInherent') {
        // Accept --includeInherent or --includeInherent=true
        // If no value or value is 'true', set to true; otherwise false
        result.includeInherent = value === undefined || value === '' || value === 'true';
      } else if (key === 'includeCompatibleSolutions') {
        // Accept --includeCompatibleSolutions or --includeCompatibleSolutions=true
        // If no value or value is 'true', set to true; otherwise false
        result.includeCompatibleSolutions = value === undefined || value === '' || value === 'true';
      }
    }
  }

  return result;
}

const args = parseArgs();
const gridSize = args.gridSize;
const starsPerLine = args.starsPerLine;
const entangledStars = args.entangledStars;
const outputPath = args.output;
const includeInherent = args.includeInherent;
const includeCompatibleSolutions = args.includeCompatibleSolutions;

// Normalize output path (remove leading ./ if present)
const normalizedOutputPath = outputPath.startsWith('./') 
  ? outputPath.substring(2) 
  : outputPath;

async function main() {
  console.log('Entanglement Calculator');
  console.log('======================');
  console.log(`Grid Size: ${gridSize}x${gridSize}`);
  console.log(`Stars per Row/Column: ${starsPerLine}`);
  console.log(`Initial Star Count: ${entangledStars}`);
  console.log(`Output: ${normalizedOutputPath}`);
  console.log(`Include Inherent Forced Empty: ${includeInherent}`);
  console.log(`Include Compatible Solutions: ${includeCompatibleSolutions}`);
  console.log('');

  // Calculate iterations
  console.log('Calculating estimated iterations...');
  const iterations = calculateIterations(gridSize, entangledStars);
  console.log(`Estimated patterns to test: ${formatNumber(iterations.patterns)} (upper bound)`);
  console.log(`Estimated solutions (upper bound): ${formatNumber(iterations.solutions)}`);
  console.log('');

  // Ask for confirmation
  const proceed = await promptConfirmation(
    'This may take a long time. Proceed? (y/n): '
  );

  if (!proceed) {
    console.log('Aborted by user.');
    process.exit(0);
  }

  console.log('');
  console.log('Starting computation...');
  console.log('');

  const startTime = Date.now();
  let lastReportTime = startTime;
  const numCpus = os.cpus().length;

  // Step 1: Enumerate all valid configurations
  console.log('Step 1: Enumerating valid configurations...');
  console.log(`Available CPU cores: ${numCpus}`);
  const enumStartTime = Date.now();
  let lastSolutionCount = 0;
  const enumerator = new ConfigurationEnumerator(
    gridSize, 
    starsPerLine,
    (count) => {
      const elapsed = ((Date.now() - enumStartTime) / 1000).toFixed(1);
      if (count > lastSolutionCount) {
        process.stdout.write(`\r[${elapsed}s] Found ${formatNumber(count)} solutions...`);
        lastSolutionCount = count;
      } else {
        process.stdout.write(`\r[${elapsed}s] Exploring... (${formatNumber(count)} solutions found so far)`);
      }
    }
  );
  const solutions = enumerator.enumerate();
  const totalSolutions = solutions.length;
  process.stdout.write('\r' + ' '.repeat(100) + '\r'); // Clear line
  console.log(`Found ${formatNumber(totalSolutions)} valid configurations.`);
  console.log('');

  if (totalSolutions === 0) {
    console.log('No valid configurations found. Exiting.');
    process.exit(1);
  }

  // Step 2: Generate all valid patterns
  console.log('Step 2: Generating initial-star patterns...');
  const patternStartTime = Date.now();
  const analyzer = new PatternAnalyzer(
    gridSize, 
    solutions,
    includeInherent,
    (count) => {
      const elapsed = ((Date.now() - patternStartTime) / 1000).toFixed(1);
      process.stdout.write(`\r[${elapsed}s] Generated ${formatNumber(count)} patterns...`);
    }
  );
  const patterns = analyzer.generatePatterns(entangledStars);
  const totalPatterns = patterns.length;
  process.stdout.write('\r' + ' '.repeat(80) + '\r'); // Clear line
  console.log(`Generated ${formatNumber(totalPatterns)} valid patterns.`);
  console.log('');

  // Step 3: Analyze patterns using worker threads
  console.log('Step 3: Testing patterns for entanglement (multithreaded)...');
  console.log(`Total patterns to test: ${formatNumber(totalPatterns)}`);
  const numWorkers = Math.min(numCpus, totalPatterns);
  console.log(`Using ${numWorkers} worker thread${numWorkers !== 1 ? 's' : ''} (out of ${numCpus} available CPU cores).`);
  console.log('');

  const patternsPerWorker = Math.ceil(totalPatterns / numWorkers);
  const workers: Worker[] = [];
  const workerResults: any[][] = [];
  const workerProgress: { [key: number]: number } = {};
  let completedWorkers = 0;
  let totalProcessed = 0;

  // Progress reporting function
  const reportProgress = () => {
    const now = Date.now();
    if (now - lastReportTime >= 1000) {
      const elapsed = ((now - startTime) / 1000).toFixed(1);
      const progress = totalPatterns > 0 
        ? ((totalProcessed / totalPatterns) * 100).toFixed(1)
        : '0.0';
      const activeWorkers = workers.filter(w => w.threadId !== undefined).length;
      process.stdout.write(
        `\r[${elapsed}s] Patterns tested: ${formatNumber(totalProcessed)}/${formatNumber(totalPatterns)} (${progress}%) | Active threads: ${activeWorkers}/${numWorkers}`
      );
      lastReportTime = now;
    }
  };

  // Start progress reporting interval
  const progressInterval = setInterval(() => {
    reportProgress();
    if (completedWorkers === numWorkers) {
      clearInterval(progressInterval);
    }
  }, 1000);

  // Create workers
  const workerPath = path.join(__dirname, 'worker.js');
  for (let i = 0; i < numWorkers; i++) {
    workerResults[i] = [];
    workerProgress[i] = 0;
    
    const worker = new Worker(workerPath, {
      workerData: {
        solutions,
        patterns,
        boardSize: gridSize,
        workerId: i,
        totalWorkers: numWorkers,
        includeInherent: includeInherent,
      },
    });
    
    worker.on('message', (message: any) => {
      if (message.type === 'progress') {
        const prevProcessed = workerProgress[message.workerId] || 0;
        const newProcessed = message.processed;
        totalProcessed += (newProcessed - prevProcessed);
        workerProgress[message.workerId] = newProcessed;
        reportProgress();
      } else if (message.type === 'done') {
        workerResults[message.workerId] = message.results;
        completedWorkers++;
        if (completedWorkers === numWorkers) {
          // All workers done
          process.stdout.write('\r' + ' '.repeat(100) + '\r'); // Clear progress line
          const allResults = workerResults.flat();
          const finalTime = ((Date.now() - startTime) / 1000).toFixed(1);
          
          console.log(`All ${formatNumber(totalPatterns)} patterns tested.`);
          console.log(`Completed in ${finalTime} seconds.`);
          console.log(`Found ${formatNumber(allResults.length)} non-trivial patterns.`);
          console.log('');

          // Create output
          const output: Output = {
            board_size: gridSize,
            stars_per_row: starsPerLine,
            stars_per_column: starsPerLine,
            initial_star_count: entangledStars,
            total_solutions: totalSolutions,
            patterns: allResults,
          };

          // Write output
          console.log(`Writing results to ${normalizedOutputPath}...`);
          writeOutput(output, normalizedOutputPath, includeCompatibleSolutions);
          console.log('Done!');
          
          // Cleanup
          clearInterval(progressInterval);
          workers.forEach(w => w.terminate());
          process.exit(0);
        }
      }
    });

    worker.on('error', (error) => {
      console.error(`Worker ${i} error:`, error);
    });

    workers.push(worker);
  }

}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

