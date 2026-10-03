import { CHUNK_SIZE, B, WORLD_WIDTH_CHUNKS, BOTTOM_CHUNK_Y, WORLD_SEED } from './config.js';
import { getBlock, setBlock } from './world.js';

/** Heightmap noise octaves: lattice spacing and amplitude, in blocks. */
const OCTAVES = [[48, 10], [16, 4], [6, 1.5]];
/** Probability of trying to grow a tree on a column, and minimum distance between trunks. */
const TREE_CHANCE = 0.15, TREE_SPACING = 6;

/**
 * Seeded PRNG (mulberry32).
 * @param {number} seed
 * @returns {() => number} generator of floats in [0, 1)
 */
function prng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 1D value noise summed over OCTAVES.
 * @param {number} width number of columns
 * @param {() => number} rand
 * @returns {number[]} surface y of each column (y grows downward, centered on 0)
 */
function heightmap(width, rand) {
  const heights = new Array(width).fill(0);
  for (const [spacing, amplitude] of OCTAVES) {
    const knots = Array.from({ length: Math.ceil(width / spacing) + 1 }, () => rand() * 2 - 1);
    for (let x = 0; x < width; x++) {
      const t = x / spacing, i = Math.floor(t), f = t - i, s = f * f * (3 - 2 * f);
      heights[x] += amplitude * (knots[i] + (knots[i + 1] - knots[i]) * s);
    }
  }
  return heights.map(Math.round);
}

/**
 * Fills a column: 1 grass, 2 dirt, then stone down to the bottom of the world.
 * @param {number} x world block x
 * @param {number} surface y of the grass block
 */
function fillColumn(x, surface) {
  const bottom = (BOTTOM_CHUNK_Y + 1) * CHUNK_SIZE;
  for (let y = surface; y < bottom; y++) setBlock(x, y, y === surface ? B.GRASS : y <= surface + 2 ? B.DIRT : B.STONE);
}

/**
 * Grows a tree whose trunk starts right above the ground; leaves only replace air.
 * @param {number} x trunk x
 * @param {number} ground y of the block the tree stands on
 * @param {() => number} rand
 */
function growTree(x, ground, rand) {
  const top = ground - 4 - Math.floor(rand() * 4);
  for (let y = ground - 1; y >= top; y--) setBlock(x, y, B.WOOD);
  for (let dy = -2; dy <= 2; dy++)
    for (let dx = -3; dx <= 3; dx++)
      if (dx * dx + 2 * dy * dy <= 10 && getBlock(x + dx, top - 1 + dy) === B.AIR) setBlock(x + dx, top - 1 + dy, B.LEAVES);
}

/** Generates WORLD_WIDTH_CHUNKS chunks of terrain, centered on x = 0, with trees on top. */
export function generateWorld() {
  const rand = prng(WORLD_SEED), width = WORLD_WIDTH_CHUNKS * CHUNK_SIZE;
  const x0 = -Math.floor(WORLD_WIDTH_CHUNKS / 2) * CHUNK_SIZE;
  const heights = heightmap(width, rand);
  heights.forEach((surface, i) => fillColumn(x0 + i, surface));
  let lastTree = -Infinity;
  heights.forEach((surface, i) => {
    // Keep leaves (3 blocks wide on each side) inside the world.
    if (i < 3 || i >= width - 3 || i - lastTree < TREE_SPACING || rand() >= TREE_CHANCE) return;
    growTree(x0 + i, surface, rand);
    lastTree = i;
  });
}
