/** Width and height of a chunk, in blocks. */
export const CHUNK_SIZE = 16;

/** Block ids. 0 is air (empty). */
export const B = { AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, WOOD: 4, LEAVES: 5, WATER: 6 };

/** Display color of each block id (indexed by id; air is not drawn). */
export const COLORS = [null, '#5cb85c', '#8b5a2b', '#8a8a8a', '#5a3a1a', '#2e7d32', '#3a7bd5'];

/** LOD levels displayed on the right side, from least to most simplified. */
export const LOD_LEVELS = [1, 2, 3];

/** Width of the generated terrain, in chunks (centered on x = 0). */
export const WORLD_WIDTH_CHUNKS = 20;

/** Lowest chunk row (y grows downward): no chunk exists below it. */
export const BOTTOM_CHUNK_Y = 1;

/** Seed of the procedural world generation. */
export const WORLD_SEED = 1;
