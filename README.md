# Entanglement Calculator

A Node.js TypeScript application that precomputes and analyzes star configurations for Star Battle-style grids to detect "entanglement" patterns.

## Installation

```bash
npm install
```

## Build

```bash
npm run build
```

## Usage

```bash
npm start -- --gridSize=10 --starsPerLine=2 --entangledStars=2 --output=./output/10x10-2star-entanglements.json
```

Or using the compiled version:

```bash
node dist/index.js --gridSize=10 --starsPerLine=2 --entangledStars=2 --output=./output/10x10-2star-entanglements.json
```

### Command Line Options

- `--gridSize <number>`: Grid size (x by x), default: 10
- `--starsPerLine <number>`: Stars per row and column, default: 2
- `--entangledStars <number>`: Initial star count (pattern size), default: 2
- `--output <path>`: Output file path, default: ./output/result.json
- `--includeInherent` or `--includeInherent=true`: Include inherently forced_empty cells in output (adjacent cells and cells on same row/column when all initial stars are on a line), default: false

## Features

- Enumerates all valid Star Battle configurations
- Generates and analyzes initial-star patterns
- Multithreaded processing using worker threads
- Progress reporting every second
- User confirmation prompt before starting computation
- Iteration count estimation

## Output

The application generates a JSON file containing:
- Board configuration parameters
- Total number of valid solutions
- Array of non-trivial patterns with:
  - Initial star positions
  - Compatible solution count
  - Cell states (forced_star, forced_empty, flexible)

