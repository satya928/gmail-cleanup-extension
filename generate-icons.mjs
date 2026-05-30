/**
 * Generates icon16.png, icon48.png, icon128.png
 * Uses only Node.js built-ins (zlib). No canvas / sharp needed.
 *
 * Design: indigo→violet rounded square + white envelope with V-fold
 */
import zlib from 'zlib';
import fs   from 'fs';
import path from 'path';

/* ─── CRC-32 ─────────────────────────────────────────────────────────────── */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (const b of buf) c = (CRC_TABLE[(c ^ b) & 0xFF] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xFFFFFFFF) >>> 0;
}

/* ─── PNG chunk builder ───────────────────────────────────────────────────── */
function chunk(type, data) {
  const t   = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

/* ─── PNG encoder (RGBA) ──────────────────────────────────────────────────── */
function encodePNG(w, h, pixelFn) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA

  const raw = Buffer.alloc((4 * w + 1) * h);
  let off = 0;
  for (let y = 0; y < h; y++) {
    raw[off++] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = pixelFn(x, y);
      raw[off++] = clamp(r); raw[off++] = clamp(g);
      raw[off++] = clamp(b); raw[off++] = clamp(a);
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ─── Helpers ─────────────────────────────────────────────────────────────── */
const clamp   = v => Math.round(Math.max(0, Math.min(255, v)));
const lerp    = (a, b, t) => a + (b - a) * t;
const hypot   = (dx, dy) => Math.sqrt(dx*dx + dy*dy);

// Smooth anti-alias alpha for a distance field (dist < 0 = inside)
const aaAlpha = (dist) => Math.max(0, Math.min(1, 0.5 - dist));

// Signed distance from point to line segment
function sdSeg(px, py, ax, ay, bx, by) {
  const dx = bx-ax, dy = by-ay, len2 = dx*dx+dy*dy;
  if (len2 === 0) return hypot(px-ax, py-ay);
  const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / len2));
  return hypot(px-(ax+t*dx), py-(ay+t*dy));
}

// Signed distance to rounded rectangle (negative = inside)
function sdRRect(px, py, x0, y0, x1, y1, r) {
  const qx = Math.max(x0+r-px, 0, px-(x1-r));
  const qy = Math.max(y0+r-py, 0, py-(y1-r));
  return hypot(qx, qy) - r;
}

/* ─── Icon pixel function ─────────────────────────────────────────────────── */
function drawPixel(x, y, s) {
  const cx = x + 0.5, cy = y + 0.5;

  // ── 1. Background: indigo→violet rounded square ──
  const pad = s * 0.06;
  const rad = s * 0.18;
  const bgDist = sdRRect(cx, cy, pad, pad, s-pad, s-pad, rad);
  if (bgDist > 0.5) return [0, 0, 0, 0]; // transparent outside

  const gt  = Math.max(0, Math.min(1, (cx/s + cy/s) * 0.5));
  const bgR = lerp(99,  139, gt);   // indigo R → violet R
  const bgG = lerp(102,  92, gt);
  const bgB = lerp(241, 246, gt);
  const bgA = 255 * aaAlpha(bgDist);

  // ── 2. Envelope ──
  const ex0 = s * 0.19, ex1 = s * 0.81;
  const ey0 = s * 0.29, ey1 = s * 0.71;
  const ecx = (ex0 + ex1) * 0.5;
  const foldY = ey0 + (ey1 - ey0) * 0.40; // apex of the V

  const lw = Math.max(1.2, s * 0.030);

  const inEnv = cx > ex0 && cx < ex1 && cy > ey0 && cy < ey1;
  if (inEnv) {
    const segs = [
      [ex0, ey0, ex1, ey0], // top
      [ex1, ey0, ex1, ey1], // right
      [ex1, ey1, ex0, ey1], // bottom
      [ex0, ey1, ex0, ey0], // left
      [ex0, ey0, ecx, foldY], // V left
      [ex1, ey0, ecx, foldY], // V right
    ];
    let md = Infinity;
    for (const [ax,ay,bx,by] of segs) md = Math.min(md, sdSeg(cx,cy,ax,ay,bx,by));
    const la = aaAlpha(md - lw/2);
    if (la > 0.01) return [255, 255, 255, Math.round(255 * la)];
    return [255, 255, 255, 28]; // faint fill
  }

  // ── 3. Sparkle dot (top-right, only ≥48px) ──
  if (s >= 48) {
    const sp = s * 0.73, sq = s * 0.22, sr = s * 0.052;
    const sd = hypot(cx-sp, cy-sq);
    const sa = aaAlpha(sd - sr);
    if (sa > 0.01) return [255, 255, 255, Math.round(255 * sa)];
  }

  return [bgR, bgG, bgB, Math.round(bgA)];
}

/* ─── Generate files ──────────────────────────────────────────────────────── */
const outDir = path.join('public', 'icons');
fs.mkdirSync(outDir, { recursive: true });

for (const size of [16, 48, 128]) {
  const buf = encodePNG(size, size, (x, y) => drawPixel(x, y, size));
  const file = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(file, buf);
  console.log(`✓ ${file}  (${buf.length} bytes)`);
}
console.log('\nIcons generated in public/icons/');
