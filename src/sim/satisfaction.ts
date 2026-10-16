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
// - incômodo coletivo: quem está na agência quando um idoso passa mal tem a nota × SICK_WITNESS_FACTOR,
//   e quando uma criança vai para o chão, × FLOOR_WITNESS_FACTOR (acumulam, com piso CONTAGION_FLOOR);
// - furar a fila: cada cliente comum chamado antes dele, tendo chegado depois, enquanto ele ainda
//   esperava: × OVERTAKE_FACTOR (acumulam, com piso OVERTAKE_FLOOR). Preferencial passando na frente
//   não incomoda, porque é lei.
// Índice da execução = 100 × média das notas, com mediana e percentil 10 ao lado.
//
// Reputação da empresa (de −100 a +100): % promotores − % detratores, menos REPUTATION_SICK_PENALTY por
// idoso que passou mal e REPUTATION_MONEY_PENALTY se alguma conta terminou com saldo errado.
//
// Lucro da execução, em centavos: receita dos atendimentos concluídos com sucesso, menos a perda esperada
// com clientes que trocam de banco (chance que cresce quando a nota fica abaixo de CHURN_SAFE_SCORE), menos
// o ressarcimento do dinheiro inconsistente (soma, por conta, do módulo da diferença entre real e esperado).

import {
  KIND_ELDERLY, KIND_INFANT, OP_LOAN, OP_TRANSFER, RESULT_OK, RESULT_REFUSED,
  type Client, type ScenarioConfig, type Timeline,
} from './types'

export const TOLERANCE_FRACTION = 0.25
export const FLOOR_FRACTION = 0.4
export const SICK_FRACTION = 0.6
export const FLOOR_CAP = 0.6
export const WRONG_MONEY_FACTOR = 0.5
export const REFUSED_FACTOR = 0.8
export const SICK_WITNESS_FACTOR = 0.8
export const FLOOR_WITNESS_FACTOR = 0.9
/** o incômodo coletivo nunca tira mais que metade da nota */
export const CONTAGION_FLOOR = 0.5
export const PROMOTER_MIN = 0.8
export const DETRACTOR_BELOW = 0.5
export const REPUTATION_SICK_PENALTY = 10
export const REPUTATION_MONEY_PENALTY = 20
export const OVERTAKE_FACTOR = 0.97
/** furar a fila nunca tira mais que 30% da nota */
export const OVERTAKE_FLOOR = 0.7
/** receita de cada operação concluída com sucesso, em centavos: DEP, SAQ, TRF, BOL, FIN */
export const REVENUE_CENTS = [100, 100, 200, 150, 4000]
/** quanto um cliente vale para o banco por ano, em centavos */
export const CLIENT_VALUE_CENTS = 10_000
/** a partir dessa nota o cliente não troca de banco: feliz e muito feliz valem o mesmo */
export const CHURN_SAFE_SCORE = 0.6
/** chance de trocar de banco com nota 0 (inclui quem desistiu) */
export const CHURN_MAX = 0.5
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
  /** quantos idosos passando mal o cliente viu dentro da agência */
  sawSick?: number
  /** quantas crianças indo para o chão o cliente viu */
  sawFloor?: number
  /** quantos clientes comuns que chegaram depois foram chamados antes dele */
  overtaken?: number
}

/** Fator de furar a fila: cada vez que alguém passa na frente, com piso. */
export function overtakeFactor(overtaken: number): number {
  return Math.max(OVERTAKE_FLOOR, OVERTAKE_FACTOR ** overtaken)
}

/** Chance de o cliente trocar de banco: 0 a partir de CHURN_SAFE_SCORE, subindo até CHURN_MAX na nota 0. */
export function churnChance(score: number): number {
  return score >= CHURN_SAFE_SCORE ? 0 : CHURN_MAX * (1 - score / CHURN_SAFE_SCORE)
}

/** Fator do incômodo coletivo: os descontos se multiplicam, com piso. */
export function contagionFactor(sawSick: number, sawFloor: number): number {
  return Math.max(CONTAGION_FLOOR, SICK_WITNESS_FACTOR ** sawSick * FLOOR_WITNESS_FACTOR ** sawFloor)
}

export function clientScore(input: ScoreInput, patience: number): number {
  if (input.gaveUp || input.sick) return 0
  let score = timeScore(input.waitUs, patience)
  if (input.wrongMoney) score *= WRONG_MONEY_FACTOR
  if (input.refused) score *= REFUSED_FACTOR
  if (input.floor) score = Math.min(score, FLOOR_CAP)
  return score * contagionFactor(input.sawSick ?? 0, input.sawFloor ?? 0) * overtakeFactor(input.overtaken ?? 0)
}

export interface Reputation {
  promoters: number
  neutrals: number
  detractors: number
  /** % promotores − % detratores */
  base: number
  value: number
}

/** Reputação da empresa: o que os clientes contam lá fora, com os incidentes públicos. */
export function reputation(scores: number[], sickCount: number, wrongMoney: boolean): Reputation {
  const promoters = scores.filter((s) => s >= PROMOTER_MIN).length
  const detractors = scores.filter((s) => s < DETRACTOR_BELOW).length
  const neutrals = scores.length - promoters - detractors
  const base = scores.length ? ((promoters - detractors) / scores.length) * 100 : 0
  const value = base - REPUTATION_SICK_PENALTY * sickCount - (wrongMoney ? REPUTATION_MONEY_PENALTY : 0)
  return { promoters, neutrals, detractors, base, value: Math.max(-100, Math.min(100, value)) }
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
  sawSick: number
  sawFloor: number
  overtaken: number
  /** atendimento concluído com sucesso (gera receita) */
  approved: boolean
  mood: MoodLevel
  /** nota de 0 a 1; null enquanto o atendimento não termina */
  score: number | null
}

export interface Incident {
  atUs: number
  victim: number
  kind: 'sick' | 'floor'
}

interface Stay {
  arrivalUs: number
  called: boolean
  gaveUp: boolean
  /** fim da espera na fila (chamado, desistência ou o próprio instante t) */
  waitEndUs: number
  /** saída da agência (Infinity = ainda está lá no instante t) */
  leaveUs: number
}

/** Quando cada cliente esperou e quando saiu da agência, vistos no instante `tUs`. */
function staysAt(clients: Client[], timeline: Timeline, tUs: number, patience: number): (Stay | null)[] {
  return timeline.clients.map((trace, i) => {
    const client = clients[i]
    if (!client || client.arrivalUs > tUs) return null
    const called = trace.startUs > 0 && trace.startUs <= tUs
    const giveUpAt = trace.gaveUpUs || (trace.startUs === 0 ? client.arrivalUs + patience : 0)
    const gaveUp = !called && giveUpAt > 0 && giveUpAt <= tUs
    const waitEndUs = called ? trace.startUs : gaveUp ? giveUpAt : tUs
    const leaveUs = gaveUp ? giveUpAt : called && trace.endUs > 0 && trace.endUs <= tUs ? trace.endUs : Infinity
    return { arrivalUs: client.arrivalUs, called, gaveUp, waitEndUs, leaveUs }
  })
}

/** Idosos que passaram mal e crianças que foram para o chão até o instante `tUs`. */
export function incidentsAt(config: ScenarioConfig, clients: Client[], timeline: Timeline, tUs: number): Incident[] {
  const patience = patienceUs(config)
  const incidents: Incident[] = []
  staysAt(clients, timeline, tUs, patience).forEach((stay, i) => {
    if (!stay) return
    const sickAt = eventAt(clients[i], KIND_ELDERLY, patience, stay.waitEndUs)
    const floorAt = eventAt(clients[i], KIND_INFANT, patience, stay.waitEndUs)
    if (sickAt > 0) incidents.push({ atUs: sickAt, victim: i, kind: 'sick' })
    if (floorAt > 0) incidents.push({ atUs: floorAt, victim: i, kind: 'floor' })
  })
  return incidents.sort((a, b) => a.atUs - b.atUs)
}

/**
 * Desfecho de cada cliente até o instante `tUs`: quem já foi chamado ou já desistiu.
 * `wrong[a]` diz se a conta `a` está com saldo errado nesse instante.
 */
export function outcomesAt(config: ScenarioConfig, clients: Client[], timeline: Timeline, tUs: number, wrong: boolean[]): ClientOutcome[] {
  const patience = patienceUs(config)
  const stays = staysAt(clients, timeline, tUs, patience)
  const incidents = incidentsAt(config, clients, timeline, tUs)
  const outcomes: ClientOutcome[] = []
  stays.forEach((stay, i) => {
    if (!stay || (!stay.called && !stay.gaveUp)) return
    const client = clients[i]
    const trace = timeline.clients[i]
    const waitUs = stay.waitEndUs - client.arrivalUs
    const own = incidents.filter((incident) => incident.victim === i)
    // incômodo coletivo: eventos de outros clientes enquanto este estava dentro da agência
    const seen = incidents.filter((incident) => incident.victim !== i && stay.arrivalUs <= incident.atUs && incident.atUs < stay.leaveUs)
    // furar a fila: comuns que chegaram depois e foram chamados enquanto este ainda esperava
    let overtaken = 0
    stays.forEach((other, j) => {
      if (!other?.called || clients[j].priority === 1 || other.arrivalUs <= stay.arrivalUs) return
      if (timeline.clients[j].startUs < stay.waitEndUs) overtaken++
    })
    const finished = stay.called && trace.endUs > 0 && trace.endUs <= tUs
    const refused = finished && trace.result === RESULT_REFUSED
    const moved = finished && trace.result === RESULT_OK && client.op !== OP_LOAN
    const wrongMoney = moved && (wrong[client.from] || (client.op === OP_TRANSFER && wrong[client.to]))
    const input: ScoreInput = {
      waitUs,
      gaveUp: stay.gaveUp,
      sick: own.some((incident) => incident.kind === 'sick'),
      floor: own.some((incident) => incident.kind === 'floor'),
      refused,
      wrongMoney: !!wrongMoney,
      sawSick: seen.filter((incident) => incident.kind === 'sick').length,
      sawFloor: seen.filter((incident) => incident.kind === 'floor').length,
      overtaken,
    }
    outcomes.push({
      index: i,
      waitUs,
      gaveUp: input.gaveUp,
      sick: input.sick,
      floor: input.floor,
      refused,
      wrongMoney: input.wrongMoney,
      sawSick: input.sawSick!,
      sawFloor: input.sawFloor!,
      overtaken,
      approved: finished && trace.result === RESULT_OK,
      mood: moodLevel(waitUs / patience),
      score: stay.gaveUp || finished ? clientScore(input, patience) : null,
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
  /** clientes que viram pelo menos um incidente dentro da agência */
  disturbed: number
  reputation: Reputation
  /** total de vezes que alguém viu um comum passar na frente */
  overtakes: number
  /** clientes que viram pelo menos um comum passar na frente */
  overtakenClients: number
  profit: Profit
}

export interface Profit {
  revenueCents: number
  churnLossCents: number
  reimbursementCents: number
  /** receita − perda com troca de banco − ressarcimento */
  profitCents: number
}

/** Lucro dos clientes com desfecho: receita, troca de banco esperada e ressarcimento. */
export function profit(clients: Client[], outcomes: ClientOutcome[], moneyErrorCents: number): Profit {
  const scored = outcomes.filter((o) => o.score !== null)
  const revenueCents = scored.reduce((sum, o) => sum + (o.approved ? REVENUE_CENTS[clients[o.index].op] : 0), 0)
  const churnLossCents = scored.reduce((sum, o) => sum + churnChance(o.score!) * CLIENT_VALUE_CENTS, 0)
  const reimbursementCents = Math.abs(moneyErrorCents)
  return { revenueCents, churnLossCents, reimbursementCents, profitCents: revenueCents - churnLossCents - reimbursementCents }
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / Math.max(1, values.length)
}

/**
 * Resume os desfechos. `moneyErrorCents` é a soma, por conta, do módulo da diferença entre o saldo
 * real e o esperado: o que o banco teria de ressarcir.
 */
export function summarize(clients: Client[], outcomes: ClientOutcome[], moneyErrorCents = 0): SatisfactionSummary {
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
    disturbed: outcomes.filter((o) => o.sawSick + o.sawFloor > 0).length,
    reputation: reputation(scored.map((o) => o.score!), outcomes.filter((o) => o.sick).length, moneyErrorCents !== 0),
    overtakes: outcomes.reduce((sum, o) => sum + o.overtaken, 0),
    overtakenClients: outcomes.filter((o) => o.overtaken > 0).length,
    profit: profit(clients, outcomes, moneyErrorCents),
  }
}
