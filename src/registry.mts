import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { join, normalize, sep } from 'node:path'

import type { ProcessProbe, SessionSummary } from './beacon.mts'

/**
 * The registry — `<configDir>/sessions/<pid>.json`, one file per live session, written
 * at start-up and removed on a clean exit. Read-only, always: this is another program's
 * state, and the entries left behind by a crash are left exactly where they are.
 *
 * This is not a seam. It is decomposition behind `resolveBeacon`, which is the only
 * thing the tests know about — the shape of what is read can change here without a
 * single test being rewritten.
 */

/** `<pid>.json`, and nothing else: the directory also holds key files. */
const ENTRY_FILE = /^\d+\.json$/

/** The fields of a registry entry this extension has any use for. */
type RegistryEntry = {
  pid: number
  sessionId: string
  cwd: string
  /** The nom de pair — the address of the session in inter-session exchanges. */
  name: string
}

/**
 * The sessions of this window: the live ones whose `cwd` is the window's working
 * directory. `null` says there is no Claude configuration directory at all — nothing
 * is installed, nothing will ever be there to show, and that is not an error.
 */
export function windowSessions(input: {
  configDir: string
  windowCwd: string | null
  probe: ProcessProbe
}): SessionSummary[] | null {
  const { configDir, windowCwd, probe } = input

  if (!existsSync(configDir)) return null
  if (windowCwd === null) return []

  const window = canonical(windowCwd)

  return readEntries(join(configDir, 'sessions'))
    .filter((entry) => canonical(entry.cwd) === window)
    // Liveness last: the probe is the one thing that costs something, and by here it
    // is asked only about the handful of entries that are of this window at all.
    .filter((entry) => probe.isLiveClaude(entry.pid))
    .sort((a, b) => a.pid - b.pid)
    .map((entry) => ({
      peerName: entry.name,
      sessionId: entry.sessionId,
      pid: entry.pid,
      // As recorded, not as resolved: the tooltip shows the session's own account of
      // where it runs. The canonical form exists to compare, not to display.
      cwd: entry.cwd,
      // The conversation title lives in the transcript; the join is what reads it.
      title: null,
    }))
}

/**
 * Two paths naming one directory have to compare equal: a symlinked project and its
 * target, and the same accented name in NFC and in NFD — macOS hands out both. A path
 * that no longer exists cannot be resolved, and compares as it was written.
 */
function canonical(dir: string): string {
  const written = normalize(dir).replace(/[/\\]+$/, '') || sep
  let resolved: string
  try {
    resolved = realpathSync(written)
  } catch {
    resolved = written
  }

  // Windows paths differ in case and name the same directory — VS Code is fond of a
  // lowercase drive letter where the session recorded an uppercase one. Folding case
  // anywhere else would merge two directories that really are distinct, and merging
  // them is how a nom de pair ends up naming the wrong session.
  const cased = process.platform === 'win32' ? resolved.toLowerCase() : resolved
  return cased.normalize('NFC')
}

function readEntries(sessionsDir: string): RegistryEntry[] {
  let files: string[]
  try {
    files = readdirSync(sessionsDir)
  } catch {
    // Claude is installed but has never written a session, or the directory went away
    // between this line and the last. Either way: no session runs in this window.
    return []
  }

  return files
    .filter((file) => ENTRY_FILE.test(file))
    .map((file) => readEntry(join(sessionsDir, file)))
    .filter((parsed): parsed is RegistryEntry => parsed !== null)
}

/**
 * An entry we cannot read is an entry we do not have — a file being written as we read
 * it, or a record whose shape moved under us. Skipping it costs one candidate; trusting
 * it would risk a name, and a name shown wrongly is the one failure that matters here.
 */
function readEntry(path: string): RegistryEntry | null {
  let record: unknown
  try {
    record = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }

  if (typeof record !== 'object' || record === null) return null
  const { pid, sessionId, cwd, name } = record as Record<keyof RegistryEntry, unknown>

  if (typeof pid !== 'number' || !Number.isInteger(pid)) return null
  if (typeof sessionId !== 'string' || sessionId === '') return null
  if (typeof cwd !== 'string' || cwd === '') return null
  if (typeof name !== 'string' || name === '') return null

  return { pid, sessionId, cwd, name }
}
