// A "timeline" é o registro do que aconteceu numa execução. A tela inteira é desenhada
// como uma função pura de (timeline, instante t): por isso dá para assistir em câmera
// lenta, voltar no tempo e reabrir execuções salvas sem interferir no benchmark.

import {
  C_ACQ1, C_ACQ2, C_END, C_LOCK1, C_LOCK2, C_RELEASE, C_RESULT, C_START, C_STATUS, C_TELLER,
  C_WAIT1, C_WAIT2, CLIENT_WAITING, T_LOG_COUNT,
  type Layout,
} from './layout'
import {
  OP_TRANSFER,
  type Client, type ClientTrace, type DeadlockInfo, type PackedTimeline, type ScenarioConfig,
  type Timeline, type WriteEntry,
} from './types'

/** Copia da memória compartilhada tudo o que os caixas registraram até agora. */
export function snapshotTimeline(mem: Int32Array, layout: Layout, endUs: number, finished: boolean): Timeline {
  const clients: ClientTrace[] = []
  for (let i = 0; i < layout.clients; i++) {
    const base = layout.client(i)
    const taken = Atomics.load(mem, base + C_STATUS) !== CLIENT_WAITING
    clients.push({
      teller: taken ? Atomics.load(mem, base + C_TELLER) : -1,
      startUs: taken ? Atomics.load(mem, base + C_START) : 0,
      endUs: Atomics.load(mem, base + C_END),
      result: Atomics.load(mem, base + C_RESULT),
      lock1: Atomics.load(mem, base + C_LOCK1) - 1,
      wait1Us: Atomics.load(mem, base + C_WAIT1),
      acq1Us: Atomics.load(mem, base + C_ACQ1),
      lock2: Atomics.load(mem, base + C_LOCK2) - 1,
      wait2Us: Atomics.load(mem, base + C_WAIT2),
      acq2Us: Atomics.load(mem, base + C_ACQ2),
      releaseUs: Atomics.load(mem, base + C_RELEASE),
    })
  }

  const writes: WriteEntry[] = []
  for (let t = 0; t < layout.tellers; t++) {
    const count = Atomics.load(mem, layout.teller(t) + T_LOG_COUNT)
    for (let e = 0; e < count; e++) {
      const at = layout.log(t, e)
      writes.push([mem[at], mem[at + 1], mem[at + 2], mem[at + 3]])
    }
  }
  writes.sort((a, b) => a[0] - b[0])

  const balances: number[] = []
  for (let a = 0; a < layout.accounts; a++) balances.push(Atomics.load(mem, layout.balance(a)))

  return { endUs, clients, writes, balances, finished }
}

const TRACE_FIELDS = 11

export function packTimeline(timeline: Timeline): PackedTimeline {
  const c: number[] = []
  for (const t of timeline.clients) {
    c.push(t.teller, t.startUs, t.endUs, t.result, t.lock1, t.wait1Us, t.acq1Us, t.lock2, t.wait2Us, t.acq2Us, t.releaseUs)
  }
  return { endUs: timeline.endUs, c, w: timeline.writes.flat(), b: timeline.balances }
}

export function unpackTimeline(packed: PackedTimeline): Timeline {
  const clients: ClientTrace[] = []
  for (let i = 0; i + TRACE_FIELDS <= packed.c.length; i += TRACE_FIELDS) {
    const [teller, startUs, endUs, result, lock1, wait1Us, acq1Us, lock2, wait2Us, acq2Us, releaseUs] =
      packed.c.slice(i, i + TRACE_FIELDS)
    clients.push({ teller, startUs, endUs, result, lock1, wait1Us, acq1Us, lock2, wait2Us, acq2Us, releaseUs })
  }
  const writes: WriteEntry[] = []
  for (let i = 0; i + 4 <= packed.w.length; i += 4) {
    writes.push([packed.w[i], packed.w[i + 1], packed.w[i + 2], packed.w[i + 3]])
  }
  return { endUs: packed.endUs, clients, writes, balances: packed.b, finished: true }
}

// ---------------------------------------------------------------------------
// Estado da agência em um instante t
// ---------------------------------------------------------------------------

export type TellerViewState = 'idle' | 'serving' | 'waiting' | 'deadlock' | 'finished'

export interface TellerView {
  state: TellerViewState
  client: number
  progress: number
  waitingFor: number
  holding: number[]
  served: number
}

export interface AccountView {
  balance: number
  expected: number
  owner: number
  waiters: number[]
  inCycle: boolean
}

export interface QueueItemView {
  client: number
  waitUs: number
}

export interface TransferFx {
  client: number
  from: number
  to: number
  amount: number
  /** 0..1 */
  progress: number
}

export interface AgencyView {
  tUs: number
  tellers: TellerView[]
  accounts: AccountView[]
  globalLock: { owner: number; waiters: number[] }
  queue: QueueItemView[]
  notArrived: number
  done: number
  refused: number
  expectedTotal: number
  realTotal: number
  transfers: TransferFx[]
  deadlockVisible: boolean
}

function waitingAt(start: number, acquired: number, t: number): boolean {
  return start > 0 && start <= t && (acquired === 0 || t < acquired)
}

function holdingAt(acquired: number, released: number, t: number): boolean {
  return acquired > 0 && acquired <= t && (released === 0 || t < released)
}

/** Reconstrói o estado de caixas, contas e fila no instante `tUs`. */
export function viewAt(
  config: ScenarioConfig,
  clients: Client[],
  timeline: Timeline,
  tUs: number,
  deadlock: DeadlockInfo | undefined,
  transferFxUs: number,
): AgencyView {
  const atEnd = timeline.finished && tUs >= timeline.endUs
  const deadlockVisible = !!deadlock && tUs >= deadlock.atUs
  const cycleTellers = new Set(deadlock?.cycle.map((s) => s.teller))
  const cycleLocks = new Set(deadlock?.cycle.map((s) => s.lock))
  const blocked = new Set(deadlock?.blockedTellers)

  const tellers: TellerView[] = Array.from({ length: config.tellers }, () => ({
    state: atEnd && !deadlock ? 'finished' : 'idle',
    client: -1,
    progress: 0,
    waitingFor: -1,
    holding: [],
    served: 0,
  }))
  const accounts: AccountView[] = Array.from({ length: config.accounts }, (_, a) => ({
    balance: config.initialBalance,
    expected: config.initialBalance,
    owner: -1,
    waiters: [],
    inCycle: deadlockVisible && cycleLocks.has(a),
  }))
  const globalLock = { owner: -1, waiters: [] as number[] }
  const lockView = (lock: number) => (lock >= config.accounts ? globalLock : accounts[lock])

  const queue: QueueItemView[] = []
  const transfers: TransferFx[] = []
  let notArrived = 0
  let done = 0
  let refused = 0

  timeline.clients.forEach((trace, i) => {
    const client = clients[i]
    if (!client) return
    if (client.arrivalUs > tUs) {
      notArrived++
      return
    }
    if (trace.startUs === 0 || trace.startUs > tUs) {
      queue.push({ client: i, waitUs: tUs - client.arrivalUs })
      return
    }
    const teller = tellers[trace.teller]
    if (!teller) return
    if (trace.endUs > 0 && trace.endUs <= tUs) {
      done++
      teller.served++
      if (trace.result === 2) refused++
      return
    }
    // em atendimento no instante t
    teller.client = i
    teller.state = 'serving'
    teller.progress = Math.min(1, (tUs - trace.startUs) / (client.durationUs + config.criticalWindowMs * 1000))
    if (waitingAt(trace.wait1Us, trace.acq1Us, tUs)) teller.waitingFor = trace.lock1
    if (waitingAt(trace.wait2Us, trace.acq2Us, tUs)) teller.waitingFor = trace.lock2
    if (teller.waitingFor >= 0) {
      teller.state = 'waiting'
      lockView(teller.waitingFor).waiters.push(trace.teller)
    }
    if (trace.lock1 >= 0 && holdingAt(trace.acq1Us, trace.releaseUs, tUs)) {
      teller.holding.push(trace.lock1)
      lockView(trace.lock1).owner = trace.teller
    }
    if (trace.lock2 >= 0 && holdingAt(trace.acq2Us, trace.releaseUs, tUs)) {
      teller.holding.push(trace.lock2)
      lockView(trace.lock2).owner = trace.teller
    }
    if (deadlockVisible && (cycleTellers.has(trace.teller) || blocked.has(trace.teller))) teller.state = 'deadlock'
  })
  queue.sort((a, b) => clients[a.client].arrivalUs - clients[b.client].arrivalUs)

  for (const [at, account, newBalance, delta] of timeline.writes) {
    if (at > tUs) break
    accounts[account].balance = newBalance
    accounts[account].expected += delta
  }
  // no final, vale o que está de fato na memória compartilhada
  if (atEnd) timeline.balances.forEach((balance, a) => (accounts[a].balance = balance))

  if (transferFxUs > 0) {
    timeline.clients.forEach((trace, i) => {
      const client = clients[i]
      if (client?.op !== OP_TRANSFER || trace.result !== 1 || trace.endUs === 0) return
      const elapsed = tUs - trace.endUs
      if (elapsed >= 0 && elapsed < transferFxUs) {
        transfers.push({ client: i, from: client.from, to: client.to, amount: client.amount, progress: elapsed / transferFxUs })
      }
    })
  }

  return {
    tUs,
    tellers,
    accounts,
    globalLock,
    queue,
    notArrived,
    done,
    refused,
    expectedTotal: accounts.reduce((sum, a) => sum + a.expected, 0),
    realTotal: accounts.reduce((sum, a) => sum + a.balance, 0),
    transfers,
    deadlockVisible,
  }
}
