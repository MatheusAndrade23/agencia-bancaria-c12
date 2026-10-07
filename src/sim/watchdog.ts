// Detecção de deadlock. Roda na thread principal: lê o que cada caixa publicou na
// memória compartilhada (qual lock espera, quem é dono de cada lock) e procura um
// ciclo no grafo de espera (wait-for graph).

import type { CycleStep, DeadlockInfo } from './types'

export interface WaitSnapshot {
  /** por caixa: lock que ele está esperando (-1 = nenhum) */
  waitingFor: number[]
  /** por lock: caixa que o possui (-1 = livre) */
  owners: number[]
}

/**
 * Procura um ciclo no grafo de espera. As arestas são
 *   caixa → lock que ele espera → caixa dono desse lock → ...
 * Cada caixa espera no máximo um lock e cada lock tem no máximo um dono, então
 * basta seguir a corrente a partir de cada caixa até repetir alguém ou ela acabar.
 */
export function findWaitCycle(snapshot: WaitSnapshot): CycleStep[] | null {
  const tellers = snapshot.waitingFor.length
  for (let start = 0; start < tellers; start++) {
    const path: CycleStep[] = []
    const position = new Map<number, number>()
    let teller = start
    while (teller >= 0 && teller < tellers) {
      const seenAt = position.get(teller)
      if (seenAt !== undefined) return normalizeCycle(path.slice(seenAt))
      const lock = snapshot.waitingFor[teller]
      if (lock < 0) break
      position.set(teller, path.length)
      path.push({ teller, lock })
      teller = snapshot.owners[lock] ?? -1
    }
  }
  return null
}

/** Gira o ciclo para começar no caixa de menor id (assim o mesmo ciclo tem sempre a mesma forma). */
function normalizeCycle(cycle: CycleStep[]): CycleStep[] {
  let first = 0
  for (let i = 1; i < cycle.length; i++) if (cycle[i].teller < cycle[first].teller) first = i
  return [...cycle.slice(first), ...cycle.slice(0, first)]
}

export function cycleSignature(cycle: CycleStep[]): string {
  return cycle.map((step) => `${step.teller}>${step.lock}`).join('|')
}

export interface WatchdogOptions {
  /** sem nenhum progresso por esse tempo, com caixas esperando lock, declara deadlock */
  stallMs: number
}

export interface WatchdogSample extends WaitSnapshot {
  progress: number
  nowMs: number
  nowUs: number
}

/**
 * Acumula amostras e decide se há deadlock. Um ciclo só é confirmado quando aparece
 * idêntico em duas amostras seguidas, porque a leitura da memória não é atômica
 * (um caixa pode soltar um lock entre a leitura de duas células).
 */
export class Watchdog {
  private lastSignature = ''
  private lastProgress = -1
  private lastProgressAtMs = 0

  constructor(private readonly options: WatchdogOptions) {}

  check(sample: WatchdogSample): DeadlockInfo | null {
    const blockedTellers = sample.waitingFor.flatMap((lock, teller) => (lock >= 0 ? [teller] : []))

    const cycle = findWaitCycle(sample)
    const signature = cycle ? cycleSignature(cycle) : ''
    if (cycle && signature === this.lastSignature) {
      return { atUs: sample.nowUs, reason: 'cycle', cycle, blockedTellers }
    }
    this.lastSignature = signature

    if (sample.progress !== this.lastProgress) {
      this.lastProgress = sample.progress
      this.lastProgressAtMs = sample.nowMs
    } else if (blockedTellers.length > 0 && sample.nowMs - this.lastProgressAtMs >= this.options.stallMs) {
      return { atUs: sample.nowUs, reason: 'timeout', cycle: [], blockedTellers }
    }
    return null
  }
}
