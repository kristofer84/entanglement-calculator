import * as path from 'path';
import { ConfigurationEnumerator } from '../core/enumeration';
import { PatternAnalyzer } from '../core/patternAnalyzer';
import { calculateIterations, formatNumber, promptConfirmation, writeOutput } from '../utils';
import { Output } from '../types';
import { Worker } from 'worker_threads';
import * as os from 'os';
import * as fs from 'fs';
import { extractPureEntanglements, writePureEntanglementOutput } from '../miners/pureEntanglementExtractor';
import { mineConstrainedEntanglements, writeConstrainedEntanglementOutput } from '../miners/constrainedEntanglementMiner';
import { mineTripleEntanglements, writeTripleEntanglementOutput, enumerateAllStarPairs } from '../miners/tripleEntanglementMiner';

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
  const workerPath = path.join(__dirname, '../workers/worker.js');
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
          console.log('');
          
          // Step 4: Extract pure entanglement geometries (multithreaded)
          console.log('Step 4: Extracting pure entanglement geometries (multithreaded)...');
          console.log(`Total patterns to process: ${formatNumber(output.patterns.length)}`);
          const pureMiningStartTime = Date.now();
          const pureNumWorkers = Math.min(numCpus, Math.max(1, Math.ceil(output.patterns.length / 100)));
          console.log(`Using ${pureNumWorkers} worker(s) for pure entanglement extraction`);
          const pureWorkers: Worker[] = [];
          const pureWorkerResults: any[] = [];
          const pureWorkerProgress: { [key: number]: number } = {};
          let pureCompletedWorkers = 0;
          let pureTotalProcessed = 0;
          const pureWorkerPath = path.join(__dirname, '../workers/pureEntanglementWorker.js');
          
          const pureProgressInterval = setInterval(() => {
            const elapsed = ((Date.now() - pureMiningStartTime) / 1000).toFixed(1);
            const progress = output.patterns.length > 0 
              ? ((pureTotalProcessed / output.patterns.length) * 100).toFixed(1)
              : '0.0';
            process.stdout.write(
              `\r[${elapsed}s] Pure entanglement: ${formatNumber(pureTotalProcessed)}/${formatNumber(output.patterns.length)} patterns (${progress}%)`
            );
          }, 500);
          
          for (let i = 0; i < pureNumWorkers; i++) {
            pureWorkerResults[i] = null;
            pureWorkerProgress[i] = 0;
            
            const worker = new Worker(pureWorkerPath, {
              workerData: {
                patterns: output.patterns,
                boardSize: gridSize,
                initialStarCount: entangledStars,
                workerId: i,
                totalWorkers: pureNumWorkers,
                minOccurrences: 2,
              },
            });
            
            worker.on('message', (message: any) => {
              if (message.type === 'error') {
                console.error(`Pure worker ${message.workerId} error:`, message.error);
                clearInterval(pureProgressInterval);
                process.exit(1);
              } else if (message.type === 'progress') {
                const prevProcessed = pureWorkerProgress[message.workerId] || 0;
                const newProcessed = message.processed;
                pureTotalProcessed += (newProcessed - prevProcessed);
                pureWorkerProgress[message.workerId] = newProcessed;
              } else if (message.type === 'done') {
                pureWorkerResults[message.workerId] = message.result;
                pureCompletedWorkers++;
                if (pureCompletedWorkers === pureNumWorkers) {
                  clearInterval(pureProgressInterval);
                  process.stdout.write('\r' + ' '.repeat(100) + '\r');
                  
                  // Merge results from all workers
                  const mergedTemplates = new Map<string, { canonical_stars: any[]; canonical_forced_empty: any[]; occurrences: number }>();
                  for (const result of pureWorkerResults) {
                    if (result && result.pure_entanglement_templates) {
                      for (const template of result.pure_entanglement_templates) {
                        const key = JSON.stringify(template.canonical_stars) + '|' + JSON.stringify(template.canonical_forced_empty);
                        if (mergedTemplates.has(key)) {
                          mergedTemplates.get(key)!.occurrences += template.occurrences;
                        } else {
                          mergedTemplates.set(key, { ...template });
                        }
                      }
                    }
                  }
                  
                  const pureEntanglements = {
                    board_size: gridSize,
                    initial_stars: entangledStars,
                    pure_entanglement_templates: Array.from(mergedTemplates.values()).sort((a, b) => {
                      if (b.occurrences !== a.occurrences) {
                        return b.occurrences - a.occurrences;
                      }
                      return JSON.stringify(a.canonical_stars).localeCompare(JSON.stringify(b.canonical_stars));
                    }),
                  };
                  
                  const pureOutputPath = normalizedOutputPath.endsWith('.json')
                    ? normalizedOutputPath.replace(/\.json$/, '-pure-entanglements.json')
                    : normalizedOutputPath + '-pure-entanglements.json';
                  writePureEntanglementOutput(pureEntanglements, pureOutputPath);
                  console.log(`Found ${formatNumber(pureEntanglements.pure_entanglement_templates.length)} pure entanglement templates`);
                  console.log(`Total occurrences: ${formatNumber(pureEntanglements.pure_entanglement_templates.reduce((sum, t) => sum + t.occurrences, 0))}`);
                  console.log(`Pure entanglement output written to ${pureOutputPath}`);
                  console.log('');
                  
                  // Step 5: Mine constrained entanglements (multithreaded)
                  console.log('Step 5: Mining constrained entanglements (multithreaded)...');
                  const constrainedMiningStartTime = Date.now();
                  const constrainedNumWorkers = Math.min(numCpus, Math.ceil(output.patterns.length / 100));
                  const constrainedWorkers: Worker[] = [];
                  const constrainedWorkerResults: any[] = [];
                  const constrainedWorkerProgress: { [key: number]: number } = {};
                  let constrainedCompletedWorkers = 0;
                  let constrainedTotalProcessed = 0;
                  const constrainedWorkerPath = path.join(__dirname, '../workers/constrainedEntanglementWorker.js');
                  
                  const constrainedProgressInterval = setInterval(() => {
                    const elapsed = ((Date.now() - constrainedMiningStartTime) / 1000).toFixed(1);
                    const progress = output.patterns.length > 0 
                      ? ((constrainedTotalProcessed / output.patterns.length) * 100).toFixed(1)
                      : '0.0';
                    process.stdout.write(
                      `\r[${elapsed}s] Constrained entanglement: ${formatNumber(constrainedTotalProcessed)}/${formatNumber(output.patterns.length)} patterns (${progress}%)`
                    );
                  }, 500);
                  
                  for (let i = 0; i < constrainedNumWorkers; i++) {
                    constrainedWorkerResults[i] = null;
                    constrainedWorkerProgress[i] = 0;
                    
                    const worker = new Worker(constrainedWorkerPath, {
                      workerData: {
                        patterns: output.patterns,
                        boardSize: gridSize,
                        initialStarCount: entangledStars,
                        workerId: i,
                        totalWorkers: constrainedNumWorkers,
                        minOccurrences: 2,
                      },
                    });
                    
                    worker.on('message', (message: any) => {
                      if (message.type === 'progress') {
                        const prevProcessed = constrainedWorkerProgress[message.workerId] || 0;
                        const newProcessed = message.processed;
                        constrainedTotalProcessed += (newProcessed - prevProcessed);
                        constrainedWorkerProgress[message.workerId] = newProcessed;
                      } else if (message.type === 'done') {
                        constrainedWorkerResults[message.workerId] = message.result;
                        constrainedCompletedWorkers++;
                        if (constrainedCompletedWorkers === constrainedNumWorkers) {
                          clearInterval(constrainedProgressInterval);
                          process.stdout.write('\r' + ' '.repeat(100) + '\r');
                          
                          // Merge results from all workers
                          const mergedUnconstrained = new Map<string, any>();
                          const mergedConstrained = new Map<string, any>();
                          
                          for (const result of constrainedWorkerResults) {
                            if (result) {
                              if (result.unconstrained_rules) {
                                for (const rule of result.unconstrained_rules) {
                                  const key = JSON.stringify(rule.canonical_stars) + '|' + JSON.stringify(rule.canonical_forced_empty);
                                  if (mergedUnconstrained.has(key)) {
                                    mergedUnconstrained.get(key)!.occurrences += rule.occurrences;
                                  } else {
                                    mergedUnconstrained.set(key, { ...rule });
                                  }
                                }
                              }
                              if (result.constrained_rules) {
                                for (const rule of result.constrained_rules) {
                                  const key = JSON.stringify(rule.canonical_stars) + '|' + JSON.stringify(rule.canonical_forced_empty) + '|' + JSON.stringify(rule.constraint_features);
                                  if (mergedConstrained.has(key)) {
                                    mergedConstrained.get(key)!.occurrences += rule.occurrences;
                                  } else {
                                    mergedConstrained.set(key, { ...rule });
                                  }
                                }
                              }
                            }
                          }
                          
                          const constrainedEntanglements = {
                            board_size: gridSize,
                            initial_stars: entangledStars,
                            unconstrained_rules: Array.from(mergedUnconstrained.values()).sort((a, b) => {
                              if (b.occurrences !== a.occurrences) {
                                return b.occurrences - a.occurrences;
                              }
                              return JSON.stringify(a.canonical_stars).localeCompare(JSON.stringify(b.canonical_stars));
                            }),
                            constrained_rules: Array.from(mergedConstrained.values()).sort((a, b) => {
                              if (b.occurrences !== a.occurrences) {
                                return b.occurrences - a.occurrences;
                              }
                              return JSON.stringify(a.canonical_stars).localeCompare(JSON.stringify(b.canonical_stars));
                            }),
                          };
                          
                          const constrainedOutputPath = normalizedOutputPath.endsWith('.json')
                            ? normalizedOutputPath.replace(/\.json$/, '-constrained-entanglements.json')
                            : normalizedOutputPath + '-constrained-entanglements.json';
                          writeConstrainedEntanglementOutput(constrainedEntanglements, constrainedOutputPath);
                          console.log(`Found ${formatNumber(constrainedEntanglements.unconstrained_rules.length)} unconstrained rules`);
                          console.log(`Found ${formatNumber(constrainedEntanglements.constrained_rules.length)} constrained rules`);
                          console.log(`Total unconstrained occurrences: ${formatNumber(constrainedEntanglements.unconstrained_rules.reduce((sum, r) => sum + r.occurrences, 0))}`);
                          console.log(`Total constrained occurrences: ${formatNumber(constrainedEntanglements.constrained_rules.reduce((sum, r) => sum + r.occurrences, 0))}`);
                          console.log(`Constrained entanglement output written to ${constrainedOutputPath}`);
                          console.log('');
                          
                          // Step 6: Mine triple entanglements (multithreaded)
                          console.log('Step 6: Mining triple entanglements (multithreaded)...');
                          const allStarPairs = enumerateAllStarPairs(gridSize);
                          console.log(`Enumerated ${formatNumber(allStarPairs.length)} locally valid star pairs`);
                          
                          const tripleMiningStartTime = Date.now();
                          const tripleNumWorkers = Math.min(numCpus, allStarPairs.length);
                          const tripleWorkers: Worker[] = [];
                          const tripleWorkerResults: any[] = [];
                          const tripleWorkerProgress: { [key: number]: number } = {};
                          let tripleCompletedWorkers = 0;
                          let tripleTotalProcessed = 0;
                          const tripleWorkerPath = path.join(__dirname, '../workers/tripleEntanglementWorker.js');
                          
                          const tripleProgressInterval = setInterval(() => {
                            const elapsed = ((Date.now() - tripleMiningStartTime) / 1000).toFixed(1);
                            const progress = allStarPairs.length > 0 
                              ? ((tripleTotalProcessed / allStarPairs.length) * 100).toFixed(1)
                              : '0.0';
                            process.stdout.write(
                              `\r[${elapsed}s] Triple entanglement: ${formatNumber(tripleTotalProcessed)}/${formatNumber(allStarPairs.length)} star pairs (${progress}%)`
                            );
                          }, 500);
                          
                          const triplePairsPerWorker = Math.ceil(allStarPairs.length / tripleNumWorkers);
                          for (let i = 0; i < tripleNumWorkers; i++) {
                            tripleWorkerResults[i] = null;
                            tripleWorkerProgress[i] = 0;
                            const startIdx = i * triplePairsPerWorker;
                            const endIdx = Math.min(startIdx + triplePairsPerWorker, allStarPairs.length);
                            const workerPairs = allStarPairs.slice(startIdx, endIdx);
                            
                            const worker = new Worker(tripleWorkerPath, {
                              workerData: {
                                starPairs: workerPairs,
                                solutions: solutions,
                                boardSize: gridSize,
                                workerId: i,
                                totalWorkers: tripleNumWorkers,
                                minOccurrences: 2,
                              },
                            });
                            
                            worker.on('message', (message: any) => {
                              if (message.type === 'progress') {
                                const prevProcessed = tripleWorkerProgress[message.workerId] || 0;
                                const newProcessed = message.processed;
                                tripleTotalProcessed += (newProcessed - prevProcessed);
                                tripleWorkerProgress[message.workerId] = newProcessed;
                              } else if (message.type === 'done') {
                                tripleWorkerResults[message.workerId] = message.buckets;
                                tripleCompletedWorkers++;
                                if (tripleCompletedWorkers === tripleNumWorkers) {
                                  clearInterval(tripleProgressInterval);
                                  process.stdout.write('\r' + ' '.repeat(100) + '\r');
                                  
                                  // Merge buckets from all workers
                                  const mergedBuckets = new Map<string, any>();
                                  for (const buckets of tripleWorkerResults) {
                                    if (buckets) {
                                      for (const [key, bucket] of buckets) {
                                        if (mergedBuckets.has(key)) {
                                          mergedBuckets.get(key)!.occurrences.push(...bucket.occurrences);
                                        } else {
                                          mergedBuckets.set(key, {
                                            canonicalStars: bucket.canonicalStars,
                                            canonicalCandidate: bucket.canonicalCandidate,
                                            occurrences: [...bucket.occurrences],
                                          });
                                        }
                                      }
                                    }
                                  }
                                  
                                  // Build rules from merged buckets
                                  const unconstrained_rules: any[] = [];
                                  const constrained_rules: any[] = [];
                                  
                                  for (const bucket of mergedBuckets.values()) {
                                    const pos = bucket.occurrences.filter((o: any) => o.forced);
                                    const neg = bucket.occurrences.filter((o: any) => !o.forced);
                                    const positiveCount = pos.length;
                                    const negativeCount = neg.length;
                                    
                                    if (positiveCount < 2) continue;
                                    
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
                                    
                                    if (pos.length === 0) continue;
                                    
                                    const allFeatureKeys = Object.keys(pos[0].features);
                                    const booleanFeatureKeys = allFeatureKeys.filter(
                                      (name) => typeof pos[0].features[name] === 'boolean'
                                    );
                                    const numericFeatureKeys = allFeatureKeys.filter(
                                      (name) => typeof pos[0].features[name] === 'number'
                                    );
                                    
                                    const chosen: string[] = [];
                                    
                                    for (const fname of booleanFeatureKeys) {
                                      const allPosTrue = pos.every((o: any) => o.features[fname] === true);
                                      const someNegNotTrue = neg.some((o: any) => o.features[fname] !== true);
                                      if (allPosTrue && someNegNotTrue) {
                                        chosen.push(fname);
                                      }
                                    }
                                    
                                    for (const fname of numericFeatureKeys) {
                                      const posValues = pos.map((o: any) => o.features[fname] as number);
                                      const negValues = neg.map((o: any) => o.features[fname] as number);
                                      const value = posValues[0];
                                      const allPosSame = posValues.every((v: number) => v === value);
                                      const someNegDifferent = negValues.some((v: number) => v !== value);
                                      if (allPosSame && someNegDifferent) {
                                        chosen.push(`${fname}=${value}`);
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
                                    }
                                  }
                                  
                                  const sortRule = (a: any, b: any) =>
                                    JSON.stringify(a.canonical_stars).localeCompare(JSON.stringify(b.canonical_stars)) ||
                                    JSON.stringify(a.canonical_candidate).localeCompare(JSON.stringify(b.canonical_candidate));
                                  
                                  unconstrained_rules.sort(sortRule);
                                  constrained_rules.sort(sortRule);
                                  
                                  const tripleEntanglementsFinal = {
                                    board_size: gridSize,
                                    initial_stars: entangledStars,
                                    unconstrained_rules,
                                    constrained_rules,
                                  };
                                  
                                  const tripleOutputPath = normalizedOutputPath.endsWith('.json')
                                    ? normalizedOutputPath.replace(/\.json$/, '-triple-entanglements.json')
                                    : normalizedOutputPath + '-triple-entanglements.json';
                                  writeTripleEntanglementOutput(tripleEntanglementsFinal, tripleOutputPath);
                                  console.log(`Found ${formatNumber(tripleEntanglementsFinal.unconstrained_rules.length)} unconstrained triple rules`);
                                  console.log(`Found ${formatNumber(tripleEntanglementsFinal.constrained_rules.length)} constrained triple rules`);
                                  console.log(`Total unconstrained occurrences: ${formatNumber(tripleEntanglementsFinal.unconstrained_rules.reduce((sum: number, r) => sum + r.occurrences, 0))}`);
                                  console.log(`Total constrained occurrences: ${formatNumber(tripleEntanglementsFinal.constrained_rules.reduce((sum: number, r) => sum + r.occurrences, 0))}`);
                                  console.log(`Triple entanglement output written to ${tripleOutputPath}`);
                                  console.log('');
                                  
                                  // Cleanup all workers
                                  pureWorkers.forEach(w => w.terminate());
                                  constrainedWorkers.forEach(w => w.terminate());
                                  tripleWorkers.forEach(w => w.terminate());
                                  
                                  // Save solutions to file
                                  const solutionsPath = normalizedOutputPath.endsWith('.json')
                                    ? normalizedOutputPath.replace(/\.json$/, '-solutions.json')
                                    : normalizedOutputPath + '-solutions.json';
                                  console.log(`Saving solutions to ${solutionsPath}...`);
                                  fs.writeFileSync(solutionsPath, JSON.stringify(solutions), 'utf-8');
                                  console.log('Done!');
                                  console.log('');
                                  
                                  // Cleanup
                                  clearInterval(progressInterval);
                                  workers.forEach(w => w.terminate());
                                  process.exit(0);
                                }
                              }
                            });
                            
                            worker.on('error', (error) => {
                              console.error(`Triple worker ${i} error:`, error);
                            });
                            
                            tripleWorkers.push(worker);
                          }
                        }
                      }
                    });
                    
                    worker.on('error', (error) => {
                      console.error(`Constrained worker ${i} error:`, error);
                    });
                    
                    constrainedWorkers.push(worker);
                  }
                }
              }
            });
            
            worker.on('error', (error) => {
              console.error(`Pure worker ${i} error:`, error);
              clearInterval(pureProgressInterval);
            });
            
            worker.on('exit', (code) => {
              if (code !== 0) {
                console.error(`Pure worker ${i} exited with code ${code}`);
                clearInterval(pureProgressInterval);
              }
            });
            
            pureWorkers.push(worker);
          }
          
          // Check if we have any workers
          if (pureNumWorkers === 0 || output.patterns.length === 0) {
            clearInterval(pureProgressInterval);
            console.log('No workers created for pure entanglement extraction (no patterns to process)');
            // Continue to next step even if no patterns
            console.log('');
            // Step 5 would go here, but we'll skip for now if no patterns
            process.exit(0);
          }
          
          console.log(`Starting ${pureNumWorkers} worker(s)...`);
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