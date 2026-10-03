Experimentations on LODs applied to 2d Grids (side view, terraria style), with the intent of later applying it to a 3D voxel game.

## Design
A vanilla html/js page, served statically, with 2 sections:

Section 1 (left half): a painting section that allows the user to apply color from a small fixed palette (green, brown, etc.) to cells on an infinite 2d grid.
The grid must be made of chunks (like a voxel game has) that we can set the size of with a constant in code.
Grid lines and chunk borders are visible.
Initialize the data with a little island of "dirt" (green squares) with a "tree" on top so the user has something to work with. 

Section 2 (right half): a display of 3 LOD levels (arranged vertically) computed from the data that the user painted.
We will try out multiple algorithms for LODs, so we also need a selector to switch between various LOD algorithm and see the difference. 

## LOD reqs
A LOD function takes a chunk of blocks, a "level" (an algorithm dependant measure of how "simplified" the result should be) and outputs a new chunk of blocks (of the same size). The LOD alg can peek at neighbor chunks if necessary (some will need it)

The LOD output should be "simpler" (or equal) than the input, which we can equal to "less total corners" (which can easily be counted by looking at 3 neighbors in 4 directions). 

A naive LOD algorithm at level N selects 1 block on a window of NxN blocks and applies this block to all the window (window is not sliding).

Important: LOD algorithm need to be fast! we can't be doing expensive computations because it will not scale.

To help comparing the LOD algorithms in the UI implement:
- the naive LOD alg + one other that you choose 
- a LOD metric that evaluates how "simple" the LOD is and how "different" it is from the ground truth 
(a naive block difference doesn't work because we care way more about the visible blocks)
- display the LOD score below each LOD level.


## Code directives
- Be minimal (especially in HTML/css)
- Write docstring with typing (nullability included, if any) for every JS function
- separate topics (painting, lods, tests, metrics, etc.) in separate files
- D.R.Y
- don't write superfluous checks (if null, if < 0, etc.) unless you know they are necessary. we own the code so we can trust it.

The user runs the code with the "live server" vs code extension, no need to run it yourself.