// Tipos e constantes compartilhados entre a thread principal e os workers.

export const OP_DEPOSIT = 0
export const OP_WITHDRAW = 1
export const OP_TRANSFER = 2
export const OP_BILL = 3
export const OP_LOAN = 4
export type OpType = 0 | 1 | 2 | 3 | 4

export interface OpInfo {
  key: 'deposit' | 'withdraw' | 'transfer' | 'bill' | 'loan'
  label: string
  short: string
  icon: string
  /** duração base do atendimento, em ms (antes da escala e do jitter) */
  baseMs: number
}

export const OPS: OpInfo[] = [
  { key: 'deposit', label: 'Depósito', short: 'DEP', icon: '💵', baseMs: 60 },
  { key: 'withdraw', label: 'Saque', short: 'SAQ', icon: '🏧', baseMs: 60 },
  { key: 'transfer', label: 'Transferência', short: 'TRF', icon: '🔁', baseMs: 120 },
  { key: 'bill', label: 'Boleto', short: 'BOL', icon: '🧾', baseMs: 120 },
  { key: 'loan', label: 'Financiamento', short: 'FIN', icon: '🏠', baseMs: 300 },
]

export type Algorithm = 'fcfs' | 'sjf' | 'priority' | 'aging'
export const ALGORITHMS: Algorithm[] = ['fcfs', 'sjf', 'priority', 'aging']
export const ALGORITHM_LABEL: Record<Algorithm, string> = {
  fcfs: 'FCFS',
  sjf: 'SJF',
  priority: 'Prioridade',
  aging: 'Prioridade + Aging',
}
export const ALGORITHM_CODE: Record<Algorithm, number> = { fcfs: 0, sjf: 1, priority: 2, aging: 3 }

export type LockMode = 'none' | 'global' | 'ordered' | 'unordered'
export const LOCK_MODES: LockMode[] = ['none', 'global', 'ordered', 'unordered']
export const LOCK_MODE_LABEL: Record<LockMode, string> = {
  none: 'Sem lock',
  global: 'Lock global',
  ordered: 'Por cofre (ordenado)',
  unordered: 'Por cofre (sem ordem)',
}

export interface OpMix {
  deposit: number
  withdraw: number
  transfer: number
  bill: number
  loan: number
}

export interface ScenarioConfig {
  tellers: number
  accounts: number
  /** saldo inicial de cada conta, em centavos */
  initialBalance: number
  clients: number
  /** pesos (%) de cada tipo de operação; são normalizados na geração */
  mix: OpMix
  preferentialPct: number
  /** intervalo médio entre chegadas, em ms */
  arrivalIntervalMs: number
  /** tempo entre ler e escrever o saldo, em ms */
  criticalWindowMs: number
  /** escala das durações de atendimento, em % */
  durationScalePct: number
  /** no aging, a cada `agingMs` de espera o cliente ganha 1 nível de prioridade */
  agingMs: number
  seed: number
}

export interface Client {
  id: number
  /** chegada, em microssegundos desde o início da execução */
  arrivalUs: number
  /** 1 = preferencial, 0 = comum */
  priority: 0 | 1
  op: OpType
  from: number
  /** conta de destino (só em transferências; senão -1) */
  to: number
  /** valor em centavos */
  amount: number
  /** duração estimada do atendimento, em microssegundos */
  durationUs: number
}

export type RunStatus = 'completed' | 'deadlock' | 'stopped'
export const STATUS_LABEL: Record<RunStatus, string> = {
  completed: 'Concluída',
  deadlock: 'Deadlock',
  stopped: 'Interrompida',
}

export const RESULT_PENDING = 0
export const RESULT_OK = 1
export const RESULT_REFUSED = 2

/** O que aconteceu com um cliente durante a execução (tempos em µs; 0 = não aconteceu). */
export interface ClientTrace {
  teller: number
  startUs: number
  endUs: number
  result: number
  /** id do 1º lock pedido (-1 = nenhum). O lock global tem id = nº de contas. */
  lock1: number
  /** início da espera pelo 1º lock (0 = pegou sem esperar) */
  wait1Us: number
  acq1Us: number
  lock2: number
  wait2Us: number
  acq2Us: number
  releaseUs: number
}

/** Uma escrita de saldo: [tempoUs, conta, novoSaldo, deltaEsperado]. */
export type WriteEntry = [number, number, number, number]

export interface Timeline {
  /** instante final da execução (ou "agora", se ainda estiver rodando) */
  endUs: number
  clients: ClientTrace[]
  writes: WriteEntry[]
  /** saldos reais lidos da memória compartilhada */
  balances: number[]
  finished: boolean
}

export interface CycleStep {
  teller: number
  /** lock que esse caixa espera, em posse do próximo caixa do ciclo */
  lock: number
}

export interface DeadlockInfo {
  atUs: number
  reason: 'cycle' | 'timeout'
  cycle: CycleStep[]
  /** todos os caixas bloqueados no momento da detecção */
  blockedTellers: number[]
}

export interface Metrics {
  makespanMs: number
  total: number
  served: number
  refused: number
  waitAvgMs: number
  waitMaxMs: number
  waitMinMs: number
  waitPrefAvgMs: number
  waitCommonAvgMs: number
  waitCommonMaxMs: number
  turnaroundAvgMs: number
  throughput: number
  utilization: number[]
  lockWaitMs: number[]
  lockWaitTotalMs: number
  expectedTotal: number
  realTotal: number
  /** real − esperado, em centavos */
  inconsistentCents: number
  wrongAccounts: number
}

export interface RunRecord {
  id: string
  createdAt: string
  scenarioId: string
  scenarioName: string
  config: ScenarioConfig
  algorithm: Algorithm
  lockMode: LockMode
  status: RunStatus
  metrics: Metrics
  timeline: PackedTimeline
  deadlock?: DeadlockInfo
}

/** Timeline compactada em arrays planos, para caber melhor no localStorage. */
export interface PackedTimeline {
  endUs: number
  c: number[]
  w: number[]
  b: number[]
}

export interface SavedScenario {
  id: string
  name: string
  config: ScenarioConfig
  savedAt: string
}

export function accountName(i: number): string {
  return String.fromCharCode(65 + i)
}

export function lockName(lock: number, accounts: number): string {
  return lock >= accounts ? 'Lock Global' : `Conta ${accountName(lock)}`
}

export function formatMoney(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const whole = Math.floor(abs / 100).toLocaleString('pt-BR')
  return `${sign}R$ ${whole},${String(abs % 100).padStart(2, '0')}`
}
