// Erzeugt die PWA-Icons (Kalenderblatt auf blauem Grund) ohne externe Abhängigkeiten.
// Aufruf: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x / size, y / size);
      raw.set([r, g, b, a], row + 1 + x * 4);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const BLUE = [37, 99, 235, 255];
const WHITE = [255, 255, 255, 255];
const RED = [239, 68, 68, 255];
const GREEN = [37, 211, 102, 255];
const TRANSPARENT = [0, 0, 0, 0];

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  if (x < left || x > right || y < top || y > bottom) return false;
  const cx = Math.min(Math.max(x, left + radius), right - radius);
  const cy = Math.min(Math.max(y, top + radius), bottom - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

/** scale < 1 verkleinert das Motiv (Safe Zone für maskable Icons). */
function calendarIcon(rounded, scale) {
  return (u, v) => {
    if (rounded && !insideRoundedRect(u, v, 0, 0, 1, 1, 0.2)) return TRANSPARENT;
    const x = 0.5 + (u - 0.5) / scale;
    const y = 0.5 + (v - 0.5) / scale;

    const left = 0.2, right = 0.8, top = 0.24, bottom = 0.8;
    for (const ringX of [0.35, 0.65]) {
      if (insideRoundedRect(x, y, ringX - 0.03, 0.17, ringX + 0.03, 0.3, 0.03)) return WHITE;
    }
    if (!insideRoundedRect(x, y, left, top, right, bottom, 0.06)) return BLUE;
    if (y < 0.38) return RED;

    // Häkchen in WhatsApp-Grün
    const distanceToSegment = (ax, ay, bx, by) => {
      const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / ((bx - ax) ** 2 + (by - ay) ** 2)));
      return Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay)));
    };
    const stroke = 0.045;
    if (distanceToSegment(0.36, 0.58, 0.46, 0.68) < stroke || distanceToSegment(0.46, 0.68, 0.65, 0.48) < stroke) {
      return GREEN;
    }
    return WHITE;
  };
}

const outDir = new URL('../public/icons/', import.meta.url);
mkdirSync(outDir, { recursive: true });
writeFileSync(new URL('icon-192.png', outDir), encodePng(192, calendarIcon(true, 1)));
writeFileSync(new URL('icon-512.png', outDir), encodePng(512, calendarIcon(true, 1)));
writeFileSync(new URL('icon-maskable-512.png', outDir), encodePng(512, calendarIcon(false, 0.75)));
console.log('Icons geschrieben nach', outDir.pathname);
