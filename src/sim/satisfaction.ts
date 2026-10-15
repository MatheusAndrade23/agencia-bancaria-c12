// Comportamento humano na fila e índice de satisfação do cliente.
//
// Regras (P = paciência do cenário):
// - quem espera P sem ser chamado desiste e vai embora (instante = chegada + P);
// - o idoso passa mal ao completar SICK_FRACTION·P de espera;
// - a criança de colo vai para o chão ao completar FLOOR_FRACTION·P de espera.
//
// Nota de cada cliente, de 0 a 1:
// - tempo: 1 até TOLERANCE_FRACTION·P, depois cai em linha reta até 0 quando a espera chega a P;
// - conta movimentada que terminou com saldo errado: × WRONG_MONEY_FACTOR;
// - operação recusada por saldo insuficiente: × REFUSED_FACTOR;
// - criança no chão: no máximo FLOOR_CAP;
// - desistiu ou idoso que passou mal: 0.
// Índice da execução = 100 × média das notas, com mediana e percentil 10 ao lado.

import {
  KIND_ELDERLY, KIND_INFANT, OP_LOAN, OP_TRANSFER, RESULT_OK, RESULT_REFUSED,
  type Client, type ClientTrace, type ScenarioConfig, type Timeline,
} from './types'

export const TOLERANCE_FRACTION = 0.25
export const FLOOR_FRACTION = 0.4
export const SICK_FRACTION = 0.6
export const FLOOR_CAP = 0.6
export const WRONG_MONEY_FACTOR = 0.5
export const REFUSED_FACTOR = 0.8
/** fração dos preferenciais que são idosos; o resto está com criança de colo */
export const ELDERLY_SHARE = 0.6

export type MoodLevel = 0 | 1 | 2 | 3 | 4
export const MOOD_LABEL: Record<MoodLevel, string> = { 0: 'feliz', 1: 'neutro', 2: 'entediado', 3: 'irritado', 4: 'furioso' }

/** Humor pela fração da paciência já gasta: feliz, neutro, entediado, irritado, furioso. */
export function moodLevel(ratio: number): MoodLevel {
  if (ratio < 0.3) return 0
  if (ratio < 0.6) return 1
  if (ratio < 0.85) return 2
  if (ratio < 1) return 3
  return 4
}

export function patienceUs(config: Pick<ScenarioConfig, 'patienceMs'>): number {
  return Math.max(1000, Math.round(config.patienceMs * 1000))
}

/** Nota do tempo de espera: cheia até a tolerância e queda linear até 0 na paciência. */
export function timeScore(waitUs: number, patience: number): number {
  const tolerance = TOLERANCE_FRACTION * patience
  if (waitUs <= tolerance) return 1
  return Math.max(0, (patience - waitUs) / (patience - tolerance))
}

export interface ScoreInput {
  waitUs: number
  gaveUp: boolean
  sick: boolean
  floor: boolean
  refused: boolean
  wrongMoney: boolean
}

export function clientScore(input: ScoreInput, patience: number): number {
  if (input.gaveUp || input.sick) return 0
  let score = timeScore(input.waitUs, patience)
  if (input.wrongMoney) score *= WRONG_MONEY_FACTOR
  if (input.refused) score *= REFUSED_FACTOR
  if (input.floor) score = Math.min(score, FLOOR_CAP)
  return score
}

/** Percentil com interpolação linear (p de 0 a 100). */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const position = ((sorted.length - 1) * p) / 100
  const low = Math.floor(position)
  const high = Math.ceil(position)
  return sorted[low] + (sorted[high] - sorted[low]) * (position - low)
}

/** Instante do evento de quem esperou até `waitEndUs` (0 = não aconteceu). */
export function eventAt(client: Client, kind: typeof KIND_ELDERLY | typeof KIND_INFANT, patience: number, waitEndUs: number): number {
  if (client.kind !== kind) return 0
  const at = client.arrivalUs + Math.round((kind === KIND_ELDERLY ? SICK_FRACTION : FLOOR_FRACTION) * patience)
  return waitEndUs >= at ? at : 0
}

export interface ClientOutcome {
  index: number
  waitUs: number
  gaveUp: boolean
  sick: boolean
  floor: boolean
  refused: boolean
  wrongMoney: boolean
  mood: MoodLevel
  /** nota de 0 a 1; null enquanto o atendimento não termina */
  score: number | null
}

/**
 * Desfecho de cada cliente até o instante `tUs`: quem já foi chamado ou já desistiu.
 * `wrong[a]` diz se a conta `a` está com saldo errado nesse instante.
 */
export function outcomesAt(config: ScenarioConfig, clients: Client[], timeline: Timeline, tUs: number, wrong: boolean[]): ClientOutcome[] {
  const patience = patienceUs(config)
  const outcomes: ClientOutcome[] = []
  timeline.clients.forEach((trace: ClientTrace, i) => {
    const client = clients[i]
    if (!client || client.arrivalUs > tUs) return
    const called = trace.startUs > 0 && trace.startUs <= tUs
    const giveUpAt = trace.gaveUpUs || (trace.startUs === 0 ? client.arrivalUs + patience : 0)
    const gaveUp = !called && giveUpAt > 0 && giveUpAt <= tUs
    if (!called && !gaveUp) return
    const waitEndUs = called ? trace.startUs : giveUpAt
    const waitUs = waitEndUs - client.arrivalUs
    const sick = (trace.sickUs > 0 && trace.sickUs <= waitEndUs) || eventAt(client, KIND_ELDERLY, patience, waitEndUs) > 0
    const floor = (trace.floorUs > 0 && trace.floorUs <= waitEndUs) || eventAt(client, KIND_INFANT, patience, waitEndUs) > 0
    const finished = called && trace.endUs > 0 && trace.endUs <= tUs
    const refused = finished && trace.result === RESULT_REFUSED
    const moved = finished && trace.result === RESULT_OK && client.op !== OP_LOAN
    const wrongMoney = moved && (wrong[client.from] || (client.op === OP_TRANSFER && wrong[client.to]))
    const input = { waitUs, gaveUp, sick, floor, refused, wrongMoney: !!wrongMoney }
    outcomes.push({
      index: i,
      ...input,
      mood: moodLevel(waitUs / patience),
      score: gaveUp || finished ? clientScore(input, patience) : null,
    })
  })
  return outcomes
}

export interface SatisfactionSummary {
  gaveUp: number
  gaveUpPref: number
  gaveUpCommon: number
  elderlySick: number
  infantFloor: number
  moodAvg: number
  moodMedian: number
  moodP90: number
  /** null enquanto nenhum cliente tem nota */
  satisfaction: number | null
  satisfactionMedian: number
  satisfactionP10: number
  satisfactionPref: number | null
  satisfactionCommon: number | null
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)
}

export function summarize(clients: Client[], outcomes: ClientOutcome[]): SatisfactionSummary {
  const moods = outcomes.map((o) => o.mood)
  const scored = outcomes.filter((o) => o.score !== null)
  const scores = scored.map((o) => o.score! * 100)
  const byPriority = (priority: 0 | 1) => {
    const values = scored.filter((o) => clients[o.index].priority === priority).map((o) => o.score! * 100)
    return values.length ? mean(values) : null
  }
  return {
    gaveUp: outcomes.filter((o) => o.gaveUp).length,
    gaveUpPref: outcomes.filter((o) => o.gaveUp && clients[o.index].priority === 1).length,
    gaveUpCommon: outcomes.filter((o) => o.gaveUp && clients[o.index].priority === 0).length,
    elderlySick: outcomes.filter((o) => o.sick).length,
    infantFloor: outcomes.filter((o) => o.floor).length,
    moodAvg: mean(moods),
    moodMedian: percentile(moods, 50),
    moodP90: percentile(moods, 90),
    satisfaction: scores.length ? mean(scores) : null,
    satisfactionMedian: percentile(scores, 50),
    satisfactionP10: percentile(scores, 10),
    satisfactionPref: byPriority(1),
    satisfactionCommon: byPriority(0),
  }
}
