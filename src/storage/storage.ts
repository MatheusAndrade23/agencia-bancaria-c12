// Persistência no localStorage: execuções e cenários salvos.

import type { RunRecord, SavedScenario } from '../sim/types'

const RUNS_KEY = 'agencia-bancaria.runs.v1'
const SCENARIOS_KEY = 'agencia-bancaria.scenarios.v1'

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

export function clearAll(): void {
  localStorage.removeItem(RUNS_KEY)
  localStorage.removeItem(SCENARIOS_KEY)
}
