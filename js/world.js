import { CHUNK_SIZE, BOTTOM_CHUNK_Y, B } from './config.js';

/** @typedef {{cx: number, cy: number, cells: Uint8Array}} Chunk  row-major CHUNK_SIZE² block ids */

/** All chunks of the world, keyed by "cx,cy". @type {Map<string, Chunk>} */
export const chunks = new Map();

/**
 * @param {number} cx chunk x
 * @param {number} cy chunk y
 * @returns {string} key of the chunk in a chunk map
 */
export const chunkKey = (cx, cy) => `${cx},${cy}`;

/**
 * @param {number} x world block x
 * @param {number} y world block y
 * @returns {{key: string, cx: number, cy: number, i: number}} chunk key/coords and cell index of the block
 */
function locate(x, y) {
  const cx = Math.floor(x / CHUNK_SIZE), cy = Math.floor(y / CHUNK_SIZE);
  return { key: chunkKey(cx, cy), cx, cy, i: (y - cy * CHUNK_SIZE) * CHUNK_SIZE + x - cx * CHUNK_SIZE };
}

/**
 * @param {number} x world block x
 * @param {number} y world block y
 * @returns {number} block id (air if the chunk does not exist)
 */
export function getBlock(x, y) {
  const { key, i } = locate(x, y);
  return chunks.get(key)?.cells[i] ?? B.AIR;
}

/**
 * Sets a block, creating its chunk if needed. Blocks below the bottom chunk row are ignored.
 * @param {number} x world block x
 * @param {number} y world block y
 * @param {number} block block id
 * @returns {string | null} key of the modified chunk, null if below the bottom
 */
export function setBlock(x, y, block) {
  const { key, cx, cy, i } = locate(x, y);
  if (cy > BOTTOM_CHUNK_Y) return null;
  let chunk = chunks.get(key);
  if (!chunk) chunks.set(key, chunk = { cx, cy, cells: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE) });
  chunk.cells[i] = block;
  return key;
}
