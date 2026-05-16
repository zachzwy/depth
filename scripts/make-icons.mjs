// Generate icon PNGs at 16/32/48/128 — three horizontal bars at decreasing widths,
// distinct colors. Matches the in-panel Depth logo.
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(__dirname, '../src/icons');
mkdirSync(OUT_DIR, { recursive: true });

const VIOLET = [184, 168, 230, 255];
const ORANGE = [232, 168, 124, 255];
const CYAN   = [140, 196, 214, 255];
const TRANSPARENT = [0, 0, 0, 0];

// Layout: each bar described by vertical center fraction + width fraction.
// Vertical centers chosen so bars are visually evenly spaced and roughly centered.
const BARS = [
  { centerY: 0.32, widthFrac: 0.66, color: VIOLET },
  { centerY: 0.50, widthFrac: 0.48, color: ORANGE },
  { centerY: 0.68, widthFrac: 0.30, color: CYAN },
];
const X_FRAC = 0.17;
const BAR_H_FRAC = 0.12;

function setPx(png, size, x, y, [r, g, b, a]) {
  if (x < 0 || y < 0 || x >= size || y >= size) return;
  const i = (size * y + x) << 2;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = a;
}

function drawRoundedBar(png, size, x, y, w, h, color) {
  const r = Math.min(Math.floor(h / 2), 4);
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      let inside;
      if (dy >= r && dy < h - r) {
        inside = true;
      } else {
        const cy = dy < r ? r : h - r - 1;
        if (dx < r) {
          const xx = r - dx;
          const yy = cy - dy;
          inside = xx * xx + yy * yy <= r * r;
        } else if (dx >= w - r) {
          const xx = dx - (w - r - 1);
          const yy = cy - dy;
          inside = xx * xx + yy * yy <= r * r;
        } else {
          inside = true;
        }
      }
      if (inside) setPx(png, size, x + dx, y + dy, color);
    }
  }
}

function makeIcon(size) {
  const png = new PNG({ width: size, height: size });
  // Initialize all transparent.
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 0;
    png.data[i + 1] = 0;
    png.data[i + 2] = 0;
    png.data[i + 3] = 0;
  }

  const barH = Math.max(2, Math.round(size * BAR_H_FRAC));
  const xStart = Math.round(X_FRAC * size);

  for (const bar of BARS) {
    const w = Math.max(barH, Math.round(bar.widthFrac * size));
    const y = Math.round(bar.centerY * size) - Math.floor(barH / 2);
    drawRoundedBar(png, size, xStart, y, w, barH, bar.color);
  }

  const out = PNG.sync.write(png);
  const path = resolve(OUT_DIR, `icon-${size}.png`);
  writeFileSync(path, out);
  console.log('wrote', path);
}

for (const s of [16, 32, 48, 128]) makeIcon(s);
