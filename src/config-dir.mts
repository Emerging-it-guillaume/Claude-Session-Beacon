import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * Where the Claude configuration directory is. This is the binary's own rule,
 * duplicated verbatim so that both look in the same place — and this extension
 * contributes no setting of its own: a third source of truth would drift from the
 * other two, and the only symptom would be a permanent, unexplainable *session
 * indéterminée*.
 *
 * It sits here rather than in the VS Code adapter because it is a rule, and the
 * adapter holds none — it subscribes, calls, and renders.
 *
 * The extension host inherits the environment of whatever launched VS Code, not that
 * of an interactive shell: a `CLAUDE_CONFIG_DIR` exported from a profile file is seen
 * by a `claude` started in a terminal and not by this. That divergence is for the
 * diagnosis to report; it is not for this function to guess at.
 */
export function configDir(): string {
  const configured = process.env.CLAUDE_CONFIG_DIR
  return (configured ? configured : join(homedir(), '.claude')).normalize('NFC')
}
