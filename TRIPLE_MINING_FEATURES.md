# ✅ **Instruction: Add the following candidate-cell feature set**

Extend the triple-entanglement miner by adding these new boolean feature flags for every triple occurrence `(starsAbs[], candidateAbs)`.

Each feature must be computed **per occurrence** and stored alongside the triple.

---

## **1. Star-alignment features**

**Purpose:** Capture whether the candidate cell aligns with or falls between stars.

Add:

```
candidate_in_same_row_as_any_star
candidate_in_same_column_as_any_star
candidate_between_stars_in_row
candidate_between_stars_in_column
```

Definitions:

* `candidate_in_same_row_as_any_star = true`
  if ∃ star `(sr, sc)` such that `candidate.row === sr`.

* `candidate_in_same_column_as_any_star = true`
  if ∃ star `(sr, sc)` such that `candidate.col === sc`.

* `candidate_between_stars_in_row = true`
  if at least two stars share the candidate’s row
  and `candidate.col` lies strictly between their min and max columns.

* `candidate_between_stars_in_column = true`
  if at least two stars share the candidate’s column
  and `candidate.row` lies strictly between their min and max rows.

---

## **2. Row/column star-requirement features**

**Purpose:** Detect line saturation effects in compatible solutions.

Add:

```
candidate_row_needs_star
candidate_column_needs_star
```

Definitions:

For the set of compatible solutions for the current pattern:

* `candidate_row_needs_star = true`
  if **every** compatible solution places **at least one** star somewhere in the candidate’s row *outside the candidate cell* AND the row is not already filled with forced stars.

* `candidate_column_needs_star = true`
  analogous for the candidate’s column.

(Exact implementation may vary; the key idea is that the row/column structurally requires a star placement.)

---

## **3. Ring index**

**Purpose:** Detect patterns dependent on distance from the board edge (e.g., Kris outer ring).

Add:

```
ring_index
candidate_in_ring_1
```

Definitions:

* `ring_index = min(r, c, N-1-r, N-1-c)`
  where `(r, c)` is the candidate coordinate.

* `candidate_in_ring_1 = (ring_index === 1)`.

You may optionally expose only `candidate_in_ring_1` as a boolean feature.

---

## **4. Corner block membership (generalized X×X blocks)**

**Purpose:** Detect patterns localized to corner regions.

Add these features, parameterized by a constant block size `K` (e.g., 3 or configurable):

```
candidate_in_top_left_KxK
candidate_in_top_right_KxK
candidate_in_bottom_left_KxK
candidate_in_bottom_right_KxK
```

Definitions (for block size `K`):

* `candidate_in_top_left_KxK = true`
  if `r < K && c < K`.

* `candidate_in_top_right_KxK = true`
  if `r < K && c >= N-K`.

* `candidate_in_bottom_left_KxK = true`
  if `r >= N-K && c < K`.

* `candidate_in_bottom_right_KxK = true`
  if `r >= N-K && c >= N-K`.

K should be easy to adjust (default = 3).

---

# ✔️ **Summary for the code bot**

Add the following candidate-cell feature flags to every triple occurrence:

1. **Star alignment**

   * `candidate_in_same_row_as_any_star`
   * `candidate_in_same_column_as_any_star`
   * `candidate_between_stars_in_row`
   * `candidate_between_stars_in_column`

2. **Row/column structural needs**

   * `candidate_row_needs_star`
   * `candidate_column_needs_star`

3. **Ring index**

   * `ring_index = min(r, c, N-1-r, N-1-c)`
   * `candidate_in_ring_1 = (ring_index === 1)`

4. **Corner K×K blocks**

   * `candidate_in_top_left_KxK`
   * `candidate_in_top_right_KxK`
   * `candidate_in_bottom_left_KxK`
   * `candidate_in_bottom_right_KxK`

These features must be included in the feature vector used when determining constrained triple entanglements.
