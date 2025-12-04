Begin spec:

The program precomputes and analyzes star configurations for Star Battle–style grids, to detect “entanglement” patterns. It works on an x by x grid (square only), with y stars in every row and every column, and no shapes. All patterns are derived from the complete set of valid full configurations.

Grid, notation, and constraints

The grid is x by x. Rows and columns are indexed from 0 to x-1.

A cell is addressed as an object { "row": r, "col": c } with 0 <= r, c < x.

A configuration is an x by x matrix of 0/1 values, where 1 means a star and 0 means empty.

Valid configuration rules:

Each row contains exactly y stars.

Each column contains exactly y stars.

No two stars are adjacent horizontally, vertically, or diagonally. Formally, if cell (r,c) has a star, then every cell (r',c') with |r'-r| <= 1 and |c'-c| <= 1, other than (r,c) itself, must be empty.

Global enumeration

Input parameters for enumeration: x (board_size), y (stars_per_row_and_column).

The program must enumerate every distinct valid full configuration that satisfies the rules above.

Let the resulting set of full configurations be denoted as Solutions. Each element of Solutions is an x by x 0/1 matrix.

Initial-star patterns

We define an “initial-star pattern” as a set of exactly z distinct cells where stars are assumed to be present.

Input parameter for pattern analysis: z (initial_star_count).

For pattern generation, the program must consider all subsets S of size z of the x*x cells such that:

S is itself locally valid (no pair of cells in S violates the adjacency rule).

There exists at least one full configuration in Solutions that has stars in all cells of S. (If no such configuration exists, the pattern is discarded.)

Compatibility for a given pattern

For a given initial-star pattern S (a list of cells), define its compatible solution set:

Compatible(S) = { C in Solutions | every cell in S is a star in C }.

If Compatible(S) is empty, the pattern is discarded (it cannot occur in a valid full configuration).

Otherwise, we say S is “realizable” and we analyze its implications on each cell of the board.

Cell states relative to a pattern

For each realizable pattern S and each cell c in the grid, the program computes a state describing how c behaves across Compatible(S):

If c has a star in every configuration in Compatible(S), then state(c) = "forced_star".

If c has no star in any configuration in Compatible(S), then state(c) = "forced_empty".

Otherwise (c is a star in some but not all configurations in Compatible(S)), state(c) = "flexible".

A pattern S is “non-trivial” if there exists at least one cell c that is either "forced_star" or "forced_empty" and is not in S itself. (This corresponds to an entanglement-type deduction: given those initial stars, some other cell is logically forced.)

JSON input and output

Program-level input (parameters) should be accepted as JSON, for example:
{
"board_size": 10,
"stars_per_row": 2,
"stars_per_column": 2,
"initial_star_count": 2
}

The main output is a JSON object with:

"board_size": x

"stars_per_row": y

"stars_per_column": y

"initial_star_count": z

"total_solutions": N (size of Solutions)

"patterns": an array of pattern objects, one per realizable pattern S that is non-trivial

Each pattern object has:

"initial_stars": an array of cell objects, e.g.
"initial_stars": [
{ "row": 2, "col": 4 },
{ "row": 5, "col": 7 }
]

"compatible_solutions": integer count = |Compatible(S)|

"cell_states": an x by x matrix (array of arrays) of strings, where each entry is one of:

"forced_star"

"forced_empty"

"flexible"

Example pattern object for a 4x4 grid (schematic only):
{
"initial_stars": [
{ "row": 0, "col": 1 },
{ "row": 3, "col": 2 }
],
"compatible_solutions": 12,
"cell_states": [
["flexible", "forced_star", "forced_empty", "flexible"],
["forced_empty","flexible", "flexible", "forced_empty"],
["flexible", "flexible", "flexible", "flexible"],
["forced_empty","flexible", "forced_star", "forced_empty"]
]
}

Filtering and symmetry (optional but recommended)

To reduce output size, the implementation may:

Only include patterns that are non-trivial.

Optionally factor out symmetries (rotations/reflections) so that equivalent patterns under board symmetry are only stored once, with a representative pattern and a description of the symmetry used.

Any symmetry reduction, if used, must be reflected in additional JSON fields such as "representative_of" or "symmetry_class_id", but must not change the required fields above.

End spec.