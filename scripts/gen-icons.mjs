#!/usr/bin/env node
/* Genera los PNG del PWA/APK sin dependencias: círculo rojo + triángulo blanco. */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(out, { recursive: true });

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePNG(size, pixels) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    pixels.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function draw(size, maskable) {
  const px = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const rCircle = size * (maskable ? 0.3 : 0.34);
  const inset = maskable ? 0.5 : 0.42; // zona segura del triángulo
  // triángulo de play: (cx - a, cy - b) -> (cx - a, cy + b) -> (cx + b2, cy)
  const a = size * 0.115;
  const b = size * 0.175;
  const b2 = size * inset - 0;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      // fondo: círculo rojo sobre oscuro (maskable = fondo rojo pleno)
      const d = Math.hypot(x - cx, y - cy);
      let r, g, bl;
      if (maskable || d <= rCircle) {
        [r, g, bl] = [255, 0, 51];
        if (!maskable && d > rCircle - 1.5) {
          const t = Math.min(1, d - (rCircle - 1.5));
          r = Math.round(255 * (1 - t) + 3 * t);
          g = Math.round(0 * (1 - t) + 3 * t);
          bl = Math.round(51 * (1 - t) + 3 * t);
        }
      } else {
        [r, g, bl] = [3, 3, 3];
      }
      // triángulo blanco
      const px2 = x - (cx - a);
      const py2 = y - cy;
      if (px2 >= 0 && px2 <= b2 + a && Math.abs(py2) <= b * (1 - px2 / (b2 + a))) {
        [r, g, bl] = [255, 255, 255];
      }
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = bl;
      px[i + 3] = 255;
    }
  }
  return encodePNG(size, px);
}

writeFileSync(join(out, 'icon-192.png'), draw(192, false));
writeFileSync(join(out, 'icon-512.png'), draw(512, false));
writeFileSync(join(out, 'icon-maskable-512.png'), draw(512, true));

/* Iconos de lanzamiento de Android (si existe el proyecto capacitor) */
const ANDROID = join(dirname(fileURLToPath(import.meta.url)), '..', 'android', 'app', 'src', 'main', 'res');
const DENSITIES = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
try {
  for (const [dens, size] of Object.entries(DENSITIES)) {
    const dir = join(ANDROID, `mipmap-${dens}`);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'ic_launcher.png'), draw(size, true));
    writeFileSync(join(dir, 'ic_launcher_round.png'), draw(size, true));
    // Capa frontal del icono adaptativo (referenciada por mipmap-anydpi-v26)
    writeFileSync(join(dir, 'ic_launcher_foreground.png'), draw(Math.round(size * 2.67), true));
  }
  console.log('Iconos de Android actualizados en android/app/src/main/res');
} catch {
  console.log('Proyecto Android no presente; se omiten sus iconos.');
}
console.log('Iconos generados en public/: icon-192.png, icon-512.png, icon-maskable-512.png');
