// 把 media/icon.svg 的几何形状光栅化为干净的 256x256 PNG.
// 不用 qlmanage: 它会烧进投影与留白, 不适合做扩展图标.
// 仅依赖 node 内置 zlib, 4x4 超采样做抗锯齿.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const SIZE = 256;
const SS = 4; // 每轴超采样数

const hex = (value) => [
  parseInt(value.slice(1, 3), 16),
  parseInt(value.slice(3, 5), 16),
  parseInt(value.slice(5, 7), 16)
];
const lerp = (a, b, t) => a + (b - a) * t;
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];

const insideRoundedRect = (px, py, x, y, w, h, r) => {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = Math.max(Math.abs(px - cx) - (w / 2 - r), 0);
  const dy = Math.max(Math.abs(py - cy) - (h / 2 - r), 0);
  return dx * dx + dy * dy <= r * r;
};
const insideCircle = (px, py, cx, cy, r) => (px - cx) ** 2 + (py - cy) ** 2 <= r * r;

const BG_FROM = hex('#2E3547');
const BG_TO = hex('#171B26');
const BORDER = hex('#3C4459');
const GUTTER = hex('#5D6880');
const LEFT_BAR = hex('#9AA6BF');
const RIGHT_BAR = hex('#E6EBF5');
const ACCENT_FROM = hex('#6FD6FF');
const ACCENT_TO = hex('#3E8BFF');

const ROWS = [
  { y: 80, left: 46, right: 52, accent: false },
  { y: 120, left: 30, right: 66, accent: true },
  { y: 160, left: 38, right: 40, accent: false }
];
const BAR_H = 16;
const BAR_R = 8;

/** 每层: inside(px,py) -> bool, color(px,py) -> [r,g,b] */
const layers = [
  {
    inside: (px, py) => insideRoundedRect(px, py, 0, 0, SIZE, SIZE, 56),
    color: (px, py) => mix(BG_FROM, BG_TO, (px / SIZE + py / SIZE) / 2)
  },
  {
    inside: (px, py) =>
      insideRoundedRect(px, py, 1.5, 1.5, 253, 253, 54.5) &&
      !insideRoundedRect(px, py, 4.5, 4.5, 247, 247, 51.5),
    color: () => BORDER
  },
  ...ROWS.map((row) => ({
    inside: (px, py) => insideCircle(px, py, 46, row.y + BAR_H / 2, 4.5),
    color: () => GUTTER
  })),
  ...ROWS.map((row) => ({
    inside: (px, py) => insideRoundedRect(px, py, 68, row.y, row.left, BAR_H, BAR_R),
    color: () => LEFT_BAR
  })),
  {
    inside: (px, py) => insideRoundedRect(px, py, 122, 62, 10, 132, 5),
    color: (px, py) => mix(ACCENT_FROM, ACCENT_TO, (py - 62) / 132)
  },
  ...ROWS.map((row) => ({
    inside: (px, py) => insideRoundedRect(px, py, 145, row.y, row.right, BAR_H, BAR_R),
    color: () => (row.accent ? ACCENT_FROM : RIGHT_BAR)
  }))
];

const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  const rowStart = y * (SIZE * 4 + 1);
  raw[rowStart] = 0; // filter type: none
  for (let x = 0; x < SIZE; x++) {
    let r = 0;
    let g = 0;
    let b = 0;
    let a = 0;
    for (let sy = 0; sy < SS; sy++) {
      for (let sx = 0; sx < SS; sx++) {
        const px = x + (sx + 0.5) / SS;
        const py = y + (sy + 0.5) / SS;
        // 逐层覆盖: 后面的层直接盖住前面的层(全不透明)
        let sample = null;
        for (const layer of layers) {
          if (layer.inside(px, py)) {
            sample = layer.color(px, py);
          }
        }
        if (sample) {
          r += sample[0];
          g += sample[1];
          b += sample[2];
          a += 255;
        }
      }
    }
    const samples = SS * SS;
    const covered = a / 255;
    const offset = rowStart + 1 + x * 4;
    // 预乘还原: 颜色按已覆盖的采样求均值, alpha 按覆盖率
    raw[offset] = covered ? Math.round(r / covered) : 0;
    raw[offset + 1] = covered ? Math.round(g / covered) : 0;
    raw[offset + 2] = covered ? Math.round(b / covered) : 0;
    raw[offset + 3] = Math.round((a / samples) * (255 / 255));
  }
}

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, crc]);
};

let crcTable = null;
function crc32(buffer) {
  if (!crcTable) {
    crcTable = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0);
ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // color type: RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
]);

const out = process.argv[2];
writeFileSync(out, png);
console.log('written', out, png.length, 'bytes');
