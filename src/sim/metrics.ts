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
  const busyUs = new Array<number>(config.tellers).fill(0)
  let served = 0
  let refused = 0
  let lastEndUs = 0

  timeline.clients.forEach((trace, i) => {
    const client = clients[i]
    if (!client || trace.startUs === 0) return
    const waitMs = (trace.startUs - client.arrivalUs) / 1000
    waits.push(waitMs)
    ;(client.priority === 1 ? waitsPref : waitsCommon).push(waitMs)
    busyUs[trace.teller] += (trace.endUs || timeline.endUs) - trace.startUs
    if (trace.endUs > 0) {
      served++
      if (trace.result === RESULT_REFUSED) refused++
      turnarounds.push((trace.endUs - client.arrivalUs) / 1000)
      lastEndUs = Math.max(lastEndUs, trace.endUs)
    }
  })

  // execução completa: o makespan é o fim do último atendimento; senão, o instante da parada
  const complete = served === clients.length
  const makespanUs = Math.max(1, complete ? lastEndUs : timeline.endUs)

  const expected = new Array<number>(config.accounts).fill(config.initialBalance)
  for (const [, account, , delta] of timeline.writes) expected[account] += delta
  const expectedTotal = expected.reduce((a, b) => a + b, 0)
  const realTotal = timeline.balances.reduce((a, b) => a + b, 0)
  const lockWaitMs = lockWaitUs(timeline, config.tellers).map((us) => us / 1000)

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
    throughput: served / (makespanUs / 1_000_000),
    utilization: busyUs.map((us) => Math.min(100, (us / makespanUs) * 100)),
    lockWaitMs,
    lockWaitTotalMs: lockWaitMs.reduce((a, b) => a + b, 0),
    expectedTotal,
    realTotal,
    inconsistentCents: realTotal - expectedTotal,
    wrongAccounts: expected.filter((value, a) => value !== timeline.balances[a]).length,
  }
}

export function meanAndSd(values: number[]): { mean: number; sd: number; n: number } {
  const n = values.length
  if (n === 0) return { mean: 0, sd: 0, n: 0 }
  const m = mean(values)
  const sd = n > 1 ? Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (n - 1)) : 0
  return { mean: m, sd, n }
}
