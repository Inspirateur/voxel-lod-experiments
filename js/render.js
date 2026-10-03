import { CHUNK_SIZE, BOTTOM_CHUNK_Y, COLORS } from './config.js';

/** @typedef {import('./world.js').Chunk} Chunk */
/** @typedef {{x: number, y: number, px: number}} Camera  world point at canvas center, block size in pixels */

/**
 * @param {Camera} cam
 * @param {HTMLCanvasElement} canvas
 * @returns {{x: number, y: number}} world coordinates of the canvas top-left corner
 */
export const topLeft = (cam, canvas) => ({ x: cam.x - canvas.width / 2 / cam.px, y: cam.y - canvas.height / 2 / cam.px });

/**
 * Draws the blocks of the given chunks, grid lines and chunk borders.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Camera} cam
 * @param {Iterable<Chunk>} chunks
 */
export function drawWorld(ctx, cam, chunks) {
  const { width: w, height: h } = ctx.canvas, o = topLeft(cam, ctx.canvas), px = cam.px;
  const sx = (x) => Math.round((x - o.x) * px), sy = (y) => Math.round((y - o.y) * px);
  ctx.fillStyle = '#e8f4ff';
  ctx.fillRect(0, 0, w, h);
  for (const { cx, cy, cells } of chunks) {
    const bx = cx * CHUNK_SIZE, by = cy * CHUNK_SIZE;
    if (sx(bx + CHUNK_SIZE) < 0 || sy(by + CHUNK_SIZE) < 0 || sx(bx) > w || sy(by) > h) continue;
    for (let i = 0; i < cells.length; i++) {
      if (!cells[i]) continue;
      const x = bx + i % CHUNK_SIZE, y = by + Math.floor(i / CHUNK_SIZE);
      ctx.fillStyle = COLORS[cells[i]];
      ctx.fillRect(sx(x), sy(y), sx(x + 1) - sx(x), sy(y + 1) - sy(y));
    }
  }
  const bottom = Math.min(h, sy((BOTTOM_CHUNK_Y + 1) * CHUNK_SIZE));
  if (px >= 8) drawLines(ctx, o, px, bottom, 1, 'rgba(0,0,0,.12)');
  drawLines(ctx, o, px, bottom, CHUNK_SIZE, 'rgba(220,0,0,.6)');
}

/**
 * Strokes vertical and horizontal lines every `step` blocks, from the canvas top down to `h`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{x: number, y: number}} o world coordinates of the canvas top-left corner
 * @param {number} px block size in pixels
 * @param {number} h canvas y where lines stop (world bottom, or canvas height if the bottom is off-screen)
 * @param {number} step spacing in blocks
 * @param {string} style stroke style
 */
function drawLines(ctx, o, px, h, step, style) {
  const w = ctx.canvas.width;
  ctx.beginPath();
  for (let x = Math.ceil(o.x / step) * step; (x - o.x) * px < w; x += step) {
    const s = Math.round((x - o.x) * px) + 0.5;
    ctx.moveTo(s, 0); ctx.lineTo(s, h);
  }
  for (let y = Math.ceil(o.y / step) * step; (y - o.y) * px <= h; y += step) {
    const s = Math.round((y - o.y) * px) + 0.5;
    ctx.moveTo(0, s); ctx.lineTo(w, s);
  }
  ctx.strokeStyle = style;
  ctx.stroke();
}
