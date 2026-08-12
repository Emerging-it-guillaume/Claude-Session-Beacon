import { deepEqual } from 'node:assert/strict'
import fs from 'node:fs'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

// Importing the seam from a plain Node process is the first assertion of this file:
// `vscode` only resolves inside the extension host, so a seam that reached for it —
// directly or through anything it imports — would fail to load here.
import { resolveBeacon, type BeaconInput, type BeaconState } from '../src/beacon.mts'

/** A fixture is a Claude configuration directory, read as `claude` itself would read it. */
const fixture = (name: string) => fileURLToPath(new URL(`fixtures/${name}/`, import.meta.url))

/**
 * The one injected port. Nothing calls it yet — no session is looked up until #4 —
 * and its `ancestors: () => null` is how Windows behaviour gets tested from anywhere.
 */
const probe: BeaconInput['probe'] = { isLiveClaude: () => false, ancestors: () => null }

const world = (over: Partial<BeaconInput> = {}): BeaconInput => ({
  configDir: fixture('no-sessions'),
  windowCwd: '/Users/dev/project',
  activeTab: null,
  previous: null,
  probe,
  ...over,
})

const sessionTab = (label: string) => ({ label, isClaudePanel: true })
const otherTab = (label: string) => ({ label, isClaudePanel: false })

test('a brand new session tab is indeterminate for want of a title', () => {
  // "Claude Code" is the literal label the Claude webview uses until a conversation
  // title exists. No join is attempted on it: it names no session.
  const state = resolveBeacon(world({ activeTab: sessionTab('Claude Code') }))

  deepEqual(state, { kind: 'indeterminate', reason: 'no-title', candidates: [] })
})

test('a titled session tab matches nothing until the registry is read', () => {
  // The registry lands in #4 and the join in #6. Until candidates are gathered, no
  // session can match the label — which is `no-match`, honestly, and the shape of
  // the answer will not change once the registry sits behind it.
  const state = resolveBeacon(world({ activeTab: sessionTab('Traiter le ticket sque…') }))

  deepEqual(state, { kind: 'indeterminate', reason: 'no-match', candidates: [] })
})

test('a window where no session tab has been focused shows nothing at all', () => {
  const state = resolveBeacon(world({ activeTab: otherTab('CONTEXT.md'), previous: null }))

  deepEqual(state, { kind: 'hidden' })
})

test('a window with no active tab shows nothing at all', () => {
  deepEqual(resolveBeacon(world({ activeTab: null })), { kind: 'hidden' })
})

test('looking at code does not lose the session that was focused', () => {
  // Focus memory. It travels in and out through the seam, so it is tested here
  // rather than left in the adapter, and it dies with the window: nothing persists it.
  const previous: BeaconState = { kind: 'indeterminate', reason: 'no-title', candidates: [] }

  deepEqual(resolveBeacon(world({ activeTab: otherTab('CONTEXT.md'), previous })), previous)
})

test('reads nothing off disk while no session tab is active', (t) => {
  // A window where no Claude work happens must cost nothing. Spying on every
  // function of `fs` — rather than on the ones we happen to call — keeps this true
  // however the reading is eventually written.
  type Spyable = Record<string, (...args: never[]) => unknown>

  const spies = ([fs, fs.promises] as unknown as Spyable[]).flatMap((module) =>
    Object.entries(module)
      // Operations only. The stream classes sit behind lazy getters that cannot be
      // spied on, and every way to reach one goes through `createReadStream`,
      // `open` or another lowercase function that is spied on here.
      .filter(([name, value]) => typeof value === 'function' && /^[a-z]/.test(name))
      .map(([name]) => [name, t.mock.method(module, name)] as const),
  )

  resolveBeacon(world({ activeTab: otherTab('CONTEXT.md') }))

  const touched = spies.filter(([, spy]) => spy.mock.callCount() > 0).map(([name]) => name)
  deepEqual(touched, [])
})
