// Procedural placeholder art for test mods and the example mod (our own work, free to use):
//   node scripts/make-test-art.mjs <out dir> [colorHex] [colorHex2]
// Writes flag.png (410×256), crest.png (128×128), icon_box.png (80×80), illustration.png (480×300),
// portrait.png (128×128). Plain Node: zlib + a tiny PNG encoder, no dependencies.
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const out = process.argv[2]
if (!out) { console.error('usage: node scripts/make-test-art.mjs <out dir> [#3fa7a0] [#e0d08a]'); process.exit(2) }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const c1 = hex(process.argv[3] ?? '#3fa7a0')
const c2 = hex(process.argv[4] ?? '#e0d08a')

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c })
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function png(w, h, px) { // px(x, y) -> [r,g,b,a]
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = px(x, y)
      const o = y * (w * 4 + 1) + 1 + x * 4
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const dark = (c, f) => c.map((v) => Math.round(v * f))
let seed = 7
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
const stars = Array.from({ length: 220 }, () => [rnd() * 480, rnd() * 300, rnd()])

fs.mkdirSync(out, { recursive: true })
const write = (name, buf) => { fs.writeFileSync(path.join(out, name), buf); console.log(`wrote ${path.join(out, name)}`) }

// flag: diagonal split, a ring emblem
write('flag.png', png(410, 256, (x, y) => {
  const t = x / 410 + y / 512
  let c = t < 0.75 ? mix(dark(c1, 0.45), c1, t) : dark(c2, 0.8)
  const d = Math.hypot(x - 150, y - 128)
  if (d > 58 && d < 72) c = c2
  if (Math.abs(x - 150) < 6 && d < 58) c = c2
  return [...c, 255]
}))
// crest: ring with a bar, transparent outside
write('crest.png', png(128, 128, (x, y) => {
  const d = Math.hypot(x - 63.5, y - 63.5)
  if (d > 62) return [0, 0, 0, 0]
  if (d > 52) return [...c2, 255]
  if (Math.abs(x - 63.5) < 7) return [...c2, 255]
  return [...dark(c1, 0.6 + 0.4 * (1 - d / 62)), 235]
}))
// cargo icon (80×80 like vanilla's): a box with a stripe
write('icon_box.png', png(80, 80, (X, Y) => {
  const x = (X * 64) / 80, y = (Y * 64) / 80
  if (x < 8 || x > 55 || y < 12 || y > 54) return [0, 0, 0, 0]
  if (x < 11 || x > 52 || y < 15 || y > 51) return [30, 30, 34, 255]
  if (y > 28 && y < 36) return [...c2, 255]
  return [...dark(c1, 0.55 + (y - 12) / 120), 255]
}))
// illustration: space, a planet limb and a wreck silhouette
write('illustration.png', png(480, 300, (x, y) => {
  let c = mix([4, 6, 12], [14, 24, 40], y / 300)
  for (const [sx, sy, b] of stars) if (Math.abs(sx - x) < 0.8 && Math.abs(sy - y) < 0.8) c = mix(c, [255, 255, 255], 0.4 + b * 0.6)
  const pd = Math.hypot(x - 520, y - 420)
  if (pd < 330) c = mix(dark(c1, 0.35), dark(c1, 0.15), Math.min(1, (330 - pd) / 120))
  if (pd >= 330 && pd < 336) c = mix(c, c1, 0.6)
  const inHull = (x > 120 && x < 330 && y > 120 && y < 160) || (x > 160 && x < 230 && y > 95 && y < 185) || (x > 300 && x < 345 && y > 105 && y < 175)
  if (inHull && !((x * 7 + y * 3) % 23 < 2)) c = mix([40, 42, 48], [80, 78, 70], (y - 95) / 90)
  return [...c, 255]
}))
// portrait: a head-and-shoulders silhouette on a gradient
write('portrait.png', png(128, 128, (x, y) => {
  let c = mix(dark(c1, 0.3), dark(c1, 0.1), y / 128)
  const head = Math.hypot((x - 64) / 22, (y - 52) / 27) < 1
  const body = y > 84 && Math.abs(x - 64) < 20 + (y - 84) * 0.9
  if (head || body) c = mix([70, 66, 62], dark(c2, 0.55), y / 128)
  return [...c, 255]
}))
