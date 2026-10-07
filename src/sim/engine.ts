// Orquestra uma execução: aloca a memória compartilhada, sobe um Web Worker por caixa,
// roda o watchdog e, no fim, monta o registro (RunRecord) com as métricas.
// A thread principal nunca executa operações bancárias: ela só lê a memória.

import {
  createLayout, createSharedMemory,
  H_PROGRESS, H_STOP, L_OWNER, T_STATE, T_WAITING, TELLER_FINISHED,
  type Layout,
} from './layout'
import { computeMetrics } from './metrics'
import { generateQueue, sanitizeConfig, scenarioId } from './queue'
import { packTimeline, snapshotTimeline } from './timeline'
import {
  type Algorithm, type Client, type DeadlockInfo, type LockMode, type RunRecord, type RunStatus,
  type ScenarioConfig, type Timeline,
} from './types'
import { Watchdog } from './watchdog'
import type { TellerInit, TellerStart } from '../workers/teller.worker'

const WATCHDOG_INTERVAL_MS = 20
const START_DELAY_MS = 60

export interface RunOptions {
  config: ScenarioConfig
  scenarioName: string
  algorithm: Algorithm
  lockMode: LockMode
}

export interface RunHandle {
  readonly config: ScenarioConfig
  readonly clients: Client[]
  readonly algorithm: Algorithm
  readonly lockMode: LockMode
  /** resolvida quando a execução termina (concluída, deadlock ou interrompida) */
  readonly finished: Promise<RunRecord>
  /** status final, ou null enquanto roda */
  status(): RunStatus | null
  deadlock(): DeadlockInfo | undefined
  /** microssegundos desde o início (congela quando a execução termina) */
  nowUs(): number
  /** leitura da memória compartilhada neste instante */
  timeline(): Timeline
  stop(): void
}

function epochMs(): number {
  return performance.timeOrigin + performance.now()
}

export function startRun(options: RunOptions): RunHandle {
  const config = sanitizeConfig(options.config)
  const clients = generateQueue(config)
  const layout: Layout = createLayout(config.accounts, config.tellers, clients.length)
  const mem = createSharedMemory(layout, config.initialBalance, clients)

  let startEpochMs = 0
  let finalStatus: RunStatus | null = null
  let deadlockInfo: DeadlockInfo | undefined
  let finalTimeline: Timeline | null = null
  let watchdogTimer: ReturnType<typeof setInterval> | undefined
  let resolveFinished!: (record: RunRecord) => void
  let rejectFinished!: (error: Error) => void
  const finished = new Promise<RunRecord>((resolve, reject) => {
    resolveFinished = resolve
    rejectFinished = reject
  })

  const liveUs = () => (startEpochMs ? Math.max(0, Math.round((epochMs() - startEpochMs) * 1000)) : 0)

  const longestOpMs = Math.max(...clients.map((c) => c.durationUs / 1000)) + config.criticalWindowMs
  const watchdog = new Watchdog({ stallMs: Math.max(2500, longestOpMs * 5) })

  const workers = Array.from({ length: config.tellers }, () =>
    new Worker(new URL('../workers/teller.worker.ts', import.meta.url), { type: 'module' }),
  )

  function finish(status: RunStatus, endUs: number) {
    if (finalStatus) return
    finalStatus = status
    clearInterval(watchdogTimer)
    Atomics.store(mem, H_STOP, 1)
    // caixas presos em Atomics.wait (deadlock) nunca voltariam: encerra as threads
    workers.forEach((worker) => worker.terminate())
    finalTimeline = snapshotTimeline(mem, layout, endUs, true)
    if (status === 'completed') {
      // a execução termina de fato quando o último cliente é concluído
      finalTimeline.endUs = Math.max(1, ...finalTimeline.clients.map((trace) => trace.endUs))
    }
    resolveFinished({
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      scenarioId: scenarioId(config),
      scenarioName: options.scenarioName,
      config,
      algorithm: options.algorithm,
      lockMode: options.lockMode,
      status,
      metrics: computeMetrics(config, clients, finalTimeline),
      timeline: packTimeline(finalTimeline),
      deadlock: deadlockInfo,
    })
  }

  function watchdogTick() {
    if (finalStatus) return
    const nowUs = liveUs()
    let allFinished = true
    const waitingFor: number[] = []
    for (let t = 0; t < layout.tellers; t++) {
      const base = layout.teller(t)
      if (Atomics.load(mem, base + T_STATE) !== TELLER_FINISHED) allFinished = false
      waitingFor.push(Atomics.load(mem, base + T_WAITING) - 1)
    }
    if (allFinished) {
      finish('completed', nowUs)
      return
    }
    const owners: number[] = []
    for (let l = 0; l < layout.locks; l++) owners.push(Atomics.load(mem, layout.lock(l) + L_OWNER) - 1)

    const detected = watchdog.check({
      waitingFor,
      owners,
      progress: Atomics.load(mem, H_PROGRESS),
      nowMs: performance.now(),
      nowUs,
    })
    if (detected) {
      deadlockInfo = detected
      finish('deadlock', nowUs)
    }
  }

  let ready = 0
  workers.forEach((worker, tellerId) => {
    worker.onerror = (event) => {
      workers.forEach((w) => w.terminate())
      clearInterval(watchdogTimer)
      rejectFinished(new Error(event.message || 'falha ao iniciar o worker do caixa'))
    }
    worker.onmessage = (event: MessageEvent<{ type: string }>) => {
      if (event.data.type === 'ready') {
        ready++
        if (ready === workers.length) {
          // dá uma folga para todos os workers receberem a mensagem antes do instante zero
          startEpochMs = epochMs() + START_DELAY_MS
          const start: TellerStart = { type: 'start', startEpochMs }
          workers.forEach((w) => w.postMessage(start))
          watchdogTimer = setInterval(watchdogTick, WATCHDOG_INTERVAL_MS)
        }
      } else if (event.data.type === 'finished') {
        watchdogTick() // conclui sem esperar o próximo tique
      }
    }
    const init: TellerInit = {
      type: 'init',
      buffer: mem.buffer as SharedArrayBuffer,
      tellerId,
      accounts: config.accounts,
      tellers: config.tellers,
      clients: clients.length,
      algorithm: options.algorithm,
      lockMode: options.lockMode,
      criticalWindowUs: Math.round(config.criticalWindowMs * 1000),
      agingUs: Math.round(config.agingMs * 1000),
    }
    worker.postMessage(init)
  })

  return {
    config,
    clients,
    algorithm: options.algorithm,
    lockMode: options.lockMode,
    finished,
    status: () => finalStatus,
    deadlock: () => deadlockInfo,
    nowUs: () => (finalTimeline ? finalTimeline.endUs : liveUs()),
    timeline: () => finalTimeline ?? snapshotTimeline(mem, layout, liveUs(), false),
    stop: () => finish('stopped', liveUs()),
  }
}
