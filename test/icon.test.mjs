import { deepEqual, equal, ok } from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { crc32, inflateSync } from 'node:zlib'

import { renderIcon } from '../scripts/generate-icon.mjs'

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/**
 * Decodes the PNG by hand rather than trusting the encoder's own helpers:
 * a decoder sharing the encoder's bugs would agree with anything.
 */
function decodePng(buffer) {
  ok(buffer.subarray(0, 8).equals(SIGNATURE), 'PNG signature')

  const chunks = []
  let offset = 8
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString('latin1', offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    const declared = buffer.readUInt32BE(offset + 8 + length)
    equal(declared, crc32(buffer.subarray(offset + 4, offset + 8 + length)), `CRC of ${type}`)
    chunks.push({ type, data })
    offset += 12 + length
  }

  equal(chunks.at(0).type, 'IHDR', 'first chunk is IHDR')
  equal(chunks.at(-1).type, 'IEND', 'last chunk is IEND')

  const ihdr = chunks[0].data
  const header = {
    width: ihdr.readUInt32BE(0),
    height: ihdr.readUInt32BE(4),
    bitDepth: ihdr.readUInt8(8),
    colorType: ihdr.readUInt8(9),
    compression: ihdr.readUInt8(10),
    filter: ihdr.readUInt8(11),
    interlace: ihdr.readUInt8(12),
  }

  const idat = Buffer.concat(chunks.filter((c) => c.type === 'IDAT').map((c) => c.data))
  const raw = inflateSync(idat)
  const stride = header.width * 4

  const pixels = Buffer.alloc(header.height * stride)
  for (let y = 0; y < header.height; y++) {
    equal(raw.readUInt8(y * (stride + 1)), 0, `scanline ${y} uses filter type 0`)
    raw.copy(pixels, y * stride, y * (stride + 1) + 1, (y + 1) * (stride + 1))
  }

  return {
    ...header,
    at(x, y) {
      const i = y * stride + x * 4
      return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]
    },
  }
}

const icon = decodePng(renderIcon())

// The palette and the geometry below are restated rather than imported: they are the
// design this file is here to hold. Importing them from the generator would make the
// tests agree with whatever it happens to draw.
const HUE = [0x17, 0xa2, 0xa2]
const ACCENT = [0x8b, 0x5c, 0xf6]

/** The smallest size the logo has to survive, expressed in 128×128 pixels. */
const PIXEL_AT_24PX = 128 / 24

const rgb = ([r, g, b]) => [r, g, b]
const alpha = ([, , , a]) => a

test('is a 128×128 truecolour-with-alpha PNG', () => {
  equal(icon.width, 128)
  equal(icon.height, 128)
  equal(icon.bitDepth, 8)
  equal(icon.colorType, 6, 'colour type 6 = RGBA')
  equal(icon.interlace, 0)
})

test('has a transparent background', () => {
  for (const [x, y] of [
    [0, 0],
    [127, 0],
    [0, 127],
    [127, 127],
    [64, 2],
    [2, 64],
  ]) {
    equal(alpha(icon.at(x, y)), 0, `pixel ${x},${y} is transparent`)
  }
})

test('is a dot surrounded by concentric rings', () => {
  deepEqual(rgb(icon.at(64, 64)), ACCENT, 'the dot at the centre carries the accent')
  equal(alpha(icon.at(64, 64)), 255)

  deepEqual(rgb(icon.at(64 + 32, 64)), HUE, 'the inner ring carries the hue')
  deepEqual(rgb(icon.at(64, 64 - 32)), HUE, 'the inner ring is a ring, not an arc')
  deepEqual(rgb(icon.at(64 + 52, 64)), HUE, 'the outer ring carries the hue')

  equal(alpha(icon.at(64 + 22, 64)), 0, 'the dot is detached from the inner ring')
  equal(alpha(icon.at(64 + 42, 64)), 0, 'the rings are detached from each other')
})

test('uses one hue and one accent, and nothing else', () => {
  const colours = new Set()
  for (let y = 0; y < icon.height; y++) {
    for (let x = 0; x < icon.width; x++) {
      const pixel = icon.at(x, y)
      if (alpha(pixel) > 0) colours.add(rgb(pixel).join(','))
    }
  }
  deepEqual([...colours].sort(), [ACCENT.join(','), HUE.join(',')].sort())
})

test('every stroke and every gap survives a 24 px rendering', () => {
  // Walk out from the centre: each run of ink, and each gap between runs, has to
  // be wider than a single pixel of a 24 px rendering or it dissolves at that size.
  const classify = (x) => {
    const pixel = icon.at(x, 64)
    if (alpha(pixel) < 128) return 'gap'
    return rgb(pixel).join(',') === ACCENT.join(',') ? 'accent' : 'hue'
  }

  const runs = []
  for (let x = 64; x < 128; x++) {
    const kind = classify(x)
    if (runs.at(-1)?.kind === kind) runs.at(-1).width++
    else runs.push({ kind, width: 1 })
  }

  deepEqual(
    runs.map((run) => run.kind),
    ['accent', 'gap', 'hue', 'gap', 'hue', 'gap'],
    'dot, gap, ring, gap, ring, margin',
  )
  for (const run of runs) {
    ok(
      run.width >= PIXEL_AT_24PX,
      `a ${run.kind} run of ${run.width} px is thinner than one pixel at 24 px`,
    )
  }
})

test('renders identically every time', () => {
  ok(renderIcon().equals(renderIcon()))
})

test('the committed image is the one the generator produces', async () => {
  const committed = await readFile(new URL('../images/icon.png', import.meta.url))
  ok(committed.equals(renderIcon()), 'run `npm run icon` to regenerate images/icon.png')
})
