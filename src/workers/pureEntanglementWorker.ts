import { parentPort, workerData } from 'worker_threads';
import { Output, Pattern } from '../types';
import { extractPureEntanglements } from '../miners/pureEntanglementExtractor';

interface WorkerData {
  patterns: Pattern[];
  boardSize: number;
  initialStarCount: number;
  workerId: number;
  totalWorkers: number;
  minOccurrences: number;
}

if (parentPort) {
  try {
    const { patterns, boardSize, initialStarCount, workerId, totalWorkers, minOccurrences } = workerData as WorkerData;

    // Create a mock Output object for processing
    const output: Output = {
      board_size: boardSize,
      stars_per_row: 0, // Not needed for extraction
      stars_per_column: 0, // Not needed for extraction
      initial_star_count: initialStarCount,
      total_solutions: 0, // Not needed for extraction
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

    // Extract pure entanglements from this worker's patterns
    const result = extractPureEntanglements(workerOutput, minOccurrences);

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
  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      workerId: (workerData as any)?.workerId || -1,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

