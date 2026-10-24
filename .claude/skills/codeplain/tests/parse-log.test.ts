import { describe, expect, test } from 'claude-code/testing'

import { parseLog, parseSummary, stopProgress } from '../hooks/parse-log'

// Copied from a real codeplain 0.3.13 render of examples/hello-world.
const HELLO = `[00:00:00] INFO codeplain: Render started. Render ID: 0f414876-7721-42bf-ad7d-338e3e2efdeb
[00:00:00] INFO codeplain: -------------------------------------
           Module: hello_world
           Rendering functionality 1:
           - Running :App: with no arguments prints \`hello, world\` followed by a newline to standard output and exits with code 0.
           -------------------------------------
[00:00:04] INFO codeplain: Refactoring the generated code...
[00:00:05] INFO codeplain: ✓ Render of module hello_world completed successfully.
`

// Built from the messages codeplain 0.3.13's render machine logs, in the order
// its state machine reaches them.
const MID = `[00:00:00] INFO codeplain: Render started. Render ID: abc
[00:00:01] INFO codeplain: -------------------------------------
           Module: app
           Rendering functionality 1:
           - First.
           -------------------------------------
[00:00:09] INFO codeplain: -------------------------------------
           Module: app
           Rendering functionality 2, attempt number 2/3:
           - Second.
           -------------------------------------
[00:00:12] INFO codeplain: Running unit tests script test_scripts/run_unittests.sh. (attempt: 1)
[00:00:13] DEBUG codeplain: Unit Tests script output stored in: /tmp/unit.log
[00:00:13] INFO codeplain: ✓ All Unit Tests scripts have passed successfully.
[00:00:14] INFO codeplain: Refactoring the generated code...
[00:00:15] INFO codeplain: Running unit tests script test_scripts/run_unittests.sh. (attempt: 1)
[00:00:16] INFO codeplain: ↻ The Unit Tests script has failed. Initiating the patching mode to automatically correct the discrepancies.
[00:00:20] INFO codeplain: Implementing conformance tests...
[00:00:22] INFO codeplain: Running testing environment preparation script test_scripts/prep.sh for build folder plain_modules/app/code.
[00:00:25] INFO codeplain: Running conformance tests script test_scripts/run_conf.sh for app_1 (functionality 1 in module base).
[00:00:30] INFO codeplain: Running conformance tests attempt 3.
[00:00:30] INFO codeplain: Fixing conformance test for functionality 1 in module base.
[00:00:31] ERROR codeplain: Conformance test failed
           AssertionError: expected 0
[00:00:32] INFO codeplain: Specification ambiguity detected! Missing detail of the functionality 2.
[00:00:32] INFO codeplain: State the exit code.
`

describe('parseLog', () => {
  test('a finished one-functionality render', async () => {
    const p = parseLog(HELLO)

    expect(p.renderId).toBe('0f414876-7721-42bf-ad7d-338e3e2efdeb')
    expect(p.module).toBe('hello_world')
    expect(p.functionality).toBe('1')
    expect(p.spec?.startsWith('Running :App:')).toBe(true)
    expect(p.completed).toEqual(['hello_world 1'])
    expect(p.modulesCompleted).toEqual(['hello_world'])
    expect(p.items.implement.status).toBe('completed')
    expect(p.items.refactor.status).toBe('completed')
    expect(p.items.conformance.status).toBe('pending')
    expect(p.elapsed).toBe('00:00:05')
  })

  test('the phases of a render mid-conformance', async () => {
    const p = parseLog(MID)

    expect(p.functionality).toBe('2')
    expect(p.functionalityAttempt).toBe('2/3')
    expect(p.completed).toEqual(['app 1'])
    expect(p.items.implement.status).toBe('completed')
    expect(p.items.unit.status).toBe('completed')
    expect(p.items.refactor.status).toBe('completed')
    expect(p.items.conformance).toEqual({
      status: 'processing',
      substates: [{ text: 'Fixing conformance tests for functionality 1 of module base', depth: 0 }],
    })
    expect(p.conformanceAttempt).toBe(3)
    expect(p.scriptOutputs.unit).toBe('/tmp/unit.log')
    expect(p.lastError).toBe('Conformance test failed\nAssertionError: expected 0')
    expect(p.notices).toEqual([
      { kind: 'ambiguity', text: 'Specification ambiguity detected! Missing detail of the functionality 2.\nState the exit code.' },
    ])
  })

  test('unit tests failing during refactoring nest under it', async () => {
    const upTo = MID.slice(0, MID.indexOf('[00:00:20]'))
    const p = parseLog(upTo)

    expect(p.items.refactor.substates).toEqual([
      { text: 'Refactoring code', depth: 0 },
      { text: 'Fixing unit tests', depth: 1 },
    ])
  })

  test('a stopped render marks the running phase stopped', async () => {
    const p = stopProgress(parseLog(MID))

    expect(p.items.conformance.status).toBe('stopped')
    expect(p.items.implement.status).toBe('completed')
  })

  test('the failed render says where to resume', async () => {
    const p = parseLog(
      `${MID}[00:00:40] ERROR codeplain: Conformance tests could not be fixed.\n[00:00:40] INFO codeplain: To continue rendering from the last successfully rendered functionality, provide the --render-from 2 flag.\n`,
    )

    expect(p.resumeFrom).toBe('2')
  })

  test('an empty log', async () => {
    const p = parseLog('')

    expect(p.module).toBe(null)
    expect(p.log).toEqual([])
  })
})

describe('parseSummary', () => {
  test('a completed render', async () => {
    const s = parseSummary(
      '\n✓ rendering completed\n\n  render id:\t\t\tabc\n  input file:\t\t\thello_world.plain\n  generated code folder:\tplain_modules/hello_world/code\n\nfunctionalities  1  used credits  1  render time  00:00:05\n',
    )

    expect(s).toEqual({
      outcome: 'completed',
      codeFolder: 'plain_modules/hello_world/code',
      functionalities: 1,
      renderTime: '00:00:05',
      error: null,
    })
  })

  test('a canceled render with its error', async () => {
    const s = parseSummary(
      '\n— rendering canceled\n\n  generated code folder:\t-\n\nfunctionalities  0  used credits  0  render time  00:00:02\nKeyboard interrupt\n',
    )

    expect(s?.outcome).toBe('canceled')
    expect(s?.codeFolder).toBe(null)
    expect(s?.error).toBe('Keyboard interrupt')
  })
})
