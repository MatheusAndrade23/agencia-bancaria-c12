import { outcomesAt, patienceUs, summarize } from './satisfaction'
import { RESULT_REFUSED, type Client, type Metrics, type ScenarioConfig, type Timeline } from './types'

function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0
}

/** Soma, por caixa, o tempo esperando lock até o instante final (inclui esperas que nunca terminaram). */
function lockWaitUs(timeline: Timeline, tellers: number): number[] {
  const total = new Array<number>(tellers).fill(0)
  for (const trace of timeline.clients) {
    if (trace.teller < 0) continue
    if (trace.wait1Us > 0) total[trace.teller] += (trace.acq1Us || timeline.endUs) - trace.wait1Us
    if (trace.wait2Us > 0) total[trace.teller] += (trace.acq2Us || timeline.endUs) - trace.wait2Us
  }
  return total
}

/** Calcula as métricas de uma execução a partir da fila e do que foi registrado. */
export function computeMetrics(config: ScenarioConfig, clients: Client[], timeline: Timeline): Metrics {
  const waits: number[] = []
  const waitsPref: number[] = []
  const waitsCommon: number[] = []
  const turnarounds: number[] = []
  const services: number[] = []
  const busyUs = new Array<number>(config.tellers).fill(0)
  let served = 0
  let refused = 0
  let lastEndUs = 0
  let lastGaveUpUs = 0

  timeline.clients.forEach((trace, i) => {
    const client = clients[i]
    if (client && trace.gaveUpUs > 0) lastGaveUpUs = Math.max(lastGaveUpUs, trace.gaveUpUs)
    if (!client || trace.startUs === 0) return
    const waitMs = (trace.startUs - client.arrivalUs) / 1000
    waits.push(waitMs)
    ;(client.priority === 1 ? waitsPref : waitsCommon).push(waitMs)
    busyUs[trace.teller] += (trace.endUs || timeline.endUs) - trace.startUs
    if (trace.endUs > 0) {
      served++
      if (trace.result === RESULT_REFUSED) refused++
      turnarounds.push((trace.endUs - client.arrivalUs) / 1000)
      services.push((trace.endUs - trace.startUs) / 1000)
      lastEndUs = Math.max(lastEndUs, trace.endUs)
    }
  })

  // execução completa (todos atendidos ou desistentes): o makespan é o último fim de
  // atendimento ou desistência; senão, o instante da parada
  const gaveUp = timeline.clients.filter((trace) => trace.gaveUpUs > 0).length
  const complete = served + gaveUp === clients.length
  const makespanUs = Math.max(1, complete ? Math.max(lastEndUs, lastGaveUpUs) : timeline.endUs)

  const expected = new Array<number>(config.accounts).fill(config.initialBalance)
  for (const [, account, , delta] of timeline.writes) expected[account] += delta
  const expectedTotal = expected.reduce((a, b) => a + b, 0)
  const realTotal = timeline.balances.reduce((a, b) => a + b, 0)
  const lockWaitMs = lockWaitUs(timeline, config.tellers).map((us) => us / 1000)

  // Estabilidade: λ é a taxa de chegada na janela de chegadas e S o atendimento médio.
  // Com c caixas, a fila só não cresce se ρ = λ·S / c < 1.
  const arrivalSpanS = Math.max(0.001, (clients[clients.length - 1]?.arrivalUs ?? 0) / 1_000_000)
  const arrivalRate = Math.max(1, clients.length - 1) / arrivalSpanS
  const serviceAvgMs = mean(services)
  const rho = (arrivalRate * (serviceAvgMs / 1000)) / config.tellers
  // Teorema de Little (L = λ·W) no intervalo observado, onde λ é a vazão efetiva.
  const throughput = served / (makespanUs / 1_000_000)

  // satisfação: desfecho de cada cliente até o fim, com as contas que terminaram erradas
  const wrong = expected.map((value, a) => value !== timeline.balances[a])
  const s = summarize(clients, outcomesAt(config, clients, timeline, makespanUs, wrong))

  return {
    makespanMs: makespanUs / 1000,
    total: clients.length,
    served,
    refused,
    waitAvgMs: mean(waits),
    waitMaxMs: waits.length ? Math.max(...waits) : 0,
    waitMinMs: waits.length ? Math.min(...waits) : 0,
    waitPrefAvgMs: mean(waitsPref),
    waitCommonAvgMs: mean(waitsCommon),
    waitCommonMaxMs: waitsCommon.length ? Math.max(...waitsCommon) : 0,
    turnaroundAvgMs: mean(turnarounds),
    throughput,
    utilization: busyUs.map((us) => Math.min(100, (us / makespanUs) * 100)),
    lockWaitMs,
    lockWaitTotalMs: lockWaitMs.reduce((a, b) => a + b, 0),
    expectedTotal,
    realTotal,
    inconsistentCents: realTotal - expectedTotal,
    wrongAccounts: expected.filter((value, a) => value !== timeline.balances[a]).length,
    arrivalRate,
    serviceAvgMs,
    rho,
    littleL: throughput * (mean(turnarounds) / 1000),
    littleLq: throughput * (mean(waits) / 1000),
    patienceMs: patienceUs(config) / 1000,
    gaveUp: s.gaveUp,
    gaveUpPref: s.gaveUpPref,
    gaveUpCommon: s.gaveUpCommon,
    elderlySick: s.elderlySick,
    infantFloor: s.infantFloor,
    moodAvg: s.moodAvg,
    moodMedian: s.moodMedian,
    moodP90: s.moodP90,
    satisfaction: s.satisfaction ?? undefined,
    satisfactionMedian: s.satisfactionMedian,
    satisfactionP10: s.satisfactionP10,
    satisfactionPref: s.satisfactionPref ?? undefined,
    satisfactionCommon: s.satisfactionCommon ?? undefined,
  }
}

export function meanAndSd(values: number[]): { mean: number; sd: number; n: number } {
  const n = values.length
  if (n === 0) return { mean: 0, sd: 0, n: 0 }
  const m = mean(values)
  const sd = n > 1 ? Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (n - 1)) : 0
  return { mean: m, sd, n }
}
