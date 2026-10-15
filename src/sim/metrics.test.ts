import { describe, expect, it } from 'vitest'
import { computeMetrics, meanAndSd } from './metrics'
import { DEFAULT_CONFIG } from './queue'
import { clientScore, moodLevel, percentile, timeScore, type ScoreInput } from './satisfaction'
import { closeQueue, packTimeline, unpackTimeline, viewAt } from './timeline'
import type { Client, ClientTrace, ScenarioConfig, Timeline } from './types'

const config: ScenarioConfig = { ...DEFAULT_CONFIG, tellers: 2, accounts: 2, initialBalance: 1000, clients: 2 }
const clients: Client[] = [
  { id: 0, arrivalUs: 0, priority: 1, op: 0, from: 0, to: -1, amount: 500, durationUs: 10_000, kind: 1 },
  { id: 1, arrivalUs: 10_000, priority: 0, op: 2, from: 0, to: 1, amount: 200, durationUs: 20_000, kind: 0 },
]
const trace = (partial: Partial<ClientTrace>): ClientTrace => ({
  teller: -1, startUs: 0, endUs: 0, result: 0, lock1: -1, wait1Us: 0, acq1Us: 0, lock2: -1, wait2Us: 0, acq2Us: 0, releaseUs: 0, gaveUpUs: 0, sickUs: 0, floorUs: 0,
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

  it('aplica o Teorema de Little e a condição de estabilidade', () => {
    const m = computeMetrics(config, clients, timeline)
    expect(m.arrivalRate).toBeCloseTo(100) // 1 intervalo de 10 ms
    expect(m.serviceAvgMs).toBe(50) // (40 + 60) / 2
    expect(m.rho).toBeCloseTo(2.5) // 100/s × 0,05 s ÷ 2 caixas
    expect(m.littleL).toBeCloseTo(1.5) // 20/s × 0,075 s
    expect(m.littleLq).toBeCloseTo(0.5) // 20/s × 0,025 s
    // L − Lq é o número médio de caixas ocupados
    expect(m.littleL! - m.littleLq!).toBeCloseTo((m.utilization[0] + m.utilization[1]) / 100)
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

describe('satisfação', () => {
  // o exemplo aprovado: P = 500 ms, tolerância de 125 ms
  const P = 500_000
  const score = (waitMs: number, extra: Partial<ScoreInput> = {}) =>
    clientScore({ waitUs: waitMs * 1000, gaveUp: false, sick: false, floor: false, refused: false, wrongMoney: false, ...extra }, P)

  it('nota do tempo: cheia até a tolerância e queda linear até a paciência', () => {
    expect(timeScore(80_000, P)).toBe(1)
    expect(timeScore(125_000, P)).toBe(1)
    expect(timeScore(200_000, P)).toBeCloseTo(0.8)
    expect(timeScore(500_000, P)).toBe(0)
    expect(timeScore(700_000, P)).toBe(0)
  })

  it('reproduz o exemplo de 10 clientes: índice 53,3', () => {
    const scores = [
      score(80),
      score(200),
      score(350),
      score(500, { gaveUp: true }),
      score(320, { sick: true }),
      score(250, { floor: true }),
      score(100, { refused: true }),
      score(150, { wrongMoney: true }),
      score(60),
      score(400),
    ]
    expect(scores.map((s) => Math.round(s * 1000) / 1000)).toEqual([1, 0.8, 0.4, 0, 0, 0.6, 0.8, 0.467, 1, 0.267])
    const index = (scores.reduce((a, b) => a + b, 0) / scores.length) * 100
    expect(index).toBeCloseTo(53.33, 1)
    expect(percentile(scores, 50) * 100).toBeCloseTo(53.33, 1)
    expect(percentile(scores, 10)).toBe(0)
  })

  it('humor na escala do palco, com média, mediana e percentil 90', () => {
    const moods = [80, 200, 350, 500, 320, 250, 100, 150, 60, 400].map((w) => moodLevel(w / 500))
    expect(moods).toEqual([0, 1, 2, 4, 2, 1, 0, 1, 0, 2])
    expect(percentile(moods, 50)).toBe(1)
    expect(percentile(moods, 90)).toBeCloseTo(2.2)
  })

  it('quem passa da paciência sem ser chamado desiste e o idoso passa mal antes', () => {
    const patienceConfig = { ...config, patienceMs: 50 }
    const waiting: Timeline = {
      ...timeline,
      endUs: 200_000,
      clients: [trace({}), trace({ teller: 0, startUs: 40_000, endUs: 100_000, result: 1 })],
    }
    closeQueue(waiting, clients, 50_000)
    expect(waiting.clients[0].gaveUpUs).toBe(50_000)
    expect(waiting.clients[0].sickUs).toBe(30_000) // idoso: 60% da paciência
    const m = computeMetrics(patienceConfig, clients, waiting)
    expect(m.gaveUp).toBe(1)
    expect(m.gaveUpPref).toBe(1)
    expect(m.elderlySick).toBe(1)
    expect(m.served).toBe(1)
    // o comum esperou 30 ms de 50: (50 − 30) / 37,5
    expect(m.satisfactionCommon).toBeCloseTo((20 / 37.5) * 100)
    expect(m.satisfaction).toBeCloseTo(((20 / 37.5) * 100) / 2)
    expect(viewAt(patienceConfig, clients, waiting, 60_000, undefined, 0).gaveUp).toBe(1)
  })

  it('conta movimentada com saldo errado derruba a nota pela metade', () => {
    const ok = computeMetrics(config, clients, timeline)
    expect(ok.satisfaction).toBe(100)
    const wrong = computeMetrics(config, clients, { ...timeline, balances: [800, 1200] })
    expect(wrong.satisfaction).toBe(50)
  })
})
