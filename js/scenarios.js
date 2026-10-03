import { B } from './config.js';

/**
 * Seeded pseudo-random generator (mulberry32), so scenarios are reproducible.
 * @param {number} seed
 * @returns {() => number} returns floats in [0, 1)
 */
export function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {number} size chunk side length
 * @param {(x: number, y: number) => number} blockAt block id of each cell
 * @returns {Uint8Array} row-major chunk cells
 */
const make = (size, blockAt) => Uint8Array.from({ length: size * size }, (_, i) => blockAt(i % size, Math.floor(i / size)));

/**
 * @param {number} y
 * @param {number} surface y of the grass layer
 * @returns {number} ground block at depth y (air above the surface)
 */
const ground = (y, surface) => (y < surface ? B.AIR : y === surface ? B.GRASS : y < surface + 3 ? B.DIRT : B.STONE);

/**
 * Hand-crafted chunks covering typical terrain as well as adversarial patterns.
 * @param {number} size chunk side length (≥ 16)
 * @returns {Record<string, Uint8Array>}
 */
export function scenarios(size) {
  const r = rng(42), h = size / 2;
  const noise = (density, colors) => make(size, () => (r() < density ? 1 + Math.floor(r() * colors) : B.AIR));
  return {
    'empty': make(size, () => B.AIR),
    'full': make(size, () => B.STONE),
    'flat terrain': make(size, (x, y) => ground(y, h)),
    'hills': make(size, (x, y) => ground(y, h + Math.round(3 * Math.sin(x / 2)))),
    'steps': make(size, (x, y) => ground(y, h - (x >> 2))),
    'tree': make(size, (x, y) => ((x - 7) ** 2 + (y - 4) ** 2 <= 9 ? B.LEAVES : x === 7 && y > 4 ? B.WOOD : B.AIR)),
    'water pool': make(size, (x, y) => (y >= h && Math.abs(x - h) < 4 && y < h + 3 ? B.WATER : ground(y, h))),
    'block at origin': make(size, (x, y) => (x + y === 0 ? B.STONE : B.AIR)),
    'block off-grid': make(size, (x, y) => (x === 5 && y === 5 ? B.STONE : B.AIR)),
    'hole in solid': make(size, (x, y) => (x === 5 && y === 6 ? B.AIR : B.STONE)),
    'horizontal line': make(size, (x, y) => (y === 5 ? B.STONE : B.AIR)),
    'vertical line': make(size, (x) => (x === 4 ? B.WOOD : B.AIR)),
    'diagonal line': make(size, (x, y) => (x === y ? B.STONE : B.AIR)),
    'staircase': make(size, (x, y) => (x + y >= size ? B.STONE : B.AIR)),
    'checkerboard': make(size, (x, y) => ((x + y) % 2 ? B.AIR : B.STONE)),
    '2x2 checkerboard': make(size, (x, y) => (((x >> 1) + (y >> 1)) % 2 ? B.AIR : B.STONE)),
    'two-color checkerboard': make(size, (x, y) => ((x + y) % 2 ? B.DIRT : B.STONE)),
    'row stripes': make(size, (x, y) => (y % 2 ? B.AIR : B.DIRT)),
    '2-wide column stripes': make(size, (x) => ((x >> 1) % 2 ? B.AIR : B.DIRT)),
    'frame': make(size, (x, y) => (x % (size - 1) && y % (size - 1) ? B.AIR : B.STONE)),
    'misaligned 3x3 blocks': make(size, (x, y) => ((x + 1) % 5 < 3 && (y + 2) % 5 < 3 ? B.DIRT : B.AIR)),
    'cave': make(size, (x, y) => ((x - h) ** 2 + (y - h) ** 2 < 16 ? B.AIR : B.STONE)),
    'ores': make(size, () => (r() < 0.15 ? B.DIRT : B.STONE)),
    'porous stone': make(size, () => (r() < 0.1 ? B.AIR : B.STONE)),
    'sparse noise': noise(0.1, 1),
    'half noise': noise(0.5, 1),
    'dense noise': noise(0.9, 1),
    'multi-color noise': noise(0.6, 5),
  };
}

/**
 * Random chunks made of overlapping rectangles and sprinkled noise, of varying density and color count.
 * @param {number} size chunk side length
 * @param {number} count number of chunks
 * @returns {Uint8Array[]}
 */
export function randomChunks(size, count) {
  const r = rng(7), int = (n) => Math.floor(r() * n);
  return Array.from({ length: count }, () => {
    const cells = new Uint8Array(size * size), colors = 1 + int(4), noise = r() * 0.3;
    for (let k = int(8); k > 0; k--) {
      const x0 = int(size), y0 = int(size), w = 1 + int(size / 2), hh = 1 + int(size / 2), b = int(colors + 1);
      for (let y = y0; y < Math.min(size, y0 + hh); y++)
        for (let x = x0; x < Math.min(size, x0 + w); x++) cells[y * size + x] = b;
    }
    for (let i = 0; i < cells.length; i++) if (r() < noise) cells[i] = int(colors + 1);
    return cells;
  });
}
