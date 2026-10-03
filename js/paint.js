import { COLORS, B } from './config.js';
import { getBlock, setBlock } from './world.js';
import { topLeft } from './render.js';

/**
 * Builds the palette and wires painting (left button), panning (right drag) and zooming (wheel) on the canvas.
 * @param {HTMLCanvasElement} canvas painting canvas
 * @param {HTMLElement} palette container for the palette buttons
 * @param {import('./render.js').Camera} cam mutated by pan/zoom
 * @param {(chunkKey: string | null) => void} onChange called with the modified chunk key, or null on camera change
 */
export function setupPainting(canvas, palette, cam, onChange) {
  let selected = B.GRASS;
  const buttons = COLORS.map((color, id) => {
    const button = palette.appendChild(document.createElement('button'));
    button.style.background = color ?? '#fff';
    button.textContent = color ? '' : 'erase';
    button.onclick = () => { selected = id; buttons.forEach((b, i) => b.classList.toggle('sel', i === id)); };
    return button;
  });
  buttons[selected].click();

  /** @param {PointerEvent} e */
  const paint = (e) => {
    const o = topLeft(cam, canvas);
    const x = Math.floor(o.x + e.offsetX / cam.px), y = Math.floor(o.y + e.offsetY / cam.px);
    if (getBlock(x, y) !== selected) onChange(setBlock(x, y, selected));
  };

  canvas.oncontextmenu = (e) => e.preventDefault();
  canvas.onpointerdown = (e) => {
    canvas.setPointerCapture(e.pointerId);
    if (e.button === 0) paint(e);
  };
  canvas.onpointermove = (e) => {
    if (e.buttons & 1) paint(e);
    else if (e.buttons & 2) {
      cam.x -= e.movementX / cam.px;
      cam.y -= e.movementY / cam.px;
      onChange(null);
    }
  };
  canvas.onwheel = (e) => {
    e.preventDefault();
    cam.px = Math.min(64, Math.max(2, cam.px * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
    onChange(null);
  };
}
