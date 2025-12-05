## 1. Goal

Extend the current system so that:

* Board size `gridSize = N` (N×N) is arbitrary.
* `starsPerLine = S` stars per row and per column.
* A pattern can have `Z` initial star placements (`Z ≥ 1`, not fixed to 2).
* For any such pattern, the app can:

  * enumerate compatible solutions,
  * compute forced empty and forced star cells,
  * canonicalize the pattern under symmetries,
  * extract pure and constrained entanglement templates.

Everything that currently works for 2 stars should generalize to `Z` stars.

---

## 2. Configuration and pattern analysis

1. Generalize the test harness and batch runner so that they accept:

   ```ts
   const gridSize: number;       // N
   const starsPerLine: number;   // S
   const pattern: Cell[];        // length Z, arbitrary >= 1
   ```

2. `ConfigurationEnumerator` already takes `(gridSize, starsPerLine)`. Ensure:

   * Enumeration does not assume 2 stars per row/column anywhere in the logic.
   * It enforces exactly `starsPerLine` stars in each row and column (and region, if you have regions).

3. `PatternAnalyzer.analyzePattern(pattern: Cell[])` must:

   * Accept any `pattern.length = Z ≥ 1`.
   * Check local validity for all pairs in the pattern (no adjacency).
   * Filter solutions to those that contain all Z pattern stars.
   * Return:

     ```ts
     interface PatternAnalysisResult {
       compatible_solutions: number;
       forced_empty: Cell[];
       forced_star: Cell[];
     }
     ```

   The implementation should not special-case 2 stars; it should treat `pattern` as a set of fixed star cells.

---

## 3. Canonicalization for Z stars (pure templates)

Replace the 2-star-specific canonicalization with a generic version that works on `stars: Point[]` where `Point = [row, col]` and `stars.length = Z`.

1. Keep the same 8 D4 transforms on a point `(x, y)`:

   ```ts
   function d4Transforms([x, y]: Point): Point[] {
     return [
       [ x,  y],
       [-x,  y],
       [ x, -y],
       [-x, -y],
       [ y,  x],
       [-y,  x],
       [ y, -x],
       [-y, -x],
     ];
   }
   ```

2. Canonicalization function for stars + a set of cells (empties or stars):

   ```ts
   interface CanonicalPattern {
     canonicalStars: Point[];
     canonicalCells: Point[]; // empties, or forced stars, depending on call
     transformIndex: number;
     translation: [number, number];
   }

   function canonicalize(pointsStars: Point[], pointsCells: Point[]): CanonicalPattern {
     let bestStars: Point[] | null = null;
     let bestCells: Point[] = [];
     let bestTransformIndex = 0;
     let bestTranslation: [number, number] = [0, 0];

     for (let t = 0; t < 8; t++) {
       const tf = (p: Point): Point => d4Transforms(p)[t];

       const sT = pointsStars.map(tf);
       const cT = pointsCells.map(tf);

       const minRow = Math.min(...sT.map(p => p[0]));
       const minCol = Math.min(...sT.map(p => p[1]));

       const shift = (p: Point): Point => [p[0] - minRow, p[1] - minCol];

       const sN = sT.map(shift).sort((a,b) => a[0]-b[0] || a[1]-b[1]);
       const cN = cT.map(shift).sort((a,b) => a[0]-b[0] || a[1]-b[1]);

       if (
         !bestStars ||
         JSON.stringify(sN) < JSON.stringify(bestStars)
       ) {
         bestStars = sN;
         bestCells = cN;
         bestTransformIndex = t;
         bestTranslation = [minRow, minCol];
       }
     }

     return {
       canonicalStars: bestStars!,
       canonicalCells: bestCells,
       transformIndex: bestTransformIndex,
       translation: bestTranslation,
     };
   }
   ```

3. Use this for:

   * `(stars, forced_empty)` to get canonical empties.
   * `(stars, forced_star)` to get canonical forced stars.

4. For **pure entanglement templates** with Z stars:

   * For each analyzed pattern:

     * `stars = pattern initial_stars`,
     * `empties = forced_empty` (from analysis, may be empty),
     * optionally `forcedStars = forced_star`.

   * Compute canonical stars and empties:

     ```ts
     const { canonicalStars, canonicalCells: canonicalEmpties } =
       canonicalize(stars, empties);
     ```

   * Use `(canonicalStars, canonicalEmpties)` as the grouping key.

   * Count occurrences.

   * A pure template is any group where `occurrences > 1`.

   Output structure example:

   ```ts
   interface PureEntanglementTemplate {
     canonicalStars: Point[];
     canonicalForcedEmpty: Point[];
     occurrences: number;
   }
   ```

   This works for any `Z`, not only 2.

---

## 4. Triple-based entanglement for Z stars

To detect rules of the form “if Z initial stars are like this and a candidate cell is here, that cell is forced”, generalize the triple logic:

1. A triple is now:

   * A set of Z star points: `stars: Point[]`.
   * One candidate cell: `candidate: Point`.

2. For each pattern analysis result:

   * For each `e` in `forced_empty`:

     * Create triple `(stars, candidate = e)` with label `forced = true`.
   * Optionally, also sample triples where `candidate` is not forced and not in `pattern`:

     * For each board cell `c` not in `pattern`:

       * If in compatible solutions, `c` is sometimes star and sometimes empty, label `(stars, c)` as `forced = false`.

3. Canonicalize triples:

   * Apply the same D4 + translation transform to all Z stars and the candidate cell together.
   * After transforming and shifting so that the minimum star row/col becomes `(0,0)`:

     * Sort the Z stars.
     * Candidate becomes a single point in that coordinate frame.

   ```ts
   interface CanonicalTriple {
     canonicalStars: Point[];        // Z points
     canonicalCandidate: Point;      // one point
   }
   ```

4. Group by `(canonicalStars, canonicalCandidate)`:

   * For each group, you have many occurrences, each with:

     * absolute star positions,
     * absolute candidate position,
     * label `forced` (true or false).

---

## 5. Features and constrained entanglement for Z stars

For constrained rules you need feature predicates; they can be defined exactly as before, but must not assume `Z = 2`.

1. Define feature extraction from an occurrence:

   ```ts
   interface TripleFeatures {
     // star-based features (work for any Z)
     anyStarOnTopEdge: boolean;
     anyStarOnBottomEdge: boolean;
     anyStarOnLeftEdge: boolean;
     anyStarOnRightEdge: boolean;
     allStarsInLeftHalf: boolean;
     allStarsInRightHalf: boolean;
     // candidate-based features
     candidateOnOuterRing: boolean;   // “ring” of your choice
     candidateOnTopEdge: boolean;
     candidateOnBottomEdge: boolean;
     candidateOnLeftEdge: boolean;
     candidateOnRightEdge: boolean;
     // more as needed
   }
   ```

   These functions take:

   * `absStars: Point[]` of length Z,
   * `absCandidate: Point`,
   * `gridSize`.

2. For each canonical triple `(canonicalStars, canonicalCandidate)`:

   * Let `Pos` = all occurrences where `forced == true`.
   * Let `Neg` = all occurrences where `forced == false` (if any).

3. Mine constraints:

   * For each boolean feature `f`:

     * If all `Pos` have `f == true` and at least one `Neg` has `f == false`, `f` is a candidate constraint.
   * Optionally check conjunctions of two features to sharpen separation.

4. Output constrained entanglement rules:

   ```ts
   interface ConstrainedEntanglementRule {
     canonicalStars: Point[];
     canonicalCandidate: Point;
     constraintFeatures: string[]; // names of features
     forced: boolean;              // always true for entanglement
     positiveCount: number;        // |Pos|
     negativeCount: number;        // |Neg|
   }
   ```

5. Interpretation (works for any Z):

> For Z-star geometry `canonicalStars` and candidate cell `canonicalCandidate`:
> whenever all `constraintFeatures` hold for the absolute positions on an N×N board, the candidate is forced empty (or star, if you choose to track forced stars as well).

---

## 6. Summary sentence for your code bot

> Generalize all current 2-star logic so that patterns are `Z` initial star cells on an `N×N` board with `S` stars per row/column, use the same D4+translation canonicalization applied to an array of `Z` stars instead of two, then build pure entanglement templates by grouping on `(canonicalStars, canonicalForcedEmpty)` and build constrained entanglement rules by grouping star–candidate triples `(canonicalStars, canonicalCandidate)` with feature-based conditions that separate forced from flexible occurrences.
