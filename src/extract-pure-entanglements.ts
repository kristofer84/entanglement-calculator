import { extractFromFile } from './pureEntanglementExtractor';
import * as path from 'path';

// Parse command line arguments
function parseArgs(): { input: string; output: string; minOccurrences: number } {
  const args = process.argv.slice(2);
  const result: any = {
    input: '',
    output: '',
    minOccurrences: 2,
  };

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, value] = arg.substring(2).split('=');
      if (key === 'input' && value) {
        result.input = value;
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
  console.error('Usage: node extract-pure-entanglements.js --input=<input.json> [--output=<output.json>] [--minOccurrences=<n>]');
  process.exit(1);
}

// Default output path if not specified
const outputPath = args.output || args.input.replace(/\.json$/, '-pure-entanglements.json');

console.log('Pure Entanglement Extractor');
console.log('===========================');
console.log(`Input: ${args.input}`);
console.log(`Output: ${outputPath}`);
console.log(`Minimum occurrences: ${args.minOccurrences}`);
console.log('');

try {
  extractFromFile(args.input, outputPath, args.minOccurrences);
  console.log('');
  console.log('Extraction complete!');
} catch (error) {
  console.error('Error:', error);
  process.exit(1);
}
