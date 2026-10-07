// Persistência no localStorage: execuções e cenários salvos.

import type { RunRecord, SavedScenario } from '../sim/types'

const RUNS_KEY = 'agencia-bancaria.runs.v1'
const SCENARIOS_KEY = 'agencia-bancaria.scenarios.v1'

export interface ExportFile {
  app: 'agencia-bancaria-c12'
  version: 1
  exportedAt: string
  runs: RunRecord[]
  scenarios: SavedScenario[]
}

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

function write<T>(key: string, items: T[]): void {
  localStorage.setItem(key, JSON.stringify(items))
}

export function loadRuns(): RunRecord[] {
  return read<RunRecord>(RUNS_KEY)
}

/** Salva a execução. Lança erro se o localStorage estiver cheio. */
export function saveRun(run: RunRecord): RunRecord[] {
  const runs = [...loadRuns(), run]
  write(RUNS_KEY, runs)
  return runs
}

export function deleteRun(id: string): RunRecord[] {
  const runs = loadRuns().filter((run) => run.id !== id)
  write(RUNS_KEY, runs)
  return runs
}

export function loadScenarios(): SavedScenario[] {
  return read<SavedScenario>(SCENARIOS_KEY)
}

/** Salva o cenário; um cenário com o mesmo nome é substituído. */
export function saveScenario(scenario: SavedScenario): SavedScenario[] {
  const scenarios = [...loadScenarios().filter((s) => s.name !== scenario.name), scenario]
  write(SCENARIOS_KEY, scenarios)
  return scenarios
}

export function deleteScenario(name: string): SavedScenario[] {
  const scenarios = loadScenarios().filter((s) => s.name !== name)
  write(SCENARIOS_KEY, scenarios)
  return scenarios
}

export function exportAll(): ExportFile {
  return {
    app: 'agencia-bancaria-c12',
    version: 1,
    exportedAt: new Date().toISOString(),
    runs: loadRuns(),
    scenarios: loadScenarios(),
  }
}

function isRun(value: unknown): value is RunRecord {
  const run = value as RunRecord
  return !!run && typeof run.id === 'string' && !!run.config && !!run.metrics && !!run.timeline
}

function isScenario(value: unknown): value is SavedScenario {
  const scenario = value as SavedScenario
  return !!scenario && typeof scenario.name === 'string' && !!scenario.config
}

/** Mescla um arquivo exportado com o que já existe (sem duplicar execuções). */
export function importAll(json: string): { runs: number; scenarios: number } {
  const file = JSON.parse(json) as Partial<ExportFile>
  if (file.app !== 'agencia-bancaria-c12') throw new Error('Arquivo não reconhecido.')
  const incomingRuns = (file.runs ?? []).filter(isRun)
  const incomingScenarios = (file.scenarios ?? []).filter(isScenario)

  const runs = loadRuns()
  const knownIds = new Set(runs.map((run) => run.id))
  const newRuns = incomingRuns.filter((run) => !knownIds.has(run.id))
  write(RUNS_KEY, [...runs, ...newRuns])

  const scenarios = loadScenarios()
  const knownNames = new Set(scenarios.map((s) => s.name))
  const newScenarios = incomingScenarios.filter((s) => !knownNames.has(s.name))
  write(SCENARIOS_KEY, [...scenarios, ...newScenarios])

  return { runs: newRuns.length, scenarios: newScenarios.length }
}

export function clearAll(): void {
  localStorage.removeItem(RUNS_KEY)
  localStorage.removeItem(SCENARIOS_KEY)
}
