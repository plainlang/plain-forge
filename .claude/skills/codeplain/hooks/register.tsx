import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Item, ItemKey, LogLevel, Progress, Run, Scripts, Summary, View } from '../types'

import { parseLog, parseSummary, stopProgress } from './parse-log'

const PANE = 'codeplain'
const POLL_MS = 1000
// Past this the log is tailed instead of read whole ($.fs.read stops at 4 MiB).
const READ_LIMIT = 3_500_000

const run = atom({ plugin: 'codeplain', key: 'run' } as const, null, { shape: 'run-2' })
const progress = atom({ plugin: 'codeplain', key: 'progress' } as const, null, { shape: 'progress-2' })
const summary = atom({ plugin: 'codeplain', key: 'summary' } as const, null, { shape: 'summary-1' })
const view = atom(
  { plugin: 'codeplain', key: 'view' } as const,
  { isLogs: false, isExpanded: false, level: 'INFO' as LogLevel },
  { shape: 'view-1' },
)

// Starts codeplain detached, so a reload of this mod does not kill the render.
// `set -m` keeps SIGINT live for the background job (a non-interactive shell
// ignores it there, and Python then never raises KeyboardInterrupt), and `exec`
// makes the recorded pid codeplain's own, so Stop reaches it.
// Prints the run folder (pid, exit code and stdout land there), the log path
// and codeplain's version.
const LAUNCH = `
f="$1"; shift
dir=$(cd "$(dirname "$f")" && pwd) || exit 1
log="$dir/codeplain.log"
rm -f "$log"
runDir=$(mktemp -d "\${TMPDIR:-/tmp}/codeplain-mod.XXXXXX") || exit 1
cat > "$runDir/run.sh" <<'EOS'
d="$1"; shift
sh -c 'echo $$ > "$0/pid"; exec codeplain "$@"' "$d" "$@"
echo $? > "$d/exit"
EOS
set -m
nohup sh "$runDir/run.sh" "$runDir" "$f" --headless --log-file-name "$log" "$@" </dev/null >"$runDir/out" 2>&1 &
i=0; while [ ! -s "$runDir/pid" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i+1)); done
printf '%s\\n%s\\n%s\\n' "$runDir" "$log" "$(codeplain --version 2>/dev/null | sed 's/^codeplain version //' | head -1)"
`

const LEVELS: LogLevel[] = ['DEBUG', 'INFO', 'WARNING', 'ERROR']
const ITEM_ROWS: { key: ItemKey; label: string; script: keyof Scripts | null }[] = [
  { key: 'implement', label: 'Implementing the functionality', script: null },
  { key: 'unit', label: 'Unit tests', script: 'unit' },
  { key: 'refactor', label: 'Refactoring', script: null },
  { key: 'conformance', label: 'Conformance tests', script: 'conformance' },
]

let isPolling = false
let lastSize = -1
let lastWritten = ''

async function readLog($: EngineInterface, path: string): Promise<string | null> {
  const stat = await $.fs.stat(path).catch(() => null)
  if (!stat) return ''
  if (stat.size === lastSize) return null
  lastSize = stat.size
  if (stat.size <= READ_LIMIT) return $.fs.read(path).catch(() => '')
  const { stdout } = await $.process.run(['tail', '-c', '1000000', path])

  return stdout
}

// Which test scripts the render uses, as the TUI decides which rows to show:
// from the flags, else from config.yaml beside the module or in the cwd.
async function readScripts($: EngineInterface, root: string, file: string, extra: string[]): Promise<Scripts> {
  const flag = (name: string) => extra.includes(`--${name}`) || extra.some(a => a.startsWith(`--${name}=`))
  const nameAt = extra.indexOf('--config-name')
  const config = (nameAt >= 0 ? extra[nameAt + 1] : undefined) ?? 'config.yaml'
  const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '.'
  let text = ''
  for (const path of [`${dir}/${config}`, config].map(path => (path.startsWith('/') ? path : `${root}/${path}`))) {
    text = await $.fs.read(path).catch(() => '')
    if (text) break
  }
  const has = (key: string) => flag(key) || new RegExp(`^${key}:\\s*\\S`, 'm').test(text)

  return {
    unit: has('unittests-script'),
    conformance: has('conformance-tests-script'),
    env: has('prepare-environment-script'),
  }
}

function statusText(r: Run, p: Progress | null): string {
  if (r.status !== 'running') {
    const mark = r.status === 'succeeded' ? '✓' : r.status === 'stopped' ? '■' : '✗'
    return `codeplain ${mark} ${r.file}`
  }
  if (!p?.functionality) return `codeplain · ${r.file} · starting`
  const row = ITEM_ROWS.find(row => p.items[row.key].status === 'processing')
  const attempt = row?.key === 'conformance' ? p.conformanceAttempt : row?.key === 'unit' ? p.unitAttempt : null

  return `codeplain · ${p.module} f${p.functionality} · ${row?.label.toLowerCase() ?? 'working'}${attempt && attempt > 1 ? ` #${attempt}` : ''}`
}

async function tick($: EngineInterface, r: Run, count: number): Promise<Run> {
  const text = await readLog($, r.logPath)
  let p = await read($, progress)
  if (text !== null) {
    const parsed = parseLog(text)
    const written = JSON.stringify(parsed)
    if (written !== lastWritten) {
      lastWritten = written
      const known = p?.notices.length ?? 0
      for (const notice of parsed.notices.slice(known)) {
        if (notice.kind === 'ambiguity' || notice.kind === 'conflict') $.ui.toast(`codeplain: ${notice.text.split('\n')[0]}`)
      }
      p = parsed
      await update($, progress, () => parsed)
    }
  }

  let next: Run = r
  const exit = await $.fs.read(`${r.runDir}/exit`).catch(() => null)
  if (exit !== null) {
    const code = Number(exit.trim())
    next = {
      ...r,
      exitCode: code,
      status: r.isStopRequested ? 'stopped' : code === 0 ? 'succeeded' : 'failed',
    }
  } else if (count % 5 === 4) {
    const alive = await $.process.run(['kill', '-0', r.pid]).catch(() => null)
    if (alive?.exitCode !== 0) next = { ...r, status: 'lost' }
  }

  $.ui.status(statusText(next, p))
  if (next.status !== 'running') await settle($, next, p)

  return next
}

async function settle($: EngineInterface, r: Run, p: Progress | null): Promise<void> {
  const out = await $.process.run(['tail', '-c', '20000', `${r.runDir}/out`]).catch(() => null)
  const s = out ? parseSummary(out.stdout) : null
  await update($, summary, () => s)
  if (p && r.status !== 'succeeded') await update($, progress, () => stopProgress(p))

  const how =
    r.status === 'succeeded'
      ? 'rendering completed'
      : r.status === 'stopped'
        ? 'rendering canceled'
        : r.status === 'lost'
          ? 'lost track of the render'
          : `rendering failed (exit ${r.exitCode})`
  $.ui.toast(`codeplain: ${r.file} ${how}`)
  await update($, run, () => r)
}

function startPolling($: EngineInterface): void {
  if (isPolling) return
  isPolling = true
  void (async () => {
    try {
      for (let count = 0; ; count++) {
        const r = await read($, run)
        if (!r || r.status !== 'running') return
        const next = await tick($, r, count)
        if (next.status !== 'running') return
        await $.clock.sleep(POLL_MS)
      }
    } finally {
      isPolling = false
    }
  })()
}

async function launch($: EngineInterface, file: string, extra: string[]): Promise<string> {
  const current = await read($, run)
  if (current?.status === 'running') return `codeplain is already regenerating ${current.file}.`

  // Paths are the project root's, as the person typed them there: a shell cd
  // during the session moves the session's cwd but not its root.
  const root = await $.session.root()
  const scripts = await readScripts($, root, file, extra)
  const started = await $.process.run(['sh', '-c', LAUNCH, 'sh', file, ...extra], { cwd: root })
  const [runDir, logPath, version] = started.stdout.trim().split('\n')
  const pid = runDir ? (await $.fs.read(`${runDir}/pid`).catch(() => '')).trim() : ''
  if (started.exitCode !== 0 || !runDir || !logPath || !pid) {
    return `codeplain did not start: ${started.stderr.trim() || 'no pid'}`
  }

  const topModule = (file.split('/').pop() ?? file).replace(/\.plain$/, '')
  lastSize = -1
  lastWritten = ''
  await update($, progress, () => null)
  await update($, summary, () => null)
  await update($, run, () => ({
    file,
    topModule,
    logPath,
    runDir,
    pid,
    version: version || null,
    scripts,
    status: 'running' as const,
    exitCode: null,
    isStopRequested: false,
  }))
  $.ui.status(`codeplain · ${file} · starting`)
  void $.ui.open({ id: PANE, title: 'codeplain' })
  startPolling($)

  return `Regenerating ${file}${extra.length ? ` ${extra.join(' ')}` : ''}.`
}

async function stop($: EngineInterface): Promise<string> {
  const r = await read($, run)
  if (r?.status !== 'running') return 'No codeplain render is running.'
  // A second Stop forces it, as a second ctrl+c would.
  const signal = r.isStopRequested ? '-KILL' : '-INT'
  await update($, run, () => ({ ...r, isStopRequested: true }))
  await $.process.run(['kill', signal, r.pid]).catch(() => null)

  return signal === '-INT' ? `Stopping codeplain (pid ${r.pid}).` : `Killed codeplain (pid ${r.pid}).`
}

async function accountStatus($: EngineInterface): Promise<string> {
  const { stdout, stderr } = await $.process.run(['codeplain', '--status'], {
    cwd: await $.session.root(),
    timeoutMs: 60_000,
  })

  return (stdout || stderr).replace(/\u001b\[[0-9;]*[A-Za-z]/g, '').trim()
}

async function pickFile($: EngineInterface, args: string[]): Promise<{ file: string; extra: string[] } | string> {
  if (args[0]?.endsWith('.plain')) return { file: args[0], extra: args.slice(1) }

  const last = await read($, run)
  if (last) return { file: last.file, extra: args }

  const found = (await $.fs.list(await $.session.root())).filter(f => f.kind === 'file' && f.name.endsWith('.plain'))
  if (found.length === 1 && found[0]) return { file: found[0].name, extra: args }

  return found.length === 0
    ? 'No .plain file here: run /regenerate <path/to/module.plain>.'
    : `Several .plain files here (${found.map(f => f.name).join(', ')}): name one.`
}

function describe(r: Run | null, p: Progress | null, s: Summary | null): string {
  if (!r) return 'No codeplain render has been started with /regenerate in this session.'
  const log = (p?.log ?? []).filter(e => e.level !== 'DEBUG').slice(-40)

  return JSON.stringify({ run: r, summary: s, progress: p && { ...p, log } }, null, 2)
}

function icon(status: Item['status']): string {
  return status === 'completed' ? '✓' : status === 'processing' ? '◐' : status === 'stopped' ? '■' : '○'
}

function itemColor(status: Item['status']): string | undefined {
  return status === 'completed' ? 'green' : status === 'processing' ? 'cyan' : status === 'stopped' ? 'red' : undefined
}

function levelColor(level: string, text: string): string | undefined {
  if (level === 'ERROR' || level === 'CRITICAL') return 'red'
  if (level === 'WARNING' || text.startsWith('↻')) return 'yellow'
  if (level === 'DEBUG') return 'gray'
  if (/(✓|completed|successfully|passed)/.test(text)) return 'green'

  return undefined
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'regenerate',
      description: 'Regenerate code from a .plain module with codeplain, shown in a pane like its TUI',
      argumentHint: '[file.plain] [codeplain flags] | stop | show | status',
    })
    await $.tool.register({
      name: 'status',
      description:
        "Read-only. The state of the codeplain render the user started with /regenerate, as codeplain's TUI shows it: run status and exit code, module and functionality being rendered, the four phases (implementing, unit tests, refactoring, conformance tests) with their sub-steps and attempts, test-script output paths (with --verbose), specification-ambiguity and conflict notices with the renderer's guidance, the last error, the --render-from point to resume, the exit summary (generated code folder, functionalities, render time), and recent log entries. Use it to supervise a render instead of tailing codeplain.log.",
      isDeferred: false,
    })
    const r = await read($, run)
    if (r?.status === 'running') startPolling($)

    return next(e)
  })

  on('command.run', { command: 'regenerate' }, async ($, e) => {
    const args = e.args.trim().split(/\s+/).filter(Boolean)
    if (args[0] === 'stop') return { text: await stop($) }
    if (args[0] === 'status') return { text: await accountStatus($) }
    if (args[0] === 'show') {
      await $.ui.open({ id: PANE, title: 'codeplain' })
      return { text: 'codeplain pane opened.' }
    }

    const picked = await pickFile($, args)
    if (typeof picked === 'string') return { text: picked }

    return { text: await launch($, picked.file, picked.extra) }
  })

  on('tool.call', { tool: 'mcp__codeplain__status' }, async $ => ({
    result: describe(await read($, run), await read($, progress), await read($, summary)),
  }))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button, Code } = $.ui.resolve(e)
    const r = await read($, run)
    const p = await read($, progress)
    const s = await read($, summary)
    const v: View = await read($, view)
    const rows = e.viewport?.rows ?? 30

    if (!r) {
      return (
        <Box flexDirection="column">
          <Text bold>*codeplain</Text>
          <Text dimColor>No render yet. Run /regenerate path/to/module.plain</Text>
        </Box>
      )
    }

    const isRunning = r.status === 'running'
    const resumeFrom = !isRunning ? (p?.resumeFrom ?? (p?.module === r.topModule ? p?.functionality : null)) : null
    const setView = (patch: Partial<View>) => update($, view, old => ({ ...old, ...patch }))

    const header = (
      <Text>
        <Text bold>*codeplain</Text>
        {r.version ? <Text dimColor> (v{r.version})</Text> : null}
        <Text dimColor> · {r.file}</Text>
      </Text>
    )

    const footer = (
      <Box flexDirection="row" gap={1}>
        {isRunning ? (
          <Button key="stop" label={r.isStopRequested ? 'Force stop' : 'Stop'} hotkey="s" onPress={() => stop($)} />
        ) : (
          <Button key="again" label="Regenerate" hotkey="g" onPress={() => launch($, r.file, [])} />
        )}
        {resumeFrom ? (
          <Button
            key="resume"
            label={`Resume from ${resumeFrom}`}
            hotkey="r"
            onPress={() => launch($, r.file, ['--render-from', resumeFrom])}
          />
        ) : null}
        {!isRunning ? (
          <Button key="force" label="Force re-render" hotkey="f" onPress={() => launch($, r.file, ['--force-render'])} />
        ) : null}
        <Button key="logs" label={v.isLogs ? 'Dashboard' : 'Logs'} hotkey="l" onPress={() => setView({ isLogs: !v.isLogs })} />
        {!v.isLogs && p?.spec ? (
          <Button
            key="expand"
            label={v.isExpanded ? 'Collapse' : 'Expand'}
            hotkey="o"
            onPress={() => setView({ isExpanded: !v.isExpanded })}
          />
        ) : null}
      </Box>
    )

    if (v.isLogs) {
      const min = LEVELS.indexOf(v.level)
      const shown = (p?.log ?? []).filter(entry => {
        const at = LEVELS.indexOf(entry.level as LogLevel)
        return at < 0 || at >= min
      })

      return (
        <Box flexDirection="column">
          {header}
          <Box flexDirection="row" gap={1}>
            {LEVELS.map((level, i) => (
              <Button
                key={`level-${level}`}
                label={level === v.level ? `[${level}]` : level}
                hotkey={String(i + 1)}
                onPress={() => setView({ level })}
              />
            ))}
          </Box>
          {shown.length === 0 ? <Text dimColor>No log entries at {v.level} or above yet.</Text> : null}
          {shown.slice(-Math.max(3, rows - 6)).map(entry => (
            <Text color={levelColor(entry.level, entry.text)}>
              <Text dimColor>[{entry.time}] </Text>
              {entry.text}
            </Text>
          ))}
          {footer}
        </Box>
      )
    }

    const spec = p?.spec ?? ''
    const shortSpec = spec.length > 100 && !v.isExpanded ? `${spec.slice(0, 100)}…` : spec
    const outputs = p
      ? [
          r.scripts.unit && p.scriptOutputs.unit ? `Unit tests output: ${p.scriptOutputs.unit}` : null,
          r.scripts.env && p.scriptOutputs.env ? `Testing environment preparation execution output: ${p.scriptOutputs.env}` : null,
          r.scripts.conformance && p.scriptOutputs.conformance
            ? `Conformance tests output: ${p.scriptOutputs.conformance}`
            : null,
        ].filter((line): line is string => line !== null)
      : []
    const functionalities = s?.functionalities ?? p?.completed.length ?? 0
    const renderTime = s?.renderTime ?? p?.elapsed ?? '00:00:00'

    let statusLine = <Text>Rendering in progress...</Text>
    if (r.status === 'succeeded') {
      statusLine = (
        <Text>
          <Text color="green">✓ rendering completed!</Text>
          {s?.codeFolder ? <Text dimColor> generated code folder: {s.codeFolder}</Text> : null}
        </Text>
      )
    } else if (r.status === 'stopped') {
      statusLine = <Text color="yellow">— rendering canceled</Text>
    } else if (r.status === 'lost') {
      statusLine = <Text color="red">✗ the codeplain process ended without an exit code</Text>
    } else if (r.status === 'failed') {
      statusLine = <Text color="red">✗ rendering failed: {s?.error ?? p?.lastError ?? `exit ${r.exitCode}`}</Text>
    }

    return (
      <Box flexDirection="column">
        {header}
        <Text>
          <Text dimColor>Module: </Text>
          {p?.module ?? '…'}
        </Text>
        <Text>
          <Text dimColor>Functionality </Text>
          {p?.functionality ? `${p.functionality}${p.functionalityAttempt ? ` (attempt ${p.functionalityAttempt})` : ''}: ` : '…'}
          {shortSpec}
        </Text>
        <Box flexDirection="column" borderStyle="round" paddingX={1}>
          {ITEM_ROWS.filter(row => row.script === null || r.scripts[row.script]).map(row => {
            const it = p?.items[row.key] ?? { status: 'pending' as const, substates: [] }
            const attempt =
              it.status === 'processing'
                ? row.key === 'unit'
                  ? p?.unitAttempt
                  : row.key === 'conformance'
                    ? p?.conformanceAttempt
                    : null
                : null
            return (
              <Box flexDirection="column">
                <Text color={itemColor(it.status)}>
                  {icon(it.status)} {row.label}
                  <Text dimColor>
                    {' '}
                    {it.status}
                    {attempt && attempt > 1 ? ` · attempt ${attempt}` : ''}
                  </Text>
                </Text>
                {it.substates.map(one => (
                  <Text dimColor>
                    {'    '.repeat(one.depth + 1)}
                    {one.text}
                  </Text>
                ))}
              </Box>
            )
          })}
        </Box>
        {outputs.length > 0 ? (
          <Box flexDirection="column">
            {outputs.map(line => (
              <Text dimColor>{line}</Text>
            ))}
          </Box>
        ) : null}
        {p?.notices.slice(-3).map(n => (
          <Text color={n.kind === 'ambiguity' || n.kind === 'conflict' ? 'magenta' : 'yellow'}>⚠ {n.text}</Text>
        ))}
        {isRunning && p?.lastError ? <Code source={p.lastError.split('\n').slice(-8).join('\n')} /> : null}
        {statusLine}
        <Text>
          <Text dimColor>functionalities </Text>
          {functionalities}
          <Text dimColor>  used credits </Text>
          {functionalities}
          <Text dimColor>  render time </Text>
          {renderTime}
        </Text>
        {p?.renderId ? <Text dimColor>render id {p.renderId}</Text> : null}
        {footer}
      </Box>
    )
  })
}
