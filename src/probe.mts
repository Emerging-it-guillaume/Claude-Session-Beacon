import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'

import type { ProcessProbe } from './beacon.mts'

/**
 * The process table, which is the one thing no fixture can hold — hence the injection.
 * This module is what gets injected in production; the tests hand the seam their own.
 */

/** The name the Claude Code binary runs under, whatever path it was started from. */
const CLAUDE = 'claude'

/**
 * Which of the two checks liveness rests on here. On macOS and Linux the process is
 * identified, so a pid recycled by an unrelated program is rejected. On Windows only
 * existence is checked: identifying a process there means starting a PowerShell, and
 * paying that at every tab change contradicts the decision to read nothing until an
 * event demands it. The difference is reported by the diagnosis rather than hidden —
 * "this session is dead" and "this session may be dead" are different answers.
 */
export const LIVENESS_CHECK: 'process-identity' | 'existence-only' =
  process.platform === 'win32' ? 'existence-only' : 'process-identity'

export const processProbe: ProcessProbe = {
  isLiveClaude(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) return false
    return LIVENESS_CHECK === 'existence-only' ? exists(pid) : runsClaude(pid)
  },

  /**
   * The parent chain, which separates two windows open on one project, lands in its
   * own ticket. `null` is not a stopgap: it is the answer on Windows, and the seam
   * falls back to the `cwd` alone — the socle of ADR-0002.
   */
  ancestors: () => null,
}

/** Existence alone. A pid we may not signal is a pid that is nonetheless there. */
function exists(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * Existence *and* identity. `ps` prints the command of a live pid and exits non-zero
 * for a pid that names nothing — on macOS the full path of the executable, on Linux
 * its name, which is why the comparison is on the basename.
 *
 * The check is strict on purpose: a process this cannot recognise as `claude` costs
 * one candidate and shows *session indéterminée*, where a loose one would eventually
 * put someone else's name in the status bar. Only one of those failures is silent.
 */
function runsClaude(pid: number): boolean {
  let command: string
  try {
    command = execFileSync('ps', ['-o', 'comm=', '-p', String(pid)], {
      encoding: 'utf8',
      timeout: 2000,
      windowsHide: true,
      // Its complaints about a pid it dislikes are an answer, not an incident: they
      // belong nowhere near the user's output.
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return false
  }

  return basename(command.trim()) === CLAUDE
}
