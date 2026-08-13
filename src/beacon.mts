/**
 * The seam — the single point where the display is decided, and what the tests know.
 * It never imports `vscode`, so it can be exercised from a plain Node process against
 * a fixture directory; the adapter flattens the editor down to `activeTab` and hands
 * the answer back to the status bar without adding a rule of its own.
 *
 * What sits behind it — the registry, the process probe — is decomposition, not more
 * seams: those modules can be cut differently tomorrow without a test being rewritten.
 */

import { windowSessions } from './registry.mts'

/** What the Claude webview labels a session tab that has no conversation title yet. */
export const UNTITLED_TAB_LABEL = 'Claude Code'

/** A session of this window, as the tooltip and the diagnosis want to show it. */
export type SessionSummary = {
  peerName: string
  sessionId: string
  pid: number
  cwd: string
  /** The conversation title joined on — `null` for a session that has none yet. */
  title: string | null
}

export type ActiveTab = {
  /**
   * `tab.label`. Not the conversation title but its truncation: the title itself up
   * to 25 characters, its first 24 followed by `…` beyond that, `"Claude Code"` when
   * there is no title at all. The truncation is the Claude webview's, not VS Code's.
   */
  label: string
  isClaudePanel: boolean
}

/** The one injected port: the process table is the only thing no fixture can hold. */
export type ProcessProbe = {
  /** Liveness *and* identity — a ghost session's pid can have been recycled. */
  isLiveClaude(pid: number): boolean
  /** `null` where the parent chain is not cheap to walk (Windows): cwd alone, then. */
  ancestors(pid: number): number[] | null
}

export type IndeterminateReason = 'no-title' | 'ambiguous-title' | 'no-match'

export type BeaconState =
  | {
      kind: 'peer'
      peerName: string
      sessionId: string
      pid: number
      cwd: string
      siblings: SessionSummary[]
    }
  | { kind: 'indeterminate'; reason: IndeterminateReason; candidates: SessionSummary[] }
  | { kind: 'hidden' }

export type BeaconInput = {
  /** `CLAUDE_CONFIG_DIR ?? ~/.claude` — a fixture root under test. */
  configDir: string
  /** The working directory of the window, `null` when it has no folder open. */
  windowCwd: string | null
  activeTab: ActiveTab | null
  /** The previous state, which is where the focus memory lives. */
  previous: BeaconState | null
  probe: ProcessProbe
}

export function resolveBeacon(input: BeaconInput): BeaconState {
  const { activeTab, previous } = input

  // Editing a file is not looking away from a session. Keeping the previous state
  // here, rather than in the adapter, keeps the memory testable — and keeps it in
  // RAM, where a window reload destroys it along with the sessions it named.
  if (!activeTab?.isClaudePanel) return previous ?? { kind: 'hidden' }

  // The first disk read of the extension, and it happens here and nowhere earlier: a
  // window where no session tab is ever focused costs nothing at all.
  const candidates = windowSessions({
    configDir: input.configDir,
    windowCwd: input.windowCwd,
    probe: input.probe,
  })

  // No configuration directory: Claude Code is not installed on this side. A status
  // bar is common ground — say nothing, and report nothing to a user who never asked.
  if (candidates === null) return { kind: 'hidden' }

  // A tab carrying the untitled label names no session, so no join is attempted on it.
  // The sessions of the window are known all the same, and the tooltip shows them.
  if (activeTab.label === UNTITLED_TAB_LABEL) {
    return { kind: 'indeterminate', reason: 'no-title', candidates }
  }

  // The join on the conversation title lands in #6. Until the transcripts are read,
  // no candidate can be shown to carry this label — which is what `no-match` says.
  return { kind: 'indeterminate', reason: 'no-match', candidates }
}
