import { deepEqual, equal, match, ok } from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import { test } from 'node:test'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')

const manifest = JSON.parse(await read('package.json'))
const readme = await read('README.md')
const licence = await read('LICENSE')

/**
 * A name starting with "Claude" reads as official on the Marketplace. This exact
 * sentence is the parade, and it has to open both the description and the README.
 */
const UNOFFICIAL = 'Unofficial extension. Not affiliated with or endorsed by Anthropic.'

test('names the extension the way the Marketplace will show it', () => {
  equal(manifest.name, 'claude-session-beacon')
  equal(manifest.displayName, 'Claude Session Beacon')

  // `publisher` is absent on purpose. The account does not exist yet, and the name it
  // takes becomes the permanent prefix of the extension identifier — the one
  // irreversible choice in the chain. Packaging is what will force it; this assertion
  // fails on the day someone adds one, which is the day to think about it.
  equal(manifest.publisher, undefined)
})

test('the description opens with the unofficial notice', () => {
  ok(
    manifest.description.startsWith(UNOFFICIAL),
    `package.json description must open with "${UNOFFICIAL}"`,
  )
})

test('the README opens with the description, verbatim', () => {
  // The same sentence has to reach the Marketplace, the GitHub repository
  // description and the README. Two wordings would read as two products.
  const lead = readme.split(/^## /m)[0]
  ok(lead.includes(manifest.description), 'README lead must carry the description verbatim')

  const paragraphs = lead.split('\n\n').map((p) => p.trim())
  const first = paragraphs.find((p) => p && !p.startsWith('<') && !p.startsWith('#'))
  ok(first.startsWith(UNOFFICIAL), 'the first prose of the README is the unofficial notice')
})

test('carries the data commitment as five checkable constraints', () => {
  const section = readme.split(/^## Data commitment$/m)[1]
  ok(section, 'README has a "Data commitment" section')

  const constraints = section
    .split(/^## /m)[0]
    .split('\n')
    .filter((line) => /^\d+\. /.test(line))

  const expected = [
    /read-only/i,
    /`ai-title`/,
    /end of the (file|transcript)/i,
    /zero runtime dependencies/i,
    /no network/i,
  ]
  equal(constraints.length, expected.length, 'five constraints, no more and no less')
  expected.forEach((pattern, i) => match(constraints[i], pattern))

  match(constraints[0], /never writes/i, 'read-only spells out that nothing is written')
})

test('the zero-dependency constraint is true of the manifest itself', () => {
  deepEqual(manifest.dependencies ?? {}, {}, 'no runtime dependencies')
})

test('is MIT, in the licence file and in the manifest', () => {
  equal(manifest.license, 'MIT')
  match(licence, /^MIT License/)
  ok(readme.includes('MIT'))
})

test('declares the logo', async () => {
  equal(manifest.icon, 'images/icon.png')
  await access(new URL(`../${manifest.icon}`, import.meta.url))
})

test('is discoverable and points back at the source', () => {
  ok(manifest.keywords?.length, 'keywords for Marketplace search')
  equal(manifest.repository?.url, 'https://github.com/Emerging-it-guillaume/Claude-Session-Beacon.git')
})
