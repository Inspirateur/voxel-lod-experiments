import { cornerWeight, vertexCorners, countCorners } from './metrics.js';

/**
 * @typedef {{input: Uint8Array, out: Uint8Array, saved: Uint8Array, size: number, cornerPoints: number}} Work
 * input: original cells; out: LOD cells being built; saved: scratch copy of a rectangle of `out`;
 * cornerPoints: points gained per corner removed at the LOD level
 */

/**
 * Smart sampling: like naive, fills aligned squares with a single sampled block, but only when it pays off.
 * Passes go over 2-wide squares, then 4-wide... up to 2^level-wide, each refining the previous pass' output.
 * Each non-uniform square is filled with whichever block of the input square best trades corner reduction
 * against a one-point-per-changed-cell local proxy (ties: removes the most corners), or kept as is if none does.
 * Since gains need removed corners, the output never has more corners than the input; large features
 * (rectangles longer than 2 blocks) are thus kept, while small noisy ones are sampled away.
 * The chunk-wide pass (2^level ≥ size) always fills, collapsing the chunk to its best single block.
 * @param {Uint8Array} cells row-major size² block ids (not modified)
 * @param {number} size chunk side length, a power of 2
 * @param {number} level simplification level (≥ 1)
 * @returns {Uint8Array} new cells
 */
export function smartSampling(cells, size, level) {
  const work = { input: cells, out: cells.slice(), saved: new Uint8Array(cells.length), size, cornerPoints: cornerWeight(level) };
  const max = Math.min(1 << level, size);
  for (let n = 2; n <= max; n *= 2)
    // The half-offset grid catches small features straddling the aligned grid's borders.
    for (const offset of n === size ? [0] : [0, n / 2])
      for (let y = -offset; y < size; y += n)
        for (let x = -offset; x < size; x += n)
          sampleRect(work, Math.max(x, 0), Math.max(y, 0), Math.min(x + n, size), Math.min(y + n, size), n === size);
  return work.out;
}

/** Candidate blocks of the rectangle being sampled (reused across calls to avoid allocations). @type {number[]} */
const candidates = [];

/** @param {Uint8Array} input @param {number} i @param {number} block @returns {number} local changed-cell proxy */
const samplingCost = (input, i, block) => input[i] === block ? 0 : 1;

/**
 * Fills a rectangle of `work.out` with its best-scoring block, if that improves the score or if forced.
 * @param {Work} work
 * @param {number} x0 left (inclusive)
 * @param {number} y0 top (inclusive)
 * @param {number} x1 right (exclusive)
 * @param {number} y1 bottom (exclusive)
 * @param {boolean} forced whether the rectangle must be filled even if the score decreases
 */
function sampleRect({ input, out, saved, size, cornerPoints }, x0, y0, x1, y1, forced) {
  if (!forced && isUniform(out, size, x0, y0, x1, y1)) return;

  candidates.length = 0;
  let keepCost = 0;
  for (let y = y0; y < y1; y++)
    for (let i = y * size + x0; i < y * size + x1; i++) {
      saved[i] = out[i];
      keepCost += samplingCost(input, i, out[i]);
      if (!candidates.includes(input[i])) candidates.push(input[i]);
    }
  const keepCorners = countCorners(out, size, x0, y0, x1, y1);

  let best = -1, bestGain = forced ? -Infinity : 0, bestRemoved = 0;
  for (const block of candidates) {
    let cost = 0;
    for (let y = y0; y < y1; y++)
      for (let i = y * size + x0; i < y * size + x1; i++) {
        out[i] = block;
        cost += samplingCost(input, i, block);
      }
    const removed = keepCorners - perimeterCorners(out, size, x0, y0, x1, y1);
    const gain = cornerPoints * removed - cost + keepCost;
    // Ties go to the simpler result: free simplifications add up (e.g. removing a bump, then filling the notch beside it).
    if (gain > bestGain || (gain === bestGain && removed > bestRemoved)) {
      best = block; bestGain = gain; bestRemoved = removed;
    }
  }
  for (let y = y0; y < y1; y++)
    for (let i = y * size + x0; i < y * size + x1; i++) out[i] = best < 0 ? saved[i] : best;
}

/**
 * @param {Uint8Array} cells row-major size² block ids
 * @param {number} size chunk side length
 * @param {number} x0 left (inclusive)
 * @param {number} y0 top (inclusive)
 * @param {number} x1 right (exclusive)
 * @param {number} y1 bottom (exclusive)
 * @returns {boolean} whether all cells of the rectangle hold the same block
 */
function isUniform(cells, size, x0, y0, x1, y1) {
  const first = cells[y0 * size + x0];
  for (let y = y0; y < y1; y++)
    for (let i = y * size + x0; i < y * size + x1; i++) if (cells[i] !== first) return false;
  return true;
}

/**
 * Counts the corners on the border vertices of a rectangle (all of them, once the rectangle is uniform).
 * @param {Uint8Array} cells row-major size² block ids
 * @param {number} size chunk side length
 * @param {number} x0 left vertex
 * @param {number} y0 top vertex
 * @param {number} x1 right vertex
 * @param {number} y1 bottom vertex (> y0)
 * @returns {number}
 */
function perimeterCorners(cells, size, x0, y0, x1, y1) {
  let corners = 0;
  for (let x = x0; x <= x1; x++) corners += vertexCorners(cells, size, x, y0) + vertexCorners(cells, size, x, y1);
  for (let y = y0 + 1; y < y1; y++) corners += vertexCorners(cells, size, x0, y) + vertexCorners(cells, size, x1, y);
  return corners;
}
