import { parentPort, workerData } from 'worker_threads';
import { PatternAnalyzer } from '../core/patternAnalyzer';
import { Grid, Cell } from '../types';

interface WorkerData {
  solutions: Grid[];
  patterns: Cell[][];
  boardSize: number;
  workerId: number;
  totalWorkers: number;
  includeInherent: boolean;
}

if (parentPort) {
  const { solutions, patterns, boardSize, workerId, totalWorkers, includeInherent } = workerData as WorkerData;

  const analyzer = new PatternAnalyzer(boardSize, solutions, includeInherent);

  // Process patterns assigned to this worker
  const results: any[] = [];
  const totalPatterns = patterns.length;
  const patternsPerWorker = Math.ceil(totalPatterns / totalWorkers);
  const startIdx = workerId * patternsPerWorker;
  const endIdx = Math.min(startIdx + patternsPerWorker, totalPatterns);

  let lastReported = 0;
  for (let i = startIdx; i < endIdx; i++) {
    const pattern = patterns[i];
    const analyzed = analyzer.analyzePattern(pattern);
    if (analyzed) {
      results.push(analyzed);
    }
    
    // Report progress periodically
    const processed = i - startIdx + 1;
    if (processed - lastReported >= 10 || i === endIdx - 1) {
      parentPort.postMessage({
        type: 'progress',
        workerId,
        processed,
        total: endIdx - startIdx,
      });
      lastReported = processed;
    }
  }

  parentPort.postMessage({
    type: 'done',
    workerId,
    results,
  });
}

