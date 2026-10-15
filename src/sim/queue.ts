import { hashString, mulberry32 } from './rng'
import { ELDERLY_SHARE } from './satisfaction'
import {
  KIND_ELDERLY, KIND_INFANT, KIND_NONE, OPS, OP_TRANSFER,
  type Client, type OpMix, type OpType, type ScenarioConfig,
} from './types'

export const LIMITS = {
  tellers: { min: 1, max: 8 },
  accounts: { min: 2, max: 12 },
  clients: { min: 1, max: 300 },
  initialBalance: { min: 0, max: 10_000_000 },
  arrivalIntervalMs: { min: 0, max: 2000 },
  criticalWindowMs: { min: 0, max: 200 },
  durationScalePct: { min: 10, max: 1000 },
  agingMs: { min: 10, max: 10_000 },
  patienceMs: { min: 10, max: 60_000 },
}

/**
 * Paciência sugerida para uma config: 4 atendimentos médios (duração esperada pela
 * mistura de operações, mais a janela crítica), arredondada para 10 ms.
 */
export function suggestedPatienceMs(config: Omit<ScenarioConfig, 'patienceMs'>): number {
  const weights = OPS.map((op) => Math.max(0, config.mix[op.key]))
  const total = weights.reduce((a, b) => a + b, 0)
  const avgMs = total > 0
    ? OPS.reduce((sum, op, i) => sum + (weights[i] / total) * op.baseMs, 0)
    : OPS[OP_TRANSFER].baseMs
  const serviceMs = (avgMs * config.durationScalePct) / 100 + config.criticalWindowMs
  return Math.max(10, Math.round((serviceMs * 4) / 10) * 10)
}

function withPatience(config: Omit<ScenarioConfig, 'patienceMs'>): ScenarioConfig {
  return { ...config, patienceMs: suggestedPatienceMs(config) }
}

export const DEFAULT_CONFIG: ScenarioConfig = withPatience({
  tellers: 4,
  accounts: 5,
  initialBalance: 100_000,
  clients: 40,
  mix: { deposit: 20, withdraw: 20, transfer: 35, bill: 15, loan: 10 },
  preferentialPct: 30,
  arrivalIntervalMs: 15,
  criticalWindowMs: 15,
  durationScalePct: 100,
  agingMs: 120,
  seed: 2026,
})

export interface Preset {
  key: string
  name: string
  description: string
  config: ScenarioConfig
}

export const PRESETS: Preset[] = [
  {
    key: 'default',
    name: 'Padrão',
    description: 'Mistura equilibrada de operações, 4 caixas e 5 contas.',
    config: DEFAULT_CONFIG,
  },
  {
    key: 'race',
    name: 'Corrida (race condition)',
    description: 'Muitas transferências sobre poucas contas: sem lock, o dinheiro some ou aparece.',
    config: withPatience({
      ...DEFAULT_CONFIG,
      accounts: 3,
      clients: 60,
      mix: { deposit: 15, withdraw: 10, transfer: 70, bill: 5, loan: 0 },
      arrivalIntervalMs: 5,
      criticalWindowMs: 20,
      durationScalePct: 50,
      seed: 7,
    }),
  },
  {
    key: 'deadlock',
    name: 'Deadlock',
    description: 'Só 2 contas e 100% de transferências cruzadas (A→B e B→A).',
    config: withPatience({
      ...DEFAULT_CONFIG,
      accounts: 2,
      clients: 40,
      mix: { deposit: 0, withdraw: 0, transfer: 100, bill: 0, loan: 0 },
      arrivalIntervalMs: 5,
      criticalWindowMs: 20,
      durationScalePct: 50,
      seed: 13,
    }),
  },
  {
    key: 'starvation',
    name: 'Starvation',
    description: 'Dois terços dos clientes são preferenciais e a fila nunca esvazia: os comuns ficam para trás e desistem.',
    config: withPatience({
      ...DEFAULT_CONFIG,
      tellers: 3,
      clients: 70,
      mix: { deposit: 25, withdraw: 25, transfer: 25, bill: 15, loan: 10 },
      preferentialPct: 65,
      arrivalIntervalMs: 30,
      agingMs: 100,
      seed: 42,
    }),
  },
]

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}

/** Garante que a config está dentro dos limites suportados. */
export function sanitizeConfig(raw: ScenarioConfig): ScenarioConfig {
  const mix: OpMix = { ...raw.mix }
  for (const op of OPS) mix[op.key] = clamp(Math.round(mix[op.key]), 0, 100)
  return {
    tellers: clamp(Math.round(raw.tellers), LIMITS.tellers.min, LIMITS.tellers.max),
    accounts: clamp(Math.round(raw.accounts), LIMITS.accounts.min, LIMITS.accounts.max),
    initialBalance: clamp(Math.round(raw.initialBalance), LIMITS.initialBalance.min, LIMITS.initialBalance.max),
    clients: clamp(Math.round(raw.clients), LIMITS.clients.min, LIMITS.clients.max),
    mix,
    preferentialPct: clamp(Math.round(raw.preferentialPct), 0, 100),
    arrivalIntervalMs: clamp(raw.arrivalIntervalMs, LIMITS.arrivalIntervalMs.min, LIMITS.arrivalIntervalMs.max),
    criticalWindowMs: clamp(raw.criticalWindowMs, LIMITS.criticalWindowMs.min, LIMITS.criticalWindowMs.max),
    durationScalePct: clamp(raw.durationScalePct, LIMITS.durationScalePct.min, LIMITS.durationScalePct.max),
    agingMs: clamp(raw.agingMs, LIMITS.agingMs.min, LIMITS.agingMs.max),
    // cenários salvos antes da desistência não têm paciência: usa a sugerida
    patienceMs: Number.isFinite(raw.patienceMs)
      ? clamp(raw.patienceMs, LIMITS.patienceMs.min, LIMITS.patienceMs.max)
      : suggestedPatienceMs(raw),
    seed: Math.round(raw.seed) >>> 0,
  }
}

/** Id estável do cenário: muda se qualquer parâmetro mudar. */
export function scenarioId(config: ScenarioConfig): string {
  const c = sanitizeConfig(config)
  return hashString(
    JSON.stringify([
      c.tellers, c.accounts, c.initialBalance, c.clients,
      c.mix.deposit, c.mix.withdraw, c.mix.transfer, c.mix.bill, c.mix.loan,
      c.preferentialPct, c.arrivalIntervalMs, c.criticalWindowMs, c.durationScalePct, c.agingMs, c.seed, c.patienceMs,
    ]),
  )
}

function pickOp(mix: OpMix, r: number): OpType {
  const weights = OPS.map((op) => Math.max(0, mix[op.key]))
  const total = weights.reduce((a, b) => a + b, 0)
  if (total <= 0) return OP_TRANSFER
  let acc = 0
  for (let i = 0; i < weights.length; i++) {
    acc += weights[i] / total
    if (r < acc) return i as OpType
  }
  return (weights.length - 1) as OpType
}

/**
 * Gera a fila de clientes a partir da config. É uma função pura:
 * a mesma config (incluindo a seed) gera sempre exatamente a mesma fila.
 */
export function generateQueue(rawConfig: ScenarioConfig): Client[] {
  const config = sanitizeConfig(rawConfig)
  const rand = mulberry32(config.seed)
  // gerador separado para o tipo de preferencial: não muda os campos das filas que já existiam
  const randKind = mulberry32(config.seed ^ 0x9e3779b9)
  const clients: Client[] = []
  let arrivalMs = 0

  for (let id = 0; id < config.clients; id++) {
    // Sempre consome a mesma quantidade de números aleatórios por cliente,
    // para que mudar um parâmetro não embaralhe os demais campos.
    const rArrival = rand()
    const rPriority = rand()
    const rOp = rand()
    const rFrom = rand()
    const rTo = rand()
    const rAmount = rand()
    const rDuration = rand()
    const rKind = randKind()

    if (id > 0) arrivalMs += config.arrivalIntervalMs * (0.5 + rArrival)
    const op = pickOp(config.mix, rOp)
    const from = Math.min(config.accounts - 1, Math.floor(rFrom * config.accounts))
    let to = -1
    if (op === OP_TRANSFER) {
      // sorteia entre as outras contas, para origem e destino nunca coincidirem
      const offset = 1 + Math.min(config.accounts - 2, Math.floor(rTo * (config.accounts - 1)))
      to = (from + offset) % config.accounts
    }
    // valores entre 5% e 40% do saldo inicial (mínimo de R$ 10,00), em centavos
    const base = Math.max(1000, config.initialBalance)
    const amount = Math.max(100, Math.round((base * (0.05 + 0.35 * rAmount)) / 100) * 100)
    const durationMs = OPS[op].baseMs * (config.durationScalePct / 100) * (0.75 + 0.5 * rDuration)

    const priority = rPriority * 100 < config.preferentialPct ? 1 : 0
    clients.push({
      id,
      arrivalUs: Math.round(arrivalMs * 1000),
      priority,
      op,
      from,
      to,
      amount,
      durationUs: Math.max(1000, Math.round(durationMs * 1000)),
      kind: priority === 0 ? KIND_NONE : rKind < ELDERLY_SHARE ? KIND_ELDERLY : KIND_INFANT,
    })
  }
  return clients
}
