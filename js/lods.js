import { B, BOTTOM_CHUNK_Y } from './config.js';
import { smartSampling } from './smartSampling.js';
import { chunkKey } from './world.js';

/** @typedef {import('./world.js').Chunk} Chunk */

/**
 * A LOD function: simplifies a square chunk of a world into a new chunk of the same size.
 * @callback LodFn
 * @param {Map<string, Chunk>} chunks world chunks keyed by chunkKey (not modified; missing chunks are air, solid below the bottom row)
 * @param {number} cx x of the chunk to simplify (must exist)
 * @param {number} cy y of the chunk to simplify
 * @param {number} size chunk side length
 * @param {number} level simplification level (≥ 1); the algorithms below work on 2^level wide squares
 * @returns {Uint8Array} new cells
 */

/**
 * A LOD function that only looks at its own chunk.
 * @callback ChunkLodFn
 * @param {Uint8Array} cells row-major size² block ids (not modified)
 * @param {number} size chunk side length
 * @param {number} level simplification level (≥ 1)
 * @returns {Uint8Array} new cells
 */

/**
 * Adapts a LOD that only looks at its own chunk to the world LOD signature.
 * @param {ChunkLodFn} lod
 * @returns {LodFn}
 */
const chunkLocal = (lod) => (chunks, cx, cy, size, level) => lod(chunks.get(chunkKey(cx, cy)).cells, size, level);

/**
 * Naive: keeps the top-left block of every 2^level square and copies it over the square.
 * @type {ChunkLodFn}
 */
function naive(cells, size, level) {
  const n = 1 << level, out = new Uint8Array(cells.length);
  for (let y = 0; y < size; y++) {
    const row = (y - y % n) * size;
    for (let x = 0; x < size; x++) out[y * size + x] = cells[row + x - x % n];
  }
  return out;
}

/** Per-block-id counters reused by the vote-based LODs (block ids are bytes). */
const counts = new Uint16Array(256);

/**
 * Picks the block filling the square [x0, x1) × [y0, y1), or null to fall back to the previous level on it.
 * @callback PickFn
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {number} n square width before clipping, a power of 2
 * @returns {number | null}
 */

/**
 * Fills every 2^level square of a chunk with a single block.
 * A square whose pick is null falls back to the previous level, i.e. is split into its 4 quarters (1-wide squares keep their block).
 * @param {Uint8Array} cells row-major size² block ids (not modified)
 * @param {number} size chunk side length
 * @param {number} level simplification level (≥ 1)
 * @param {PickFn} pick
 * @returns {Uint8Array} new cells
 */
function fillSquares(cells, size, level, pick) {
  const n = 1 << level, out = cells.slice();
  for (let y = 0; y < size; y += n)
    for (let x = 0; x < size; x += n) fillSquare(out, size, pick, x, y, n);
  return out;
}

/**
 * Fills the n-wide square at (x0, y0), clipped to the chunk (see fillSquares).
 * @param {Uint8Array} out cells being built, holding the input cells where not filled yet
 * @param {number} size chunk side length
 * @param {PickFn} pick
 * @param {number} x0
 * @param {number} y0
 * @param {number} n square width, a power of 2
 * @returns {void}
 */
function fillSquare(out, size, pick, x0, y0, n) {
  if (n === 1) return;
  const x1 = Math.min(x0 + n, size), y1 = Math.min(y0 + n, size), b = pick(x0, y0, x1, y1, n), h = n / 2;
  if (b === null)
    for (let y = y0; y < y1; y += h)
      for (let x = x0; x < x1; x += h) fillSquare(out, size, pick, x, y, h);
  else for (let y = y0; y < y1; y++) out.fill(b, y * size + x0, y * size + x1);
}

/**
 * Clears `counts` for the blocks of the square [x0, x1) × [y0, y1).
 * @param {Uint8Array} cells
 * @param {number} size
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @returns {void}
 */
function resetCounts(cells, size, x0, y0, x1, y1) {
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) counts[cells[y * size + x]] = 0;
}

/**
 * Majority: fills every 2^level square with its most frequent block.
 * Ties favour solid blocks over air, so thin features (e.g. a trunk) survive level 1.
 * @type {ChunkLodFn}
 */
function majority(cells, size, level) {
  return fillSquares(cells, size, level, (x0, y0, x1, y1) => {
    let best = B.AIR, bestCount = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const b = cells[y * size + x], c = ++counts[b];
        if (c > bestCount || (c === bestCount && best === B.AIR)) { best = b; bestCount = c; }
      }
    resetCounts(cells, size, x0, y0, x1, y1);
    return best;
  });
}

/**
 * Cells of a chunk and of its 4 neighbours (y grows downward).
 * @typedef {{cells: Uint8Array, left: Uint8Array, right: Uint8Array, up: Uint8Array, down: Uint8Array}} Neighbourhood
 */

/**
 * @param {Map<string, Chunk>} chunks
 * @param {number} cx
 * @param {number} cy
 * @param {number} size
 * @returns {Neighbourhood} missing neighbours are all air, or all stone below the bottom chunk row
 */
function neighbourhood(chunks, cx, cy, size) {
  const get = (x, y) => chunks.get(chunkKey(x, y))?.cells ?? new Uint8Array(size * size).fill(y > BOTTOM_CHUNK_Y ? B.STONE : B.AIR);
  return { cells: get(cx, cy), left: get(cx - 1, cy), right: get(cx + 1, cy), up: get(cx, cy - 1), down: get(cx, cy + 1) };
}

/**
 * Whether a block touches air on one of its 4 sides, peeking into neighbour chunks on the chunk's border.
 * @param {Neighbourhood} nb
 * @param {number} size
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
function isExposed({ cells, left, right, up, down }, size, x, y) {
  const i = y * size + x;
  return (x > 0 ? cells[i - 1] : left[i + size - 1]) === B.AIR
    || (x < size - 1 ? cells[i + 1] : right[i - size + 1]) === B.AIR
    || (y > 0 ? cells[i - size] : up[i + size * (size - 1)]) === B.AIR
    || (y < size - 1 ? cells[i + size] : down[x]) === B.AIR;
}

/**
 * Exposed majority: fills every 2^level square with the most frequent of its blocks exposed to air
 * (ties: first to reach the top count). Hidden blocks don't vote since the player can't see them.
 * A square holding more than 3/4 air becomes air. One holding strictly more air than blocks falls back to the
 * previous level instead, which keeps thin surfaces (except at level 1, where the square becomes air).
 * @type {LodFn}
 */
function exposedMajority(chunks, cx, cy, size, level) {
  const nb = neighbourhood(chunks, cx, cy, size), cells = nb.cells;
  return fillSquares(cells, size, level, (x0, y0, x1, y1, n) => {
    // TODO: pick something smarter than stone for fully hidden squares (replacing hidden blocks costs 0 for now).
    let air = 0, best = B.STONE, bestCount = 0;
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) {
        const b = cells[y * size + x];
        if (b === B.AIR) air++;
        else if (isExposed(nb, size, x, y)) {
          const c = ++counts[b];
          if (c > bestCount) { best = b; bestCount = c; }
        }
      }
    resetCounts(cells, size, x0, y0, x1, y1);
    const area = (x1 - x0) * (y1 - y0);
    if (4 * air > 3 * area) return B.AIR;
    // Level 1 squares don't fall back to the input: that would keep every lone block.
    return 2 * air > area ? (n === 2 ? B.AIR : null) : best;
  });
}

/** Available LOD algorithms by display name. @type {Record<string, LodFn>} */
export const LODS = {
  naive: chunkLocal(naive),
  majority: chunkLocal(majority),
  'exposed majority': exposedMajority,
  'smart sampling': chunkLocal(smartSampling),
};
