/// <reference lib="webworker" />
// Um caixa da agência. Cada instância deste arquivo roda em um Web Worker,
// ou seja, em uma thread real do sistema operacional.

import {
  createLayout,
  type Layout,
  CLIENT_DONE, CLIENT_TAKEN, CLIENT_WAITING,
  C_ACQ1, C_ACQ2, C_AMOUNT, C_ARRIVAL, C_DURATION, C_END, C_FROM, C_LOCK1, C_LOCK2, C_OP,
  C_PRIORITY, C_RELEASE, C_RESULT, C_START, C_STATUS, C_TELLER, C_TO, C_WAIT1, C_WAIT2,
  H_DONE, H_PROGRESS, H_QUEUE_LOCK, H_STOP,
  L_OWNER, L_STATE,
  TELLER_FINISHED, TELLER_IDLE, TELLER_SERVING, TELLER_WAITING_LOCK,
  T_CLIENT, T_HOLD1, T_HOLD2, T_LOCK_WAIT, T_LOG_COUNT, T_SERVED, T_SLEEP, T_STATE, T_WAITING,
} from '../sim/layout'
import { lock, tryLock, unlock } from '../sim/mutex'
import { pickNext, type ReadyClient } from '../sim/scheduler'
import {
  OP_DEPOSIT, OP_LOAN, OP_TRANSFER, RESULT_OK, RESULT_REFUSED,
  type Algorithm, type LockMode,
} from '../sim/types'

export interface TellerInit {
  type: 'init'
  buffer: SharedArrayBuffer
  tellerId: number
  accounts: number
  tellers: number
  clients: number
  algorithm: Algorithm
  lockMode: LockMode
  criticalWindowUs: number
  agingUs: number
}

export interface TellerStart {
  type: 'start'
  /** instante zero da execução, em ms desde a época (performance.timeOrigin + now) */
  startEpochMs: number
}

let mem: Int32Array
let layout: Layout
let init: TellerInit
let me = 0 // início do bloco deste caixa na memória
let startEpochMs = 0

/** Microssegundos desde o início da execução (nunca 0, que significa "não aconteceu"). */
function nowUs(): number {
  return Math.max(1, Math.round((performance.timeOrigin + performance.now() - startEpochMs) * 1000))
}

/** Dorme até o instante dado. Atomics.wait numa célula que ninguém notifica = sleep. */
function sleepUntil(targetUs: number): void {
  for (;;) {
    const remainingUs = targetUs - nowUs()
    if (remainingUs <= 0) return
    Atomics.wait(mem, me + T_SLEEP, 0, remainingUs / 1000)
  }
}

function sleepFor(durationUs: number): void {
  if (durationUs > 0) sleepUntil(nowUs() + durationUs)
}

/** Retira o próximo cliente da fila. A retirada é sempre protegida pelo lock da fila. */
function takeNextClient(): { client: number; nextArrivalUs: number } {
  const ready: ReadyClient[] = []
  let nextArrivalUs = -1
  let picked = -1

  lock(mem, H_QUEUE_LOCK)
  const now = nowUs()
  for (let i = 0; i < layout.clients; i++) {
    const base = layout.client(i)
    if (Atomics.load(mem, base + C_STATUS) !== CLIENT_WAITING) continue
    const arrivalUs = mem[base + C_ARRIVAL]
    if (arrivalUs <= now) {
      ready.push({ index: i, arrivalUs, priority: mem[base + C_PRIORITY], durationUs: mem[base + C_DURATION] })
    } else if (nextArrivalUs < 0 || arrivalUs < nextArrivalUs) {
      nextArrivalUs = arrivalUs
    }
  }
  const next = pickNext(init.algorithm, ready, { nowUs: now, agingUs: init.agingUs })
  if (next) {
    picked = next.index
    const base = layout.client(picked)
    Atomics.store(mem, base + C_TELLER, init.tellerId)
    Atomics.store(mem, base + C_START, now)
    Atomics.store(mem, base + C_STATUS, CLIENT_TAKEN)
  }
  unlock(mem, H_QUEUE_LOCK)

  return { client: picked, nextArrivalUs }
}

/** Adquire um lock de conta (ou o global) e publica na memória o que espera e o que possui. */
function acquire(client: number, slot: 1 | 2, lockId: number): void {
  const base = layout.client(client)
  const cell = layout.lock(lockId)
  Atomics.store(mem, base + (slot === 1 ? C_LOCK1 : C_LOCK2), lockId + 1)

  if (!tryLock(mem, cell + L_STATE)) {
    const waitStart = nowUs()
    Atomics.store(mem, base + (slot === 1 ? C_WAIT1 : C_WAIT2), waitStart)
    Atomics.store(mem, me + T_WAITING, lockId + 1)
    Atomics.store(mem, me + T_STATE, TELLER_WAITING_LOCK)
    lock(mem, cell + L_STATE) // em deadlock, a thread fica presa aqui para sempre
    Atomics.store(mem, me + T_STATE, TELLER_SERVING)
    Atomics.store(mem, me + T_WAITING, 0)
    Atomics.add(mem, me + T_LOCK_WAIT, nowUs() - waitStart)
  }

  Atomics.store(mem, cell + L_OWNER, init.tellerId + 1)
  Atomics.store(mem, me + (slot === 1 ? T_HOLD1 : T_HOLD2), lockId + 1)
  Atomics.store(mem, base + (slot === 1 ? C_ACQ1 : C_ACQ2), nowUs())
  Atomics.add(mem, H_PROGRESS, 1)
}

function release(slot: 1 | 2, lockId: number): void {
  const cell = layout.lock(lockId)
  Atomics.store(mem, me + (slot === 1 ? T_HOLD1 : T_HOLD2), 0)
  Atomics.store(mem, cell + L_OWNER, 0)
  unlock(mem, cell + L_STATE)
}

/** Grava o novo saldo e registra a escrita no log deste caixa. */
function writeBalance(account: number, newBalance: number, expectedDelta: number): void {
  Atomics.store(mem, layout.balance(account), newBalance)
  const count = mem[me + T_LOG_COUNT]
  const entry = layout.log(init.tellerId, count)
  Atomics.store(mem, entry, nowUs())
  Atomics.store(mem, entry + 1, account)
  Atomics.store(mem, entry + 2, newBalance)
  Atomics.store(mem, entry + 3, expectedDelta)
  Atomics.store(mem, me + T_LOG_COUNT, count + 1) // só publica a entrada depois de completa
}

/** Operação sobre uma única conta: ler saldo, dormir a janela crítica, escrever. */
function singleAccountOperation(client: number, op: number, account: number, amount: number): number {
  const lockId = init.lockMode === 'none' ? -1 : init.lockMode === 'global' ? layout.globalLock : account
  if (lockId >= 0) acquire(client, 1, lockId)

  const balance = Atomics.load(mem, layout.balance(account))
  sleepFor(init.criticalWindowUs)

  let result = RESULT_OK
  if (op === OP_DEPOSIT) {
    writeBalance(account, balance + amount, amount)
  } else if (op === OP_LOAN) {
    // análise de financiamento: só consulta o saldo, não movimenta dinheiro
    if (balance < amount) result = RESULT_REFUSED
  } else if (balance >= amount) {
    writeBalance(account, balance - amount, -amount) // saque ou boleto
  } else {
    result = RESULT_REFUSED // saldo insuficiente: nunca deixa a conta negativa
  }

  if (lockId >= 0) {
    Atomics.store(mem, layout.client(client) + C_RELEASE, nowUs())
    release(1, lockId)
  }
  return result
}

function transfer(client: number, from: number, to: number, amount: number): number {
  const mode = init.lockMode
  const half = Math.floor(init.criticalWindowUs / 2)
  let first = -1
  let second = -1

  if (mode === 'global') {
    first = layout.globalLock
  } else if (mode === 'ordered') {
    // sempre a conta de menor id primeiro: impossível formar um ciclo de espera
    first = Math.min(from, to)
    second = Math.max(from, to)
  } else if (mode === 'unordered') {
    // origem e depois destino: A→B e B→A simultâneos travam um ao outro
    first = from
    second = to
  }

  if (first >= 0) acquire(client, 1, first)
  if (second >= 0) {
    sleepFor(half)
    acquire(client, 2, second)
  }

  const fromBalance = Atomics.load(mem, layout.balance(from))
  const toBalance = Atomics.load(mem, layout.balance(to))
  sleepFor(second >= 0 ? init.criticalWindowUs - half : init.criticalWindowUs)

  let result = RESULT_REFUSED
  if (fromBalance >= amount) {
    writeBalance(from, fromBalance - amount, -amount)
    writeBalance(to, toBalance + amount, amount)
    result = RESULT_OK
  }

  if (first >= 0) Atomics.store(mem, layout.client(client) + C_RELEASE, nowUs())
  if (second >= 0) release(2, second)
  if (first >= 0) release(1, first)
  return result
}

function serve(client: number): void {
  const base = layout.client(client)
  const op = mem[base + C_OP]
  Atomics.store(mem, me + T_CLIENT, client + 1)
  Atomics.store(mem, me + T_STATE, TELLER_SERVING)

  sleepFor(mem[base + C_DURATION]) // atendimento: trabalho fora da seção crítica

  const result =
    op === OP_TRANSFER
      ? transfer(client, mem[base + C_FROM], mem[base + C_TO], mem[base + C_AMOUNT])
      : singleAccountOperation(client, op, mem[base + C_FROM], mem[base + C_AMOUNT])

  Atomics.store(mem, base + C_RESULT, result)
  Atomics.store(mem, base + C_END, nowUs())
  Atomics.store(mem, base + C_STATUS, CLIENT_DONE)
  Atomics.add(mem, me + T_SERVED, 1)
  Atomics.add(mem, H_DONE, 1)
  Atomics.add(mem, H_PROGRESS, 1)
  Atomics.store(mem, me + T_CLIENT, 0)
  Atomics.store(mem, me + T_STATE, TELLER_IDLE)
}

function run(): void {
  sleepUntil(1) // todos os caixas começam juntos no instante zero
  while (Atomics.load(mem, H_STOP) === 0) {
    const { client, nextArrivalUs } = takeNextClient()
    if (client >= 0) {
      serve(client)
    } else if (nextArrivalUs < 0) {
      break // ninguém na fila e ninguém para chegar
    } else {
      // fila vazia: dorme até a próxima chegada (com teto, para notar um pedido de parada)
      sleepUntil(Math.min(nextArrivalUs, nowUs() + 20_000))
    }
  }
  Atomics.store(mem, me + T_STATE, TELLER_FINISHED)
  self.postMessage({ type: 'finished', tellerId: init.tellerId })
}

self.onmessage = (event: MessageEvent<TellerInit | TellerStart>) => {
  const message = event.data
  if (message.type === 'init') {
    init = message
    mem = new Int32Array(message.buffer)
    layout = createLayout(message.accounts, message.tellers, message.clients)
    me = layout.teller(message.tellerId)
    self.postMessage({ type: 'ready', tellerId: message.tellerId })
  } else {
    startEpochMs = message.startEpochMs
    run()
  }
}
