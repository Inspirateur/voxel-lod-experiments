import { CHUNK_SIZE, LOD_LEVELS } from './config.js';
import { LODS } from './lods.js';
import { lodStats, score } from './metrics.js';
import { chunks, chunkKey } from './world.js';
import { drawWorld } from './render.js';

/** @typedef {import('./world.js').Chunk} Chunk */
/** @typedef {import('./metrics.js').LodStats} LodStats */

/** LOD results of each chunk, one entry per LOD level. @type {Map<string, Chunk[]>} */
const cache = new Map();
let algo = Object.keys(LODS)[0];

/**
 * Switches the LOD algorithm.
 * @param {string} name key of LODS
 */
export function setAlgo(name) {
  algo = name;
  cache.clear();
}

/**
 * Drops the cached LODs of a chunk after it changed, and of its 4 neighbours since LODs may peek into them.
 * @param {string} key chunk key (the chunk must exist)
 */
export function invalidate(key) {
  const { cx, cy } = chunks.get(key);
  for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) cache.delete(chunkKey(cx + dx, cy + dy));
}

/**
 * @param {string} key chunk key
 * @param {Chunk} chunk
 * @returns {Chunk[]} LOD chunk for each level (cached)
 */
function lodsOf(key, chunk) {
  let lods = cache.get(key);
  if (!lods) cache.set(key, lods = LOD_LEVELS.map((level) => {
    const cells = LODS[algo](chunks, chunk.cx, chunk.cy, CHUNK_SIZE, level);
    return { ...chunk, cells };
  }));
  return lods;
}

/**
 * Draws every LOD level of the world in its canvas, with the level's total score in its label.
 * @param {{ctx: CanvasRenderingContext2D, label: HTMLElement}[]} views one per LOD level
 * @param {import('./render.js').Camera} cam
 */
export function drawLods(views, cam) {
  views.forEach(({ ctx, label }, i) => {
    const lodChunks = [];
    const lodWorld = new Map();
    let totalChunk = 0;
    for (const [key, chunk] of chunks) {
      const lod = lodsOf(key, chunk)[i];
      lodChunks.push(lod);
      lodWorld.set(key, lod);
      totalChunk += 1;
    }
    drawWorld(ctx, cam, lodChunks);
    const stats = lodStats(chunks, lodWorld, CHUNK_SIZE);
    if (totalChunk === 0) totalChunk = 1;
    const averageScore = score(stats, LOD_LEVELS[i]) / totalChunk;
    const cornerRatio = stats.cornersOut / Math.max(1, stats.cornersIn);
    const averageSurfaceError = stats.surfaceError / totalChunk;
    label.textContent = `Level ${LOD_LEVELS[i]} — score ${averageScore.toFixed(0)}`
      + ` | corners ratio ${cornerRatio.toFixed(2)}`
      + ` | surface error ${averageSurfaceError.toFixed(0)}`;
  });
}
