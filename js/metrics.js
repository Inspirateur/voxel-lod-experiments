import { B } from './config.js';

/** Metric weights and maximum Manhattan search distance, in blocks. */
export const WEIGHTS = { corner: 0.25, distance: 1, material: 8, searchRadius: 8 };

/** @typedef {{cornersIn: number, cornersOut: number, surfaceError: number}} LodStats */

/**
 * Corners one color contributes to a grid vertex, indexed by the 4-bit mask of which surrounding cells
 * (bit 0: top-left, 1: top-right, 2: bottom-left, 3: bottom-right) hold it: 1 if odd, 2 if diagonal pair.
 */
const VERTEX_CORNERS = [0, 1, 1, 0, 1, 0, 2, 1, 1, 2, 0, 1, 0, 1, 1, 0];

/**
 * Counts the region corners lying on grid vertex (x, y), i.e. the top-left corner of cell (x, y).
 * Out-of-chunk cells count as air.
 * @param {Uint8Array} cells row-major size² block ids
 * @param {number} size chunk side length
 * @param {number} x vertex x, in [0, size]
 * @param {number} y vertex y, in [0, size]
 * @returns {number}
 */
export function vertexCorners(cells, size, x, y) {
  const i = y * size + x, top = y > 0, bottom = y < size, left = x > 0, right = x < size;
  const a = top && left ? cells[i - size - 1] : B.AIR, b = top && right ? cells[i - size] : B.AIR;
  const c = bottom && left ? cells[i - 1] : B.AIR, d = bottom && right ? cells[i] : B.AIR;
  if (a === b && b === c && c === d) return 0;
  // Each distinct solid color is counted once, at its first occurrence among a, b, c, d.
  return (a ? VERTEX_CORNERS[1 | ((b === a) << 1) | ((c === a) << 2) | ((d === a) << 3)] : 0)
    + (b && b !== a ? VERTEX_CORNERS[2 | ((c === b) << 2) | ((d === b) << 3)] : 0)
    + (c && c !== a && c !== b ? VERTEX_CORNERS[4 | ((d === c) << 3)] : 0)
    + (d && d !== a && d !== b && d !== c ? 1 : 0);
}

/**
 * Counts the outline corners of the solid same-color regions within a rectangle of vertices.
 * @param {Uint8Array} cells row-major size² block ids
 * @param {number} size chunk side length
 * @param {number} [x0] first vertex x
 * @param {number} [y0] first vertex y
 * @param {number} [x1] last vertex x (inclusive)
 * @param {number} [y1] last vertex y (inclusive)
 * @returns {number}
 */
export function countCorners(cells, size, x0 = 0, y0 = 0, x1 = size, y1 = size) {
  let corners = 0;
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) corners += vertexCorners(cells, size, x, y);
  return corners;
}

/** @param {Map<string, import('./world.js').Chunk>} world @param {number} size @param {number} x @param {number} y @returns {number} */
function worldBlock(world, size, x, y) {
  const cx = Math.floor(x / size), cy = Math.floor(y / size);
  const chunk = world.get(`${cx},${cy}`);
  return chunk?.cells[(y - cy * size) * size + x - cx * size] ?? B.AIR;
}

/**
 * Collects solid blocks that touch air in the complete sparse world.
 * @param {Map<string, import('./world.js').Chunk>} world
 * @param {number} size chunk side length
 * @returns {Map<string, {x: number, y: number, block: number}>} visible blocks keyed by world position
 */
function visibleBlocks(world, size) {
  const visible = new Map();
  for (const { cx, cy, cells } of world.values())
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const block = cells[y * size + x];
        const worldX = cx * size + x, worldY = cy * size + y;
        if (block && (worldBlock(world, size, worldX - 1, worldY) === B.AIR
          || worldBlock(world, size, worldX + 1, worldY) === B.AIR
          || worldBlock(world, size, worldX, worldY - 1) === B.AIR
          || worldBlock(world, size, worldX, worldY + 1) === B.AIR))
          visible.set(`${worldX},${worldY}`, { x: worldX, y: worldY, block });
      }
  return visible;
}

/**
 * Sums nearest-visible-block costs in one direction; blocks may be reused as matches.
 * @param {Map<string, {x: number, y: number, block: number}>} source
 * @param {Map<string, {x: number, y: number, block: number}>} target
 * @returns {number}
 */
function directedSurfaceError(source, target) {
  let error = 0;
  for (const { x, y, block } of source.values()) {
    let best = Infinity;
    for (let distance = 0; distance <= WEIGHTS.searchRadius; distance++) {
      for (let dx = -distance; dx <= distance; dx++) {
        const dy = distance - Math.abs(dx);
        const candidates = dy ? [y - dy, y + dy] : [y];
        for (const candidateY of candidates) {
          const other = target.get(`${x + dx},${candidateY}`)?.block;
          if (other !== undefined) best = Math.min(best, distance * WEIGHTS.distance + (other === block ? 0 : WEIGHTS.material));
        }
      }
      if (best <= (distance + 1) * WEIGHTS.distance) break;
    }
    error += Number.isFinite(best) ? best : WEIGHTS.searchRadius;
  }
  return error;
}

/**
 * Compares visible surfaces and corner counts for two complete sparse worlds.
 * @param {Map<string, import('./world.js').Chunk>} input original world
 * @param {Map<string, import('./world.js').Chunk>} output LOD world
 * @param {number} size chunk side length
 * @returns {LodStats}
 */
export function lodStats(input, output, size) {
  let cornersIn = 0, cornersOut = 0;
  for (const chunk of input.values()) cornersIn += countCorners(chunk.cells, size);
  for (const chunk of output.values()) cornersOut += countCorners(chunk.cells, size);
  const inputSurface = visibleBlocks(input, size), outputSurface = visibleBlocks(output, size);
  return {
    cornersIn,
    cornersOut,
    surfaceError: directedSurfaceError(inputSurface, outputSurface) + directedSurfaceError(outputSurface, inputSurface)
  };
}

/**
 * @param {number} level LOD level - the higher it is, the more important it is to reduce corners
 * @returns {number} points lost per output corner
 */
export const cornerWeight = (level) => WEIGHTS.corner * level * level;

/**
 * @param {LodStats} s
 * @param {number} level LOD level
 * @returns {number} corner reduction points minus symmetric visible-surface error (higher is better)
 */
export function score(s, level) {
  return WEIGHTS.corner * s.cornersIn - cornerWeight(level) * s.cornersOut - s.surfaceError;
}
