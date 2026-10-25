import type { Item, ItemKey, LogEntry, Progress, Substate, Summary } from '../types'

// Each pattern below matches a message codeplain's render machine logs (0.3.13);
// together they stand in for the RenderStateUpdated events its TUI listens to,
// which a headless run does not write anywhere.

const LOG_KEEP = 400
const ENTRY = /^\[(\d\d:\d\d:\d\d)\] (\w+)\s+[\w.]+: ?(.*)$/
const ITEMS: ItemKey[] = ['implement', 'unit', 'refactor', 'conformance']

function item(): Item {
  return { status: 'pending', substates: [] }
}

function sub(text: string, ...children: string[]): Substate[] {
  return [{ text, depth: 0 }, ...children.map(child => ({ text: child, depth: 1 }))]
}

export function emptyProgress(): Progress {
  return {
    renderId: null,
    module: null,
    functionality: null,
    functionalityAttempt: null,
    spec: null,
    items: { implement: item(), unit: item(), refactor: item(), conformance: item() },
    unitAttempt: null,
    conformanceAttempt: null,
    scriptOutputs: { unit: null, env: null, conformance: null },
    completed: [],
    modulesCompleted: [],
    elapsed: null,
    lastError: null,
    resumeFrom: null,
    notices: [],
    log: [],
  }
}

export function splitEntries(text: string): LogEntry[] {
  const entries: LogEntry[] = []

  for (const line of text.split('\n')) {
    const m = ENTRY.exec(line)
    const last = entries[entries.length - 1]
    if (m) {
      entries.push({ time: m[1] ?? '', level: m[2] ?? '', text: m[3] ?? '' })
    } else if (last && /^\s/.test(line) && line.trim()) {
      last.text += `\n${line.trim()}`
    }
  }

  return entries
}

export function parseLog(text: string): Progress {
  const p = emptyProgress()
  const entries = splitEntries(text)
  let isGuidanceNext = false

  const set = (key: ItemKey, substates: Substate[]) => {
    p.items[key] = { status: 'processing', substates }
  }
  // A later phase starting means every earlier one that was running is done,
  // as the TUI's StateCompletionHandler marks a phase done when the next begins.
  const enter = (key: ItemKey) => {
    for (const k of ITEMS) {
      if (k === key) break
      if (p.items[k].status === 'processing') p.items[k] = { status: 'completed', substates: [] }
    }
  }
  const finish = () => {
    const id = p.module && p.functionality ? `${p.module} ${p.functionality}` : null
    if (id && !p.completed.includes(id)) p.completed.push(id)
  }
  const inRefactor = () => p.items.refactor.status === 'processing'

  for (const entry of entries) {
    const t = entry.text
    p.elapsed = entry.time
    let m: RegExpExecArray | null

    if (isGuidanceNext && entry.level === 'INFO') {
      const last = p.notices[p.notices.length - 1]
      if (last) last.text += `\n${t}`
      isGuidanceNext = false
      continue
    }
    isGuidanceNext = false

    if ((m = /^Render started\. Render ID: (\S+)/.exec(t))) {
      p.renderId = m[1] ?? null
    } else if ((m = /Module: (\S+)\nRendering functionality ([\w.]+)(?:, attempt number (\d+\/\d+))?:\n([\s\S]*?)(?:\n-{5,}|$)/.exec(t))) {
      if (p.functionality !== m[2] || p.module !== m[1]) finish()
      p.module = m[1] ?? null
      p.functionality = m[2] ?? null
      p.functionalityAttempt = m[3] ?? null
      p.spec = (m[4] ?? '').replace(/^- /, '').trim() || null
      for (const k of ITEMS) p.items[k] = item()
      set('implement', sub(m[3] ? `Restarting from scratch (attempt ${m[3]})` : 'Initial implementation'))
      p.unitAttempt = null
      p.conformanceAttempt = null
      p.lastError = null
      p.resumeFrom = null
    } else if ((m = /^Running unit tests script .*\(attempt: (\d+)\)/.exec(t))) {
      p.unitAttempt = Number(m[1])
      if (inRefactor()) set('refactor', sub('Refactoring code', 'Running unit tests'))
      else {
        enter('unit')
        set('unit', sub('Running unit tests'))
      }
    } else if (/^↻ The Unit Tests script .*has failed/.test(t)) {
      if (inRefactor()) set('refactor', sub('Refactoring code', 'Fixing unit tests'))
      else set('unit', sub('Fixing unit tests'))
    } else if ((m = /^Agent submitted a fix: ([\s\S]*)/.exec(t))) {
      const key = inRefactor() ? 'refactor' : 'unit'
      const head = inRefactor() ? 'Refactoring code' : 'Fixing unit tests'
      set(key, sub(head, `Fix submitted: ${(m[1] ?? '').split('\n')[0]?.slice(0, 160)}`))
    } else if (/^(✓ All Unit Tests scripts have passed|✓ The Unit Tests script .*passed|Unit tests already passed)/.test(t)) {
      if (inRefactor()) set('refactor', sub('Refactoring code'))
      else if (p.items.unit.status === 'processing') p.items.unit = { status: 'completed', substates: [] }
    } else if (/^Refactoring the generated code/.test(t)) {
      enter('refactor')
      set('refactor', sub('Refactoring code'))
    } else if ((m = /^(?:Implementing conformance tests|Implementing test requirements|Recreating conformance tests for functionality ([\w.]+))/.exec(t))) {
      enter('conformance')
      set('conformance', sub(`Rendering conformance tests for functionality ${m[1] ?? p.functionality}`))
    } else if ((m = /^Generating acceptance test:\n([\s\S]*)/.exec(t))) {
      enter('conformance')
      set('conformance', sub(`Rendering acceptance test: ${(m[1] ?? '').replace(/^- /, '').trim()}`))
    } else if (/^Running testing environment preparation script/.test(t)) {
      enter('conformance')
      set('conformance', sub('Preparing testing environment for conformance tests'))
    } else if ((m = /^Running conformance tests script .*\(functionality ([\w.]+) in module (\S+?)[),]/.exec(t))) {
      enter('conformance')
      const of = m[2] !== p.module ? ` of module ${m[2]}` : ''
      set('conformance', sub(`Running conformance tests for functionality ${m[1]}${of}`))
    } else if ((m = /^Running conformance tests attempt (\d+)/.exec(t))) {
      p.conformanceAttempt = Number(m[1])
    } else if ((m = /^Fixing conformance test for functionality ([\w.]+) in module (\S+?)\.?$/.exec(t))) {
      const of = m[2] !== p.module ? ` of module ${m[2]}` : ''
      set('conformance', sub(`Fixing conformance tests for functionality ${m[1]}${of}`))
    } else if (/^Distilling conformance test fix learnings/.test(t)) {
      set('conformance', sub('Distilling conformance test fix learnings'))
    } else if (/^Summarizing conformance tests/.test(t)) {
      set('conformance', sub('Summarizing conformance tests'))
    } else if (/^Specification ambiguity detected!/.test(t)) {
      p.notices.push({ kind: 'ambiguity', text: t })
      isGuidanceNext = true
    } else if (/^↻ Potential conflicting functionalities/.test(t)) {
      p.notices.push({ kind: 'conflict', text: t })
    } else if (/^↻ (Unittests could not be fixed|Failed to adjust the unit tests)/.test(t)) {
      p.notices.push({ kind: 'retry', text: t })
    } else if (/script timed out after/.test(t)) {
      p.notices.push({ kind: 'timeout', text: t })
    } else if ((m = /^(Unit Tests|Conformance Tests|Testing Environment Preparation) script output stored in: (\S+)/.exec(t))) {
      const key = m[1] === 'Unit Tests' ? 'unit' : m[1] === 'Conformance Tests' ? 'conformance' : 'env'
      p.scriptOutputs[key] = m[2] ?? null
    } else if ((m = /^✓ Render of module (\S+) completed successfully/.exec(t))) {
      for (const k of ITEMS) {
        if (p.items[k].status === 'processing') p.items[k] = { status: 'completed', substates: [] }
      }
      finish()
      if (m[1] && !p.modulesCompleted.includes(m[1])) p.modulesCompleted.push(m[1])
    } else if ((m = /provide the --render-from ([\w.]+) flag/.exec(t))) {
      p.resumeFrom = m[1] ?? null
    } else if (entry.level === 'WARNING') {
      p.notices.push({ kind: 'warning', text: t })
    }

    if (entry.level === 'ERROR' || entry.level === 'CRITICAL') p.lastError = t.slice(0, 2000)
  }

  p.notices = p.notices.slice(-20)
  // codeplain logs blank INFO lines as spacers; the log view leaves them out.
  p.log = entries.filter(e => e.text.trim()).slice(-LOG_KEEP).map(e => ({ ...e, text: e.text.slice(0, 1000) }))

  return p
}

// What a stopped or failed run leaves on the TUI: the running phase marked stopped.
export function stopProgress(p: Progress): Progress {
  const items = { ...p.items }
  for (const k of ITEMS) {
    if (items[k].status === 'processing') items[k] = { ...items[k], status: 'stopped' }
  }

  return { ...p, items }
}

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g

const HEAD = /(✓ rendering completed|✗ rendering failed|— rendering canceled)/

// The exit summary codeplain prints to stdout once the render is over, as printed.
export function summaryBlock(out: string): string | null {
  const text = out.replace(ANSI, '')
  const head = HEAD.exec(text)

  return head ? text.slice(head.index).trimEnd() : null
}

export function parseSummary(out: string): Summary | null {
  const text = out.replace(ANSI, '')
  const head = HEAD.exec(text)
  if (!head) return null
  const rest = text.slice(head.index)
  const usage = /functionalities\s+(\d+)\s+used credits\s+\d+\s+render time\s+(\S+)/.exec(rest)
  const folder = /generated code folder:\s*(.+)/.exec(rest)?.[1]?.trim() ?? null
  const after = usage ? rest.slice(usage.index + usage[0].length).trim() : ''

  return {
    outcome: head[1]?.startsWith('✓') ? 'completed' : head[1]?.startsWith('✗') ? 'failed' : 'canceled',
    codeFolder: folder && folder !== '-' ? folder : null,
    functionalities: usage ? Number(usage[1]) : null,
    renderTime: usage?.[2] ?? null,
    error: after ? after.slice(0, 2000) : null,
  }
}
