import { equal } from 'node:assert/strict'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { test, type TestContext } from 'node:test'

import { configDir } from '../src/config-dir.mts'

/**
 * The rule the binary applies, and the only place the extension is allowed to decide
 * where to look. Read off the real environment — there is nothing to inject here, and
 * inventing a port for it would be inventing the second source of truth this avoids.
 */
const withEnv = (t: TestContext, value: string | undefined): void => {
  const before = process.env.CLAUDE_CONFIG_DIR
  t.after(() => {
    if (before === undefined) delete process.env.CLAUDE_CONFIG_DIR
    else process.env.CLAUDE_CONFIG_DIR = before
  })

  if (value === undefined) delete process.env.CLAUDE_CONFIG_DIR
  else process.env.CLAUDE_CONFIG_DIR = value
}

test('looks where CLAUDE_CONFIG_DIR says, when it is set', (t) => {
  withEnv(t, '/Volumes/work/claude-config')

  equal(configDir(), '/Volumes/work/claude-config')
})

test('looks in ~/.claude when it is not', (t) => {
  withEnv(t, undefined)

  equal(configDir(), join(homedir(), '.claude'))
})

test('an empty CLAUDE_CONFIG_DIR is not a configuration directory', (t) => {
  // Exported and never given a value: the binary reads that as unset, so do we.
  withEnv(t, '')

  equal(configDir(), join(homedir(), '.claude'))
})

test('is normalised to NFC, whatever the environment holds', (t) => {
  // The same accented path arrives decomposed from one place and composed from
  // another; comparing it against a session's `cwd` needs one spelling of the two.
  withEnv(t, '/Volumes/work/projet-cafe\u0301')

  equal(configDir(), '/Volumes/work/projet-caf\u00e9')
})
