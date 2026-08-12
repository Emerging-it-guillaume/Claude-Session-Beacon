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
const CLAY = [0xd9, 0x77, 0x57]
const SLATE = [0x7c, 0x7a, 0x72]

/** A column through each tab, and a row that crosses all three. */
const THROUGH_LEFT = 20
const THROUGH_FOCUSED = 64
const THROUGH_RIGHT = 107
const ACROSS = 80

/** The smallest size the logo has to survive, expressed in 128×128 pixels. */
const PIXEL_AT_24PX = 128 / 24

const rgb = ([r, g, b]) => [r, g, b]
const alpha = ([, , , a]) => a
const inked = (pixel) => alpha(pixel) >= 128

/** The vertical extent of whatever tab this column passes through. */
function extentOf(x) {
  const rows = []
  for (let y = 0; y < icon.height; y++) if (inked(icon.at(x, y))) rows.push(y)
  ok(rows.length, `column ${x} passes through a tab`)
  return { top: rows.at(0), bottom: rows.at(-1) }
}

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
    [64, 125],
  ]) {
    equal(alpha(icon.at(x, y)), 0, `pixel ${x},${y} is transparent`)
  }
})

test('is a row of tabs sharing one baseline', () => {
  const left = extentOf(THROUGH_LEFT)
  const focused = extentOf(THROUGH_FOCUSED)
  const right = extentOf(THROUGH_RIGHT)

  equal(left.bottom, focused.bottom, 'left tab sits on the same baseline as the focused one')
  equal(right.bottom, focused.bottom, 'right tab sits on the same baseline as the focused one')
  equal(left.top, right.top, 'the two unfocused tabs are the same height')
})

test('the focused tab stands out from the ones beside it', () => {
  const focused = extentOf(THROUGH_FOCUSED)
  const neighbour = extentOf(THROUGH_LEFT)

  ok(
    neighbour.top - focused.top >= 2 * PIXEL_AT_24PX,
    'the lift has to survive 24 px, so it is worth more than a nudge',
  )
  deepEqual(rgb(icon.at(THROUGH_FOCUSED, ACROSS)), CLAY, 'the focused tab carries the accent')
  deepEqual(rgb(icon.at(THROUGH_LEFT, ACROSS)), SLATE, 'the tabs beside it recede')
  deepEqual(rgb(icon.at(THROUGH_RIGHT, ACROSS)), SLATE)
})

test('uses one hue and one accent, and nothing else', () => {
  const colours = new Set()
  for (let y = 0; y < icon.height; y++) {
    for (let x = 0; x < icon.width; x++) {
      const pixel = icon.at(x, y)
      if (alpha(pixel) > 0) colours.add(rgb(pixel).join(','))
    }
  }
  deepEqual([...colours].sort(), [CLAY.join(','), SLATE.join(',')].sort())
})

test('every tab and every gap survives a 24 px rendering', () => {
  // Cross the row: each tab, and each gap between them, has to be wider than a
  // single pixel of a 24 px rendering or the row collapses into one blob.
  const classify = (x) => {
    const pixel = icon.at(x, ACROSS)
    if (!inked(pixel)) return 'gap'
    return rgb(pixel).join(',') === CLAY.join(',') ? 'clay' : 'slate'
  }

  const runs = []
  for (let x = 0; x < icon.width; x++) {
    const kind = classify(x)
    if (runs.at(-1)?.kind === kind) runs.at(-1).width++
    else runs.push({ kind, width: 1 })
  }

  deepEqual(
    runs.map((run) => run.kind),
    ['gap', 'slate', 'gap', 'clay', 'gap', 'slate', 'gap'],
    'margin, tab, gap, focused tab, gap, tab, margin',
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
