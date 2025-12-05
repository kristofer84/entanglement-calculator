import { mineTripleFromFile } from '../miners/tripleEntanglementMiner';
import * as path from 'path';

// Parse command line arguments
function parseArgs(): { input: string; solutions: string; output: string; minOccurrences: number } {
  const args = process.argv.slice(2);
  const result: any = {
    input: '',
    solutions: '',
    output: '',
    minOccurrences: 2,
  };

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      if (key === 'input' && value) {
        result.input = value;
      } else if (key === 'solutions' && value) {
        result.solutions = value;
      } else if (key === 'output' && value) {
        result.output = value;
      } else if (key === 'minOccurrences' && value) {
        result.minOccurrences = parseInt(value, 10);
      }
    }
  }

  return result;
}

const args = parseArgs();

if (!args.input) {
  console.error('Error: --input parameter is required');
  console.error('Usage: node mine-triple-entanglements.js --input=<input.json> --solutions=<solutions.json> [--output=<output.json>] [--minOccurrences=<n>]');
  process.exit(1);
}

if (!args.solutions) {
  console.error('Error: --solutions parameter is required');
  console.error('Usage: node mine-triple-entanglements.js --input=<input.json> --solutions=<solutions.json> [--output=<output.json>] [--minOccurrences=<n>]');
  process.exit(1);
}

// Default output path if not specified
const outputPath = args.output || args.input.replace(/\.json$/, '-triple-entanglements.json');

console.log('Triple Entanglement Miner');
console.log('==========================');
console.log(`Input: ${args.input}`);
console.log(`Solutions: ${args.solutions}`);
console.log(`Output: ${outputPath}`);
console.log(`Minimum occurrences: ${args.minOccurrences}`);
console.log('');

try {
  mineTripleFromFile(args.input, args.solutions, outputPath, args.minOccurrences);
  console.log('');
  console.log('Mining complete!');
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
