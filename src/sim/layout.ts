// Layout da memória compartilhada (um único Int32Array sobre um SharedArrayBuffer).
//
//   [ cabeçalho | contas | locks | caixas | clientes | log de escritas por caixa ]
//
// Todos os tempos são microssegundos desde o início da execução; valores em centavos.

import type { Client } from './types'

// --- cabeçalho ---
export const H_STOP = 0 // 1 = a thread principal pediu para parar
export const H_QUEUE_LOCK = 1 // mutex da fila de clientes
export const H_DONE = 2 // clientes concluídos
export const H_PROGRESS = 3 // sobe a cada lock adquirido ou cliente concluído (usado pelo watchdog)
const HEADER_SIZE = 8

// --- lock (2 células cada): contas 0..N-1 e, no índice N, o lock global ---
export const L_STATE = 0 // 0 livre, 1 travado, 2 travado com gente esperando
export const L_OWNER = 1 // caixa dono + 1 (0 = ninguém)
const LOCK_STRIDE = 2

// --- caixa ---
export const T_STATE = 0
export const T_CLIENT = 1 // cliente atual + 1 (0 = nenhum)
export const T_WAITING = 2 // lock que está esperando + 1 (0 = nenhum)
export const T_HOLD1 = 3 // 1º lock em posse + 1
export const T_HOLD2 = 4 // 2º lock em posse + 1
export const T_LOCK_WAIT = 5 // tempo total esperando lock (µs)
export const T_SERVED = 6
export const T_SLEEP = 7 // célula que ninguém notifica: Atomics.wait nela = sleep
export const T_LOG_COUNT = 8
const TELLER_STRIDE = 12

export const TELLER_IDLE = 0
export const TELLER_SERVING = 1
export const TELLER_WAITING_LOCK = 2
export const TELLER_FINISHED = 3

// --- cliente ---
export const C_ARRIVAL = 0
export const C_PRIORITY = 1
export const C_OP = 2
export const C_FROM = 3
export const C_TO = 4
export const C_AMOUNT = 5
export const C_DURATION = 6
export const C_STATUS = 7
export const C_TELLER = 8
export const C_START = 9
export const C_END = 10
export const C_RESULT = 11
export const C_LOCK1 = 12 // lock + 1
export const C_WAIT1 = 13
export const C_ACQ1 = 14
export const C_LOCK2 = 15
export const C_WAIT2 = 16
export const C_ACQ2 = 17
export const C_RELEASE = 18
const CLIENT_STRIDE = 20

export const CLIENT_WAITING = 0
export const CLIENT_TAKEN = 1
export const CLIENT_DONE = 2

// --- log de escritas: [tempo, conta, novoSaldo, deltaEsperado] ---
export const LOG_STRIDE = 4

export interface Layout {
  accounts: number
  tellers: number
  clients: number
  /** número de locks = contas + 1 (o último é o lock global) */
  locks: number
  globalLock: number
  logCapacity: number
  size: number
  balance(account: number): number
  lock(lock: number): number
  teller(teller: number): number
  client(client: number): number
  log(teller: number, entry: number): number
}

export function createLayout(accounts: number, tellers: number, clients: number): Layout {
  const locks = accounts + 1
  // no pior caso um único caixa atende todos, e cada cliente faz até 2 escritas
  const logCapacity = clients * 2 + 2
  const balanceBase = HEADER_SIZE
  const lockBase = balanceBase + accounts
  const tellerBase = lockBase + locks * LOCK_STRIDE
  const clientBase = tellerBase + tellers * TELLER_STRIDE
  const logBase = clientBase + clients * CLIENT_STRIDE
  const size = logBase + tellers * logCapacity * LOG_STRIDE
  return {
    accounts,
    tellers,
    clients,
    locks,
    globalLock: accounts,
    logCapacity,
    size,
    balance: (account) => balanceBase + account,
    lock: (lock) => lockBase + lock * LOCK_STRIDE,
    teller: (teller) => tellerBase + teller * TELLER_STRIDE,
    client: (client) => clientBase + client * CLIENT_STRIDE,
    log: (teller, entry) => logBase + (teller * logCapacity + entry) * LOG_STRIDE,
  }
}

/** Aloca a memória compartilhada e grava o estado inicial (saldos e fila). */
export function createSharedMemory(layout: Layout, initialBalance: number, clients: Client[]): Int32Array {
  const mem = new Int32Array(new SharedArrayBuffer(layout.size * Int32Array.BYTES_PER_ELEMENT))
  for (let a = 0; a < layout.accounts; a++) mem[layout.balance(a)] = initialBalance
  clients.forEach((client, i) => {
    const base = layout.client(i)
    mem[base + C_ARRIVAL] = client.arrivalUs
    mem[base + C_PRIORITY] = client.priority
    mem[base + C_OP] = client.op
    mem[base + C_FROM] = client.from
    mem[base + C_TO] = client.to
    mem[base + C_AMOUNT] = client.amount
    mem[base + C_DURATION] = client.durationUs
  })
  return mem
}
