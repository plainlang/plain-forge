import { expect, test } from 'claude-code/testing'

import { parseLog } from '../hooks/parse-log'

const PANE = {
  plugin: 'codeplain',
  component: 'Pane',
  requestId: 'codeplain',
  props: {
    title: 'codeplain',
    isFocused: false,
    bodyColumns: 100,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const RUN = {
  tag: 'AbC123',
  file: 'app.plain',
  topModule: 'app',
  logPath: '/tmp/codeplain.log',
  runDir: '/tmp/run',
  pid: '1',
  version: '0.3.13',
  scripts: { unit: true, conformance: true, env: false },
  status: 'running',
  exitCode: null,
  isStopRequested: false,
}

const LOG = `[00:00:00] INFO codeplain: Render started. Render ID: abc
[00:00:01] INFO codeplain: -------------------------------------
           Module: app
           Rendering functionality 1:
           - Prints a greeting.
           -------------------------------------
[00:00:05] INFO codeplain: Refactoring the generated code...
[00:00:06] INFO codeplain: Running unit tests script t.sh. (attempt: 1)
[00:00:07] INFO codeplain: ↻ The Unit Tests script has failed. Initiating the patching mode to automatically correct the discrepancies.
`

const SEED: Record<string, unknown> = {
  run: { shape: 'run-2', value: RUN },
  progress: { shape: 'progress-2', value: parseLog(LOG) },
  summary: { shape: 'summary-1', value: null },
}

for (const isLogs of [false, true]) {
  test(`the pane draws a running render on the terminal (${isLogs ? 'logs' : 'dashboard'})`, async ($, on) => {
    const seed = { ...SEED, view: { shape: 'view-1', value: { isLogs, isExpanded: false, level: 'INFO' } } }
    on('state.get', (_, e) => {
      return { value: { value: seed[(e as { key: string }).key], version: 1 } }
    })

    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

    if (isLogs) {
      expect((await ui.find({ type: 'Text', text: /patching mode/ }))?.text).toContain('↻ The Unit Tests script')
    } else {
      expect((await ui.find({ type: 'Text', text: /Fixing unit tests/ }))?.text).toContain('Fixing unit tests')
      expect((await ui.find({ type: 'Text', text: /Rendering in progress/ }))?.text).toBe('Rendering in progress...')
    }
    expect(await ui.find({ type: 'Button', key: 'stop' })).toBeTruthy()
    await ui.unmount()
  })
}

test('a finished run\'s /regenerate row shows codeplain\'s exit summary', async ($, on) => {
  const text =
    '✗ rendering failed\n\n  render id:\t\t\tabc\n  input file:\t\t\tapp.plain\n  generated code folder:\t-\n\nfunctionalities  0  used credits  0  render time  0s\nKeyboard interrupt'
  on('state.get', () => ({
    value: { value: { shape: 'finished-1', value: [{ tag: 'AbC123', file: 'app.plain', status: 'stopped', text }] }, version: 1 },
  }))

  const ui = await $.ui.mount({
    plugin: 'codeplain',
    component: 'CommandOutput',
    surface: 'terminal',
    props: { command: 'regenerate', args: 'app.plain', text: 'Regenerating app.plain · run AbC123', isErrored: false },
  })

  expect((await ui.find({ type: 'Text', text: /rendering failed/ }))?.text).toBe('✗ rendering failed')
  expect((await ui.find({ type: 'Text', text: /render time/ }))?.text).toContain('render time 0s')
  expect((await ui.find({ type: 'Text', text: /Keyboard interrupt/ }))?.text).toBe('Keyboard interrupt')
  await ui.unmount()
})
