import { describe, expect, it } from 'vitest'
import { computeMetrics, meanAndSd } from './metrics'
import { DEFAULT_CONFIG } from './queue'
import { packTimeline, unpackTimeline, viewAt } from './timeline'
import type { Client, ClientTrace, ScenarioConfig, Timeline } from './types'

const config: ScenarioConfig = { ...DEFAULT_CONFIG, tellers: 2, accounts: 2, initialBalance: 1000, clients: 2 }
const clients: Client[] = [
  { id: 0, arrivalUs: 0, priority: 1, op: 0, from: 0, to: -1, amount: 500, durationUs: 10_000 },
  { id: 1, arrivalUs: 10_000, priority: 0, op: 2, from: 0, to: 1, amount: 200, durationUs: 20_000 },
]
const trace = (partial: Partial<ClientTrace>): ClientTrace => ({
  teller: -1, startUs: 0, endUs: 0, result: 0, lock1: -1, wait1Us: 0, acq1Us: 0, lock2: -1, wait2Us: 0, acq2Us: 0, releaseUs: 0,
  ...partial,
})
const timeline: Timeline = {
  endUs: 100_000,
  finished: true,
  clients: [
    trace({ teller: 0, startUs: 20_000, endUs: 60_000, result: 1 }),
    trace({ teller: 1, startUs: 40_000, endUs: 100_000, result: 1, lock1: 0, wait1Us: 50_000, acq1Us: 60_000, releaseUs: 90_000 }),
  ],
  writes: [
    [55_000, 0, 1500, 500],
    [95_000, 0, 1300, -200],
    [95_001, 1, 1200, 200],
  ],
  balances: [1300, 1200],
}

describe('métricas', () => {
  it('calcula espera, turnaround, makespan e utilização', () => {
    const m = computeMetrics(config, clients, timeline)
    expect(m.makespanMs).toBe(100)
    expect(m.served).toBe(2)
    expect(m.waitAvgMs).toBe(25) // (20 + 30) / 2
    expect(m.waitMaxMs).toBe(30)
    expect(m.waitMinMs).toBe(20)
    expect(m.waitPrefAvgMs).toBe(20)
    expect(m.waitCommonAvgMs).toBe(30)
    expect(m.turnaroundAvgMs).toBe(75) // (60 + 90) / 2
    expect(m.throughput).toBe(20)
    expect(m.utilization).toEqual([40, 60])
    expect(m.lockWaitMs).toEqual([0, 10])
  })

  it('a invariante fecha em zero quando os saldos batem', () => {
    const m = computeMetrics(config, clients, timeline)
    expect(m.expectedTotal).toBe(2500)
    expect(m.inconsistentCents).toBe(0)
    expect(m.wrongAccounts).toBe(0)
  })

  it('acusa dinheiro inconsistente quando uma atualização se perde', () => {
    const m = computeMetrics(config, clients, { ...timeline, balances: [800, 1200] })
    expect(m.inconsistentCents).toBe(-500)
    expect(m.wrongAccounts).toBe(1)
  })

  it('média e desvio padrão amostral', () => {
    expect(meanAndSd([])).toEqual({ mean: 0, sd: 0, n: 0 })
    expect(meanAndSd([5])).toEqual({ mean: 5, sd: 0, n: 1 })
    const { mean, sd } = meanAndSd([2, 4, 4, 4, 5, 5, 7, 9])
    expect(mean).toBe(5)
    expect(sd).toBeCloseTo(2.138, 3)
  })
})

describe('timeline', () => {
  it('compactar e descompactar preserva os dados', () => {
    expect(unpackTimeline(packTimeline(timeline))).toEqual(timeline)
  })

  it('reconstrói o estado da agência em um instante', () => {
    const view = viewAt(config, clients, timeline, 55_000, undefined, 0)
    expect(view.queue).toHaveLength(0)
    expect(view.tellers[0].state).toBe('serving')
    expect(view.tellers[1].state).toBe('waiting')
    expect(view.tellers[1].waitingFor).toBe(0)
    expect(view.accounts[0].waiters).toEqual([1])
    expect(view.accounts[0].balance).toBe(1500)
    expect(view.realTotal).toBe(view.expectedTotal)
  })

  it('mostra a fila antes do atendimento e o dono do lock depois', () => {
    expect(viewAt(config, clients, timeline, 15_000, undefined, 0).queue.map((q) => q.client)).toEqual([0, 1])
    const later = viewAt(config, clients, timeline, 70_000, undefined, 0)
    expect(later.accounts[0].owner).toBe(1)
    expect(later.done).toBe(1)
  })
})
