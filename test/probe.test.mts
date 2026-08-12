import { ok } from 'node:assert/strict'
import { test } from 'node:test'

import { LIVENESS_CHECK, processProbe } from '../src/probe.mts'

/**
 * The seam's tests hand it their own probe, which is the point of injecting it — but
 * then nothing would ever exercise the real one, and the check it performs is the whole
 * defence against a recycled pid. These two run against this very process: a live pid
 * that is emphatically not `claude`, which is the shape of the failure being guarded.
 */

test('an entry whose process is gone is not a live session', () => {
  // `process.pid + 1` may well be taken; a pid past the platform maximum is not.
  ok(!processProbe.isLiveClaude(0))
  ok(!processProbe.isLiveClaude(-1))
  ok(!processProbe.isLiveClaude(2 ** 31))
})

test('a live process that is not claude is not a live session', { skip: onWindows() }, () => {
  // This test process exists, and answering "alive" for it would be answering for a
  // recycled pid too. Windows is skipped because it checks existence only, on purpose.
  ok(!processProbe.isLiveClaude(process.pid))
})

function onWindows(): string | false {
  return LIVENESS_CHECK === 'existence-only' ? 'existence alone is the check here' : false
}
