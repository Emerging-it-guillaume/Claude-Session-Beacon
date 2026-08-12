import * as vscode from 'vscode'

import {
  resolveBeacon,
  type ActiveTab,
  type BeaconState,
  type IndeterminateReason,
  type SessionSummary,
} from './beacon.mts'
import { configDir } from './config-dir.mts'
import { processProbe } from './probe.mts'

/**
 * The VS Code adapter. It subscribes, flattens the editor into the seam's input,
 * and renders what comes back. It decides nothing: every question it could answer
 * — which tab counts, what to show, what to remember — is answered in `beacon.ts`,
 * which is the part under test.
 */

const SETTINGS = 'claudeSessionBeacon'

/**
 * The API renders the view type prefixed — `mainThreadWebview-claudeVSCodePanel` —
 * so this is a suffix test, never an equality. The constructor name is minified
 * (`"ag"`), which leaves `instanceof` as the only reliable half of the check.
 */
const SESSION_TAB_VIEW_TYPE = 'claudeVSCodePanel'

/** Two speech bubbles: what the item names is a conversation, not a signal. */
const ICON = '$(comment-discussion)'

/** *Session indéterminée*, in the English the interface is written in. */
const INDETERMINATE = 'Indeterminate session'

const WHY: Record<IndeterminateReason, string> = {
  'no-title': 'This session tab has no conversation title yet.',
  'ambiguous-title': 'Several sessions share the first 24 characters of this tab label.',
  'no-match': 'No live session of this window matches this tab label.',
}

/** What runs in this window, spelled out under whatever the status bar shows. */
function sessionsOfWindow(sessions: SessionSummary[]): string {
  if (sessions.length === 0) return 'No live session in this window.'

  const lines = sessions.map((s) => `• ${s.peerName} — pid ${s.pid} — ${s.cwd}`)
  return [`Sessions in this window (${sessions.length}):`, ...lines].join('\n')
}

/**
 * In a split editor only the active tab of the active group is followed: visible
 * tabs are several, and a status bar shows one name.
 */
function readActiveTab(): ActiveTab | null {
  const tab = vscode.window.tabGroups.activeTabGroup.activeTab
  if (!tab) return null

  const isClaudePanel =
    tab.input instanceof vscode.TabInputWebview &&
    tab.input.viewType.endsWith(SESSION_TAB_VIEW_TYPE)

  return { label: tab.label, isClaudePanel }
}

export function activate(context: vscode.ExtensionContext): void {
  /** The focus memory, in RAM only: a window reload kills the sessions it named. */
  let previous: BeaconState | null = null
  let item: vscode.StatusBarItem | undefined
  let shownAt: { alignment: vscode.StatusBarAlignment; priority: number } | undefined

  /**
   * The status bar is common ground: the item is created the first time this
   * window has something to say, and a window where no session tab is ever
   * focused never gets one.
   */
  const ensureStatusBarItem = (
    settings: vscode.WorkspaceConfiguration,
  ): vscode.StatusBarItem => {
    const alignment =
      settings.get<string>('statusBar.alignment') === 'right'
        ? vscode.StatusBarAlignment.Right
        : vscode.StatusBarAlignment.Left
    const priority = settings.get<number>('statusBar.priority') ?? 0

    // Neither alignment nor priority can be changed after creation, so moving the
    // item is replacing it.
    if (item && (shownAt?.alignment !== alignment || shownAt.priority !== priority)) {
      item.dispose()
      item = undefined
    }
    if (!item) {
      item = vscode.window.createStatusBarItem(alignment, priority)
      shownAt = { alignment, priority }
    }
    return item
  }

  const render = (): void => {
    const settings = vscode.workspace.getConfiguration(SETTINGS)

    // Silencing the extension takes the item off the status bar and stops the
    // resolving. It keeps the focus memory: nothing died, the display went quiet.
    if (settings.get<boolean>('enabled') === false) {
      item?.dispose()
      item = undefined
      return
    }

    const state = resolveBeacon({
      configDir: configDir(),
      // Raw on purpose: `realpath` and NFC normalisation touch the disk, so they
      // happen inside the seam, where nothing is read until a session tab is active.
      windowCwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null,
      activeTab: readActiveTab(),
      previous,
      probe: processProbe,
    })
    previous = state

    if (state.kind === 'hidden') {
      item?.hide()
      return
    }

    const shown = ensureStatusBarItem(settings)
    if (state.kind === 'peer') {
      // The name only. What sits behind it — the tooltip, the click that copies —
      // arrives with the join in #6, which is what first produces this state.
      shown.text = `${ICON} ${state.peerName}`
    } else {
      // What could not be identified is on the first line; what is running in this
      // window is on the ones below. Knowing what sits next door is worth reading
      // even — especially — when the tab in front of us cannot be named.
      shown.text = `${ICON} ${INDETERMINATE}`
      shown.tooltip = [
        `${INDETERMINATE} — ${WHY[state.reason]}`,
        '',
        sessionsOfWindow(state.candidates),
      ].join('\n')
    }
    shown.show()
  }

  context.subscriptions.push(
    vscode.window.tabGroups.onDidChangeTabs(() => render()),
    vscode.window.tabGroups.onDidChangeTabGroups(() => render()),
    // Coming back to a window re-resolves it. Nothing else does: no watcher, no
    // polling — a tab change and a window activation are the only two triggers.
    vscode.window.onDidChangeWindowState((windowState) => {
      if (windowState.focused) render()
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SETTINGS)) render()
    }),
    { dispose: () => item?.dispose() },
  )

  // The window is already open and a session tab may already be focused: resolve
  // now rather than waiting for a first tab change that may never come.
  render()
}
