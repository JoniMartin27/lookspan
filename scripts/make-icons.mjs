#!/usr/bin/env node
// Rasterize the Lookspan mark into the icons the desktop launcher needs.
//
//   packages/cli/assets/lookspan.ico  — Windows shortcuts (multi-size)
//   packages/cli/assets/lookspan.png  — Linux .desktop entries (512px)
//
// Source of truth is apps/dashboard/public/favicon.svg, so the launcher icon
// and the browser tab can never drift apart. Rendering goes through the
// Chromium that Playwright already installs for the demo recorder — no new
// dependency, and no committed binary that nobody can regenerate.
//
// Usage: node scripts/make-icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SVG = resolve(root, 'apps/dashboard/public/favicon.svg');
const OUT_DIR = resolve(root, 'packages/cli/assets');

// Sizes Windows Explorer actually asks for.
//
// Everything up to 48px is stored as an uncompressed DIB. PNG-compressed ICO
// entries are legal since Vista and the shell reads them, but the older GDI+
// path (System.Drawing.Icon, and anything built on it) cannot decode them and
// throws. DIB is understood by every consumer; PNG is only worth it at 256,
// where an uncompressed entry would be 256 KB on its own.
const DIB_SIZES = [16, 24, 32, 48];
const PNG_SIZES = [128, 256];
const LINUX_SIZE = 512;

/** Draw the SVG at `size` and return both raw RGBA bytes and PNG bytes. */
async function render(page, svg, size) {
  return page.evaluate(
    async ([markup, px]) => {
      const img = new Image();
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, px, px);
      const rgba = Array.from(ctx.getImageData(0, 0, px, px).data);
      const png = canvas.toDataURL('image/png').split(',')[1];
      return { rgba, png };
    },
    [svg, size],
  );
}

/**
 * Encode RGBA pixels as the DIB an ICO entry expects: a BITMAPINFOHEADER whose
 * height is doubled (colour rows plus the AND mask), bottom-up BGRA rows, then
 * a 1bpp mask with rows padded to 4 bytes.
 */
function encodeDib(rgba, size) {
  const header = Buffer.alloc(40);
  const xor = Buffer.alloc(size * size * 4);
  const maskStride = Math.ceil(size / 32) * 4;
  const and = Buffer.alloc(maskStride * size);

  for (let y = 0; y < size; y++) {
    const src = y * size * 4;
    const dstRow = size - 1 - y; // DIB rows run bottom-up
    for (let x = 0; x < size; x++) {
      const s = src + x * 4;
      const d = (dstRow * size + x) * 4;
      xor[d] = rgba[s + 2]; // B
      xor[d + 1] = rgba[s + 1]; // G
      xor[d + 2] = rgba[s]; // R
      xor[d + 3] = rgba[s + 3]; // A
      if (rgba[s + 3] === 0) {
        // transparent → set the mask bit
        and[dstRow * maskStride + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  header.writeUInt32LE(40, 0); // biSize
  header.writeInt32LE(size, 4); // biWidth
  header.writeInt32LE(size * 2, 8); // biHeight (colour + mask)
  header.writeUInt16LE(1, 12); // biPlanes
  header.writeUInt16LE(32, 14); // biBitCount
  header.writeUInt32LE(0, 16); // biCompression = BI_RGB
  header.writeUInt32LE(xor.length + and.length, 20); // biSizeImage

  return Buffer.concat([header, xor, and]);
}

/** Assemble encoded entries into an .ico. */
function buildIco(entries) {
  const HEADER = 6;
  const ENTRY = 16;
  const dir = Buffer.alloc(HEADER + ENTRY * entries.length);
  dir.writeUInt16LE(0, 0); // reserved
  dir.writeUInt16LE(1, 2); // type: icon
  dir.writeUInt16LE(entries.length, 4);

  let offset = dir.length;
  entries.forEach(({ size, data }, i) => {
    const at = HEADER + ENTRY * i;
    dir.writeUInt8(size >= 256 ? 0 : size, at); // 0 means 256
    dir.writeUInt8(size >= 256 ? 0 : size, at + 1);
    dir.writeUInt8(0, at + 2); // palette size (0 = truecolour)
    dir.writeUInt8(0, at + 3); // reserved
    dir.writeUInt16LE(1, at + 4); // colour planes
    dir.writeUInt16LE(32, at + 6); // bits per pixel
    dir.writeUInt32LE(data.length, at + 8);
    dir.writeUInt32LE(offset, at + 12);
    offset += data.length;
  });

  return Buffer.concat([dir, ...entries.map((e) => e.data)]);
}

const svg = readFileSync(SVG, 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent('<html><body></body></html>');

const entries = [];
for (const size of DIB_SIZES) {
  const { rgba } = await render(page, svg, size);
  entries.push({ size, data: encodeDib(rgba, size) });
}
for (const size of PNG_SIZES) {
  const { png } = await render(page, svg, size);
  entries.push({ size, data: Buffer.from(png, 'base64') });
}
const linux = await render(page, svg, LINUX_SIZE);
await browser.close();

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(resolve(OUT_DIR, 'lookspan.ico'), buildIco(entries));
writeFileSync(resolve(OUT_DIR, 'lookspan.png'), Buffer.from(linux.png, 'base64'));

console.log(`[icons] lookspan.ico  DIB ${DIB_SIZES.join('/')} + PNG ${PNG_SIZES.join('/')}`);
console.log(`[icons] lookspan.png  ${LINUX_SIZE}px`);
