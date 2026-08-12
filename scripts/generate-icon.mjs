/**
 * Generates the extension logo: a dot surrounded by concentric rings — a beacon.
 *
 * The PNG is encoded here, by hand, on top of `node:zlib`. Pulling an image
 * library in for one 128×128 file would put third-party code in a repository
 * whose whole pitch is that it carries none.
 *
 * Run `npm run icon` after changing anything below.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const SIZE = 128
const CENTRE = SIZE / 2

/** One hue for the signal, one accent for the session it names. Nothing else. */
const HUE = [0x17, 0xa2, 0xa2]
const ACCENT = [0x8b, 0x5c, 0xf6]

const disc = (radius) => (distance) => distance <= radius
const ring = (radius, width) => (distance) => Math.abs(distance - radius) <= width / 2

/**
 * Radii and widths are the design. They are chosen so that no stroke and no gap
 * falls below 128/24 ≈ 5.4 px, which is what it takes for the logo to still read
 * as a dot inside rings once VS Code draws it at 24 px.
 */
const SHAPES = [
  { covers: disc(16), colour: ACCENT },
  { covers: ring(32, 9), colour: HUE },
  { covers: ring(52, 7), colour: HUE },
]

const SAMPLES = 4

/** Fraction of the pixel covered by the shape, by supersampling its area. */
function coverage(shape, px, py) {
  let hits = 0
  for (let sy = 0; sy < SAMPLES; sy++) {
    for (let sx = 0; sx < SAMPLES; sx++) {
      const dx = px + (sx + 0.5) / SAMPLES - CENTRE
      const dy = py + (sy + 0.5) / SAMPLES - CENTRE
      if (shape.covers(Math.hypot(dx, dy))) hits++
    }
  }
  return hits / (SAMPLES * SAMPLES)
}

/** RGBA pixels, row-major, over a transparent background. */
function rasterise() {
  const pixels = Buffer.alloc(SIZE * SIZE * 4)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      for (const shape of SHAPES) {
        const covered = coverage(shape, x, y)
        if (covered === 0) continue
        const i = (y * SIZE + x) * 4
        // The shapes never overlap, so coverage is the alpha and the colour is
        // written unblended — which is also what keeps the palette at two entries.
        pixels[i] = shape.colour[0]
        pixels[i + 1] = shape.colour[1]
        pixels[i + 2] = shape.colour[2]
        pixels[i + 3] = Math.round(covered * 255)
      }
    }
  }
  return pixels
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** @returns {Buffer} the logo, as PNG bytes. */
export function renderIcon() {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(SIZE, 0)
  ihdr.writeUInt32BE(SIZE, 4)
  ihdr.writeUInt8(8, 8) // bit depth
  ihdr.writeUInt8(6, 9) // colour type 6 = RGBA
  ihdr.writeUInt8(0, 10) // deflate
  ihdr.writeUInt8(0, 11) // adaptive filtering
  ihdr.writeUInt8(0, 12) // no interlacing

  const pixels = rasterise()
  const stride = SIZE * 4
  const raw = Buffer.alloc(SIZE * (stride + 1))
  for (let y = 0; y < SIZE; y++) {
    raw.writeUInt8(0, y * (stride + 1)) // filter type 0: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = fileURLToPath(new URL('../images/icon.png', import.meta.url))
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, renderIcon())
  console.log(`wrote ${target}`)
}
