import { deepEqual } from 'node:assert/strict'
import fs from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'
import { fileURLToPath } from 'node:url'

// Importing the seam from a plain Node process is the first assertion of this file:
// `vscode` only resolves inside the extension host, so a seam that reached for it —
// directly or through anything it imports — would fail to load here.
import {
  resolveBeacon,
  type BeaconInput,
  type BeaconState,
  type SessionSummary,
} from '../src/beacon.mts'

/** A fixture is a Claude configuration directory, read as `claude` itself would read it. */
const fixture = (name: string) => fileURLToPath(new URL(`fixtures/${name}/`, import.meta.url))

/**
 * The one injected port — the process table is the only thing no fixture can hold. A
 * pid it does not name is either dead or has been recycled by something that is not
 * `claude`; the seam cannot tell those apart, and does not need to. Its
 * `ancestors: () => null` is how Windows behaviour gets tested from anywhere.
 */
const liveClaude = (...pids: number[]): BeaconInput['probe'] => ({
  isLiveClaude: (pid) => pids.includes(pid),
  ancestors: () => null,
})

const world = (over: Partial<BeaconInput> = {}): BeaconInput => ({
  configDir: fixture('no-sessions'),
  windowCwd: '/Users/dev/project',
  activeTab: null,
  previous: null,
  probe: liveClaude(),
  ...over,
})

const sessionTab = (label: string) => ({ label, isClaudePanel: true })
const otherTab = (label: string) => ({ label, isClaudePanel: false })

/**
 * A session tab bearing some conversation title — which one does not matter to any
 * test below. Joining the label onto a title is the next ticket's work; what is under
 * test here is which sessions are gathered before anything is joined at all.
 */
const titledTab = () => sessionTab('Traiter le ticket sque…')

test('a brand new session tab is indeterminate for want of a title', () => {
  // "Claude Code" is the literal label the Claude webview uses until a conversation
  // title exists. No join is attempted on it: it names no session.
  const state = resolveBeacon(world({ activeTab: sessionTab('Claude Code') }))

  deepEqual(state, { kind: 'indeterminate', reason: 'no-title', candidates: [] })
})

test('a titled session tab matches nothing when nothing runs in this window', () => {
  // An empty registry is a legitimate state of the world, not a failure: Claude is
  // installed, no session of this window is alive, so no session can carry the label.
  const state = resolveBeacon(world({ activeTab: titledTab() }))

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

/**
 * Every `fs` function this call reaches, by name. Spying on the whole module — rather
 * than on the ones the implementation happens to use — is what keeps the two claims
 * below true however the reading is eventually written.
 */
const fsCallsDuring = (t: TestContext, run: () => void): string[] => {
  type Spyable = Record<string, (...args: never[]) => unknown>

  const spies = ([fs, fs.promises] as unknown as Spyable[]).flatMap((module) =>
    Object.entries(module)
      // Operations only. The stream classes sit behind lazy getters that cannot be
      // spied on, and every way to reach one goes through `createReadStream`,
      // `open` or another lowercase function that is spied on here.
      .filter(([name, value]) => typeof value === 'function' && /^[a-z]/.test(name))
      .map(([name]) => [name, t.mock.method(module, name)] as const),
  )

  // A named import of a builtin is bound once, when the module is linked: replacing
  // `fs.readFileSync` afterwards leaves `import { readFileSync }` pointing at the
  // original. Without this line the spies sit where nothing looks and both assertions
  // below pass whatever the code does — the failure mode a spy test exists to avoid.
  syncBuiltinESMExports()
  try {
    run()
    return spies.filter(([, spy]) => spy.mock.callCount() > 0).map(([name]) => name)
  } finally {
    // Undone here rather than by the test runner, which restores the module object
    // after the test — and would leave the bindings pointing at a spent spy.
    for (const [, spy] of spies) spy.mock.restore()
    syncBuiltinESMExports()
  }
}

test('reads nothing off disk while no session tab is active', (t) => {
  // A window where no Claude work happens must cost nothing.
  const touched = fsCallsDuring(t, () =>
    resolveBeacon(world({ activeTab: otherTab('CONTEXT.md') })),
  )

  deepEqual(touched, [])
})

test('never writes in the configuration directory', (t) => {
  // The first constraint of the data commitment, and the reason sessions fantômes are
  // left where they are even once established dead: the extension reads someone else's
  // state and never becomes responsible for it. Asserted as a whitelist of read
  // operations, so a write added later fails here whatever it is called.
  const readOnly = /^(access|exists|read|realpath|l?stat|opendir|createReadStream)/

  const touched = fsCallsDuring(t, () =>
    resolveBeacon(
      world({
        configDir: fixture('dead-sessions'),
        activeTab: titledTab(),
        probe: liveClaude(4201),
      }),
    ),
  )

  deepEqual(touched.filter((name) => !readOnly.test(name)), [])
})

const summary = (over: Partial<SessionSummary> & Pick<SessionSummary, 'peerName'>) => ({
  sessionId: '',
  pid: 0,
  cwd: '/Users/dev/project',
  // The conversation title is read off the transcript, which the join brings in: a
  // session known from the registry alone has a nom de pair and no title.
  title: null,
  ...over,
})

test('the sessions of this window are the live ones sharing its working directory', () => {
  // Both sessions of `/Users/dev/project` are candidates, including the one driven from
  // another window: two windows on one project share a `cwd`, and ADR-0002 keeps the
  // parent chain — a separate ticket — as what tells them apart. `4103` runs elsewhere
  // and is not of this window at all.
  const state = resolveBeacon(
    world({
      configDir: fixture('live-sessions'),
      windowCwd: '/Users/dev/project',
      activeTab: titledTab(),
      probe: liveClaude(4101, 4102, 4103),
    }),
  )

  deepEqual(state, {
    kind: 'indeterminate',
    reason: 'no-match',
    candidates: [
      summary({
        peerName: 'project-a1',
        sessionId: '6f1c0a7e-1b2d-4a3f-9c8e-0d5b7a2e4c11',
        pid: 4101,
      }),
      summary({
        peerName: 'project-7c',
        sessionId: 'b4e9d2a1-77c3-4e58-8b0a-2f6d1c9e3a72',
        pid: 4102,
      }),
    ],
  })
})

test('a second window on that project sees exactly the same sessions', () => {
  // The other of the two windows, and there is nothing in the `cwd` to tell them
  // apart — ADR-0002: «Le `cwd` seul ne discrimine pas deux fenêtres ouvertes sur le
  // même projet». Each of them is shown both sessions, which is honest, and the
  // parent chain is what will narrow it. The trailing separator is not decoration:
  // a working directory reaches us as the editor spells it, not as the registry did.
  const [first, second] = ['/Users/dev/project', '/Users/dev/project/'].map((windowCwd) =>
    resolveBeacon(
      world({
        configDir: fixture('live-sessions'),
        windowCwd,
        activeTab: titledTab(),
        probe: liveClaude(4101, 4102, 4103),
      }),
    ),
  )

  deepEqual(second, first)
  deepEqual(
    second?.kind === 'indeterminate' ? second.candidates.map((s) => s.pid) : [],
    [4101, 4102],
  )
})

test('a window on another project sees its own session and no other', () => {
  const state = resolveBeacon(
    world({
      configDir: fixture('live-sessions'),
      windowCwd: '/Users/dev/other',
      activeTab: titledTab(),
      probe: liveClaude(4101, 4102, 4103),
    }),
  )

  deepEqual(state, {
    kind: 'indeterminate',
    reason: 'no-match',
    candidates: [
      summary({
        peerName: 'other-2f',
        sessionId: '0a3f5c81-9d24-4b17-a6e2-5c8b1f0d7e34',
        pid: 4103,
        cwd: '/Users/dev/other',
      }),
    ],
  })
})

test('a brand new session tab still carries the sessions of its window', () => {
  // No title, so no join — but the window's sessions are known all the same, and that
  // is what the tooltip shows while the tab has nothing to be identified by.
  const state = resolveBeacon(
    world({
      configDir: fixture('live-sessions'),
      activeTab: sessionTab('Claude Code'),
      probe: liveClaude(4101, 4102),
    }),
  )

  deepEqual(state, {
    kind: 'indeterminate',
    reason: 'no-title',
    candidates: [
      summary({
        peerName: 'project-a1',
        sessionId: '6f1c0a7e-1b2d-4a3f-9c8e-0d5b7a2e4c11',
        pid: 4101,
      }),
      summary({
        peerName: 'project-7c',
        sessionId: 'b4e9d2a1-77c3-4e58-8b0a-2f6d1c9e3a72',
        pid: 4102,
      }),
    ],
  })
})

test('a session fantôme, and a pid recycled by something else, are not sessions', () => {
  // `4202` crashed without cleaning up its entry; `4203`'s pid was handed to an
  // unrelated program. Both are entries of the registry and neither is a session — the
  // probe is what separates them from `4201`, by identity and not by existence alone.
  const state = resolveBeacon(
    world({
      configDir: fixture('dead-sessions'),
      activeTab: titledTab(),
      probe: liveClaude(4201),
    }),
  )

  deepEqual(state, {
    kind: 'indeterminate',
    reason: 'no-match',
    candidates: [
      summary({
        peerName: 'project-live-5b',
        sessionId: '3c7a1e60-4d92-4f18-b5c3-8e0a2d6f9b41',
        pid: 4201,
      }),
    ],
  })
})

test('the registry is read where the configuration directory points', () => {
  // `CLAUDE_CONFIG_DIR` moved: the nom de pair below exists in this fixture and in no
  // other, so reading it proves this registry was read and not a default one.
  const state = resolveBeacon(
    world({
      configDir: fixture('moved-config'),
      activeTab: titledTab(),
      probe: liveClaude(4301),
    }),
  )

  deepEqual(state, {
    kind: 'indeterminate',
    reason: 'no-match',
    candidates: [
      summary({
        peerName: 'project-moved-3e',
        sessionId: 'c1f7b489-05e3-4d26-9a71-6b2c8e0f5d34',
        pid: 4301,
      }),
    ],
  })
})

test('no configuration directory at all shows nothing, and says nothing', () => {
  // Claude Code is not installed here. A status bar is common ground: an extension
  // with nothing to say takes no room in it, and reports no error for the absence.
  const state = resolveBeacon(
    world({
      configDir: fixture('claude-was-never-installed'),
      activeTab: titledTab(),
    }),
  )

  deepEqual(state, { kind: 'hidden' })
})

test('a window with no folder open has no session of its own', () => {
  const state = resolveBeacon(
    world({
      configDir: fixture('live-sessions'),
      windowCwd: null,
      activeTab: titledTab(),
      probe: liveClaude(4101, 4102, 4103),
    }),
  )

  deepEqual(state, { kind: 'indeterminate', reason: 'no-match', candidates: [] })
})

test('a working directory reached through a symlink is the same directory', (t) => {
  // The one scenario no committed fixture can hold: a registry records absolute paths,
  // and a symlink has to exist on the machine running the test to be resolved at all.
  // The filesystem stays real — it is built here rather than checked in.
  const root = fs.mkdtempSync(join(tmpdir(), 'beacon-symlink-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))

  const project = join(root, 'project')
  const throughLink = join(root, 'shortcut')
  fs.mkdirSync(project)
  fs.symlinkSync(project, throughLink)
  fs.mkdirSync(join(root, 'config', 'sessions'), { recursive: true })
  fs.writeFileSync(
    join(root, 'config', 'sessions', '4501.json'),
    JSON.stringify({
      pid: 4501,
      sessionId: 'd90a5c27-3e14-4b68-8f52-0c7a6d1e9b30',
      cwd: project,
      startedAt: 1786456800000,
      procStart: 'Tue Aug 11 14:00:00 2026',
      version: '2.1.228',
      peerProtocol: 1,
      kind: 'interactive',
      entrypoint: 'claude-vscode',
      name: 'project-link-8a',
      nameSource: 'derived',
    }),
  )

  const state = resolveBeacon(
    world({
      configDir: join(root, 'config'),
      windowCwd: throughLink,
      activeTab: titledTab(),
      probe: liveClaude(4501),
    }),
  )

  deepEqual(state, {
    kind: 'indeterminate',
    reason: 'no-match',
    candidates: [
      summary({
        peerName: 'project-link-8a',
        sessionId: 'd90a5c27-3e14-4b68-8f52-0c7a6d1e9b30',
        pid: 4501,
        cwd: project,
      }),
    ],
  })
})

test('a working directory whose accents are decomposed is the same directory', () => {
  // The registry holds `projet-café` in NFD, VS Code hands it over in NFC: one path on
  // disk, two byte sequences, and macOS produces the divergence on its own. Both are
  // spelled out in escapes here — the difference is invisible in an editor, which is
  // exactly what makes it a bug worth a test.
  const composed = '/Users/dev/projet-caf\u00e9'
  const decomposed = '/Users/dev/projet-cafe\u0301'

  const state = resolveBeacon(
    world({
      configDir: fixture('decomposed-path'),
      windowCwd: composed,
      activeTab: titledTab(),
      probe: liveClaude(4401),
    }),
  )

  deepEqual(state, {
    kind: 'indeterminate',
    reason: 'no-match',
    candidates: [
      summary({
        peerName: 'projet-cafe-6d',
        sessionId: '7b0e3d15-8f42-4c69-b3a0-1d6e2c4f8a57',
        pid: 4401,
        cwd: decomposed,
      }),
    ],
  })
})
