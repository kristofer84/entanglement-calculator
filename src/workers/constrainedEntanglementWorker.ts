import { parentPort, workerData } from 'worker_threads';
import { Output, Pattern } from '../types';
import { mineConstrainedEntanglements } from '../miners/constrainedEntanglementMiner';

interface WorkerData {
  patterns: Pattern[];
  boardSize: number;
  initialStarCount: number;
  workerId: number;
  totalWorkers: number;
  minOccurrences: number;
}

if (parentPort) {
  const { patterns, boardSize, initialStarCount, workerId, totalWorkers, minOccurrences } = workerData as WorkerData;

  // Create a mock Output object for processing
  const output: Output = {
    board_size: boardSize,
    stars_per_row: 0, // Not needed for mining
    stars_per_column: 0, // Not needed for mining
    initial_star_count: initialStarCount,
    total_solutions: 0, // Not needed for mining
    patterns: patterns,
  };

  // Process patterns assigned to this worker
  const totalPatterns = patterns.length;
  const patternsPerWorker = Math.ceil(totalPatterns / totalWorkers);
  const startIdx = workerId * patternsPerWorker;
  const endIdx = Math.min(startIdx + patternsPerWorker, totalPatterns);

  const workerPatterns = patterns.slice(startIdx, endIdx);
  const workerOutput: Output = {
    ...output,
    patterns: workerPatterns,
  };

  // Mine constrained entanglements from this worker's patterns
  const result = mineConstrainedEntanglements(workerOutput, minOccurrences);

  // Report progress
  parentPort.postMessage({
    type: 'progress',
    workerId,
    processed: workerPatterns.length,
    total: workerPatterns.length,
  });

  parentPort.postMessage({
    type: 'done',
    workerId,
    result,
  });
}

