export type RunStatus = 'running' | 'succeeded' | 'failed' | 'stopped' | 'lost'

export type Scripts = { unit: boolean; conformance: boolean; env: boolean }

export type Run = {
  file: string
  topModule: string
  logPath: string
  runDir: string
  pid: string
  version: string | null
  scripts: Scripts
  status: RunStatus
  exitCode: number | null
  isStopRequested: boolean
}

// The four rows of the TUI's FRID progress box.
export type ItemKey = 'implement' | 'unit' | 'refactor' | 'conformance'
export type ItemStatus = 'pending' | 'processing' | 'completed' | 'stopped'
export type Substate = { text: string; depth: number }
export type Item = { status: ItemStatus; substates: Substate[] }

export type LogEntry = { time: string; level: string; text: string }

export type Notice = { kind: 'ambiguity' | 'conflict' | 'retry' | 'timeout' | 'warning'; text: string }

export type Summary = {
  outcome: 'completed' | 'failed' | 'canceled'
  codeFolder: string | null
  functionalities: number | null
  renderTime: string | null
  error: string | null
}

export type Progress = {
  renderId: string | null
  module: string | null
  functionality: string | null
  functionalityAttempt: string | null
  spec: string | null
  items: Record<ItemKey, Item>
  unitAttempt: number | null
  conformanceAttempt: number | null
  scriptOutputs: { unit: string | null; env: string | null; conformance: string | null }
  completed: string[]
  modulesCompleted: string[]
  elapsed: string | null
  lastError: string | null
  resumeFrom: string | null
  notices: Notice[]
  log: LogEntry[]
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'
export type View = { isLogs: boolean; isExpanded: boolean; level: LogLevel }

declare module 'claude-code' {
  interface PluginState {
    codeplain: {
      run: Shaped<Run | null>
      progress: Shaped<Progress | null>
      summary: Shaped<Summary | null>
      view: Shaped<View>
    }
  }
}
