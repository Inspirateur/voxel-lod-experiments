import { LOD_LEVELS } from './config.js';
import { LODS } from './lods.js';
import { chunks } from './world.js';
import { generateWorld } from './worldgen.js';
import { drawWorld } from './render.js';
import { setupPainting } from './paint.js';
import { drawLods, setAlgo, invalidate } from './lodView.js';

const paintCanvas = document.getElementById('paint-canvas');
const paintCtx = paintCanvas.getContext('2d');
const lodSection = document.getElementById('lods');
const algoSelect = document.getElementById('algo');
/** Shared camera; LOD views use it scaled to their height. @type {import('./render.js').Camera} */
const cam = { x: 0, y: 0, px: 8 };

const views = LOD_LEVELS.map(() => {
  const canvas = lodSection.appendChild(document.createElement('canvas'));
  const label = lodSection.appendChild(document.createElement('div'));
  return { ctx: canvas.getContext('2d'), label };
});

let frame = 0;
/** Schedules a redraw of all canvases on the next animation frame. */
function redraw() {
  frame ||= requestAnimationFrame(() => {
    frame = 0;
    drawWorld(paintCtx, cam, chunks.values());
    drawLods(views, { ...cam, px: cam.px * views[0].ctx.canvas.height / paintCanvas.height });
  });
}

const canvases = [paintCanvas, ...views.map((v) => v.ctx.canvas)];
/** Matches every canvas' resolution to its displayed size, then redraws. */
function resize() {
  for (const canvas of canvases) {
    canvas.width = canvas.clientWidth;
    canvas.height = canvas.clientHeight;
  }
  redraw();
}

for (const name in LODS) algoSelect.add(new Option(name));
algoSelect.onchange = () => { setAlgo(algoSelect.value); redraw(); };

generateWorld();
setupPainting(paintCanvas, document.getElementById('palette'), cam, (key) => {
  if (key) invalidate(key);
  redraw();
});
const observer = new ResizeObserver(resize);
canvases.forEach((canvas) => observer.observe(canvas));
