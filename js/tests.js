import { LODS } from './lods.js';
import { countCorners, lodStats, score } from './metrics.js';
import { scenarios, randomChunks } from './scenarios.js';
import { chunkKey } from './world.js';
import { B } from './config.js';

const out = document.getElementById('out');
let failures = 0;

/**
 * Records a test result.
 * @param {string} name
 * @param {*} actual
 * @param {*} expected compared by JSON value
 */
function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  out.textContent += `${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ` — got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`}\n`;
}

/**
 * Builds a square chunk from rows of characters ('.' is air, digits are block ids).
 * @param {...string} rows
 * @returns {Uint8Array}
 */
const grid = (...rows) => Uint8Array.from(rows.join('').replaceAll('.', '0'), Number);

eq('corners: empty', countCorners(grid('..', '..'), 2), 0);
eq('corners: 1 block', countCorners(grid('1.', '..'), 2), 4);
eq('corners: 2 adjacent same', countCorners(grid('11', '..'), 2), 4);
eq('corners: 2 adjacent different', countCorners(grid('12', '..'), 2), 8);
eq('corners: diagonal same', countCorners(grid('1.', '.1'), 2), 8);
eq('corners: L shape', countCorners(grid('1.', '11'), 2), 6);
eq('corners: full', countCorners(grid('11', '11'), 2), 4);

/**
 * Builds a world holding a chunk at (0, 0), surrounded by 4 chunks filled with a single block.
 * @param {Uint8Array} cells
 * @param {number} size chunk side length
 * @param {number} border block id of the surrounding chunks
 * @returns {Map<string, import('./world.js').Chunk>}
 */
const worldOf = (cells, size, border) => new Map([[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]].map(([cx, cy], i) =>
  [chunkKey(cx, cy), { cx, cy, cells: i ? new Uint8Array(size * size).fill(border) : cells }]));

/**
 * Runs a LOD on a chunk surrounded by chunks filled with a single block.
 * @param {import('./lods.js').LodFn} lod
 * @param {Uint8Array} cells
 * @param {number} size chunk side length
 * @param {number} level
 * @param {number} [border] block id of the surrounding chunks (air by default)
 * @returns {Uint8Array} LOD cells
 */
const lodOf = (lod, cells, size, level, border = B.AIR) => lod(worldOf(cells, size, border), 0, 0, size, level);

const src = grid('1234', '5612', '1111', '...1');
eq('naive level 1', lodOf(LODS.naive, src, 4, 1), grid('1133', '1133', '1111', '1111'));
eq('naive level 2', lodOf(LODS.naive, src, 4, 2), grid('1111', '1111', '1111', '1111'));
eq('majority: most frequent wins', lodOf(LODS.majority, grid('11', '1.'), 2, 1), grid('11', '11'));
eq('majority: solid wins ties with air', lodOf(LODS.majority, grid('4.', '4.'), 2, 1), grid('44', '44'));
eq('majority: partial squares', lodOf(LODS.majority, grid('1.2', '..2', '333'), 3, 1), grid('..2', '..2', '333'));
const exposed = LODS['exposed majority'];
eq('exposed majority: more air gives air at level 1', lodOf(exposed, grid('1.', '..'), 2, 1), grid('..', '..'));
eq('exposed majority: more air falls back to the previous level per square', lodOf(exposed, grid('....', '....', '..12', '.111'), 4, 2), grid('....', '....', '..11', '..11'));
eq('exposed majority: more than 3/4 air gives air', lodOf(exposed, grid('....', '....', '....', '.111'), 4, 2), grid('....', '....', '....', '....'));
eq('exposed majority: solid wins ties with air', lodOf(exposed, grid('4.', '4.'), 2, 1), grid('44', '44'));
eq('exposed majority: hidden blocks don\'t vote', lodOf(exposed, grid('....', '1111', '2222', '2222'), 4, 2, B.STONE), grid('1111', '1111', '1111', '1111'));
eq('exposed majority: peeks around, hidden squares are stone', lodOf(exposed, grid('1111', '11.1', '1123', '1133'), 4, 1, B.STONE), grid('1111', '1111', '3322', '3322'));
eq('exposed majority: peeks into air neighbour chunks', lodOf(exposed, grid('11', '12'), 2, 1), grid('11', '11'));
eq('exposed majority: peeks into solid neighbour chunks', lodOf(exposed, grid('11', '12'), 2, 1, B.STONE), grid('33', '33'));

const same = grid('11', '1.');
eq('stats: identical worlds', score(lodStats(worldOf(same, 2, B.AIR), worldOf(same, 2, B.AIR), 2), 1), 0);
const isolated = grid('....', '.1..', '....', '....');
const empty = grid('....', '....', '....', '....');
eq('surface: unmatched block costs radius', lodStats(worldOf(isolated, 4, B.AIR), worldOf(empty, 4, B.AIR), 4).surfaceError, 4);
const beyondRadius = worldOf(empty, 4, B.AIR);
beyondRadius.get(chunkKey(1, 0)).cells[1 * 4 + 2] = 1;
eq('surface: blocks beyond radius are unmatched', lodStats(worldOf(isolated, 4, B.AIR), beyondRadius, 4).surfaceError, 8);
const differentAtRadius = worldOf(empty, 4, B.AIR);
differentAtRadius.get(chunkKey(1, 0)).cells[1 * 4 + 1] = 2;
eq('surface: candidate at radius includes material cost', lodStats(worldOf(isolated, 4, B.AIR), differentAtRadius, 4).surfaceError, 12);
eq('surface: moved same block costs distance both ways', lodStats(
  worldOf(isolated, 4, B.AIR), worldOf(grid('....', '..1.', '....', '....'), 4, B.AIR), 4).surfaceError, 2);
eq('surface: nearest block may match multiple blocks', lodStats(
  worldOf(grid('....', '.11.', '....', '....'), 4, B.AIR), worldOf(isolated, 4, B.AIR), 4).surfaceError, 1);
eq('surface: material mismatch costs both ways', lodStats(
  worldOf(isolated, 4, B.AIR), worldOf(grid('....', '.2..', '....', '....'), 4, B.AIR), 4).surfaceError, 4);
const enclosed = grid('111', '111', '111');
eq('surface: hidden recolor ignored', lodStats(worldOf(enclosed, 3, B.AIR), worldOf(grid('111', '121', '111'), 3, B.AIR), 3).surfaceError, 0);
const borderBefore = worldOf(grid('...1', '..11', '...1', '....'), 4, B.AIR);
borderBefore.get(chunkKey(1, 0)).cells[1 * 4] = 1;
const borderAfter = new Map(borderBefore);
borderAfter.set(chunkKey(0, 0), { ...borderBefore.get(chunkKey(0, 0)), cells: borderBefore.get(chunkKey(0, 0)).cells.slice() });
borderAfter.get(chunkKey(0, 0)).cells[1 * 4 + 3] = 2;
eq('surface: visibility sees solid across chunk border', lodStats(borderBefore, borderAfter, 4).surfaceError, 0);

const size = 16, maxLevel = Math.log2(size), levels = Array.from({ length: maxLevel }, (_, i) => i + 1);
const smart = LODS['smart sampling'];
/**
 * @param {import('./lods.js').LodFn} lod
 * @param {Uint8Array} cells
 * @param {number} level
 * @returns {number} score of the LOD of cells
 */
const scoreOf = (lod, cells, level) => {
  const input = worldOf(cells, size, B.AIR);
  const output = new Map(input);
  output.set(chunkKey(0, 0), { cx: 0, cy: 0, cells: lod(input, 0, 0, size, level) });
  return score(lodStats(input, output, size), level);
};

const crafted = Object.entries(scenarios(size));
for (const [name, cells] of crafted) {
  const scores = levels.flatMap((l) => [scoreOf(LODS.naive, cells, l), scoreOf(smart, cells, l)]);
  eq(`scores finite: ${name}`, scores.every(Number.isFinite), true);
  eq(`smart simplifies: ${name}`, levels.filter((l) => countCorners(lodOf(smart, cells, size, l), size) > countCorners(cells, size)), []);
  eq(`smart collapses at max level: ${name}`, new Set(lodOf(smart, cells, size, maxLevel)).size, 1);
}
const randomScores = randomChunks(size, 500).flatMap((cells) => levels.map((level) => scoreOf(smart, cells, level)));
eq('smart scores finite: 500 random chunks × all levels', randomScores.every(Number.isFinite), true);

const world = worldOf(crafted.find(([name]) => name === 'multi-color noise')[1], size, B.AIR);
for (const name in LODS)
  for (const level of [2, maxLevel]) {
    const t = performance.now();
    for (let i = 0; i < 1000; i++) LODS[name](world, 0, 0, size, level);
    out.textContent += `INFO ${name} level ${level}: ${(performance.now() - t).toFixed(2)} µs per noisy 16x16 chunk\n`;
  }
out.textContent += failures ? `${failures} FAILED\n` : 'ALL PASSED\n';
