import { useEffect, useRef, useState } from 'react'
import { startRun, type RunHandle } from '../sim/engine'
import { viewAt, type AgencyView } from '../sim/timeline'
import {
  ALGORITHMS, ALGORITHM_LABEL, LOCK_MODES, LOCK_MODE_LABEL,
  type Algorithm, type LockMode, type RunRecord, type ScenarioConfig, type Timeline,
} from '../sim/types'
import { Caixas } from './Caixas'
import { Cofres } from './Cofres'
import { DeadlockPanel } from './DeadlockPanel'
import { Fila } from './Fila'
import { Gantt } from './Gantt'
import { MetricsSummary, StatusBadge } from './MetricsSummary'
import { formatMs, type ThemeName } from './theme'

interface Props {
  config: ScenarioConfig
  scenarioName: string
  theme: ThemeName
  isolated: boolean
  /** chamado quando uma execução termina, para salvá-la */
  onRunFinished(record: RunRecord): void
  onRunningChange(running: boolean): void
}

interface Frame {
  tUs: number
  liveUs: number
  timeline: Timeline
  view: AgencyView
}

const SPEEDS: { label: string; value: number }[] = [
  { label: '0,05×', value: 0.05 },
  { label: '0,1×', value: 0.1 },
  { label: '0,25×', value: 0.25 },
  { label: '0,5×', value: 0.5 },
  { label: '1×', value: 1 },
  { label: 'Ao vivo', value: Infinity },
]

/** Duração da animação do dinheiro, em ms de relógio de parede. */
const MONEY_FX_MS = 700

export function SimulationPage({ config, scenarioName, theme, isolated, onRunFinished, onRunningChange }: Props) {
  const [algorithm, setAlgorithm] = useState<Algorithm>('fcfs')
  const [lockMode, setLockMode] = useState<LockMode>('none')
  const [handle, setHandle] = useState<RunHandle | null>(null)
  const [record, setRecord] = useState<RunRecord | null>(null)
  const [running, setRunning] = useState(false)
  const [batch, setBatch] = useState<{ done: number; total: number } | null>(null)
  const [speed, setSpeed] = useState(0.1)
  const [paused, setPaused] = useState(false)
  const [error, setError] = useState('')
  const [frame, setFrame] = useState<Frame | null>(null)

  // posição da reprodução; fica em ref para o laço de animação não depender do React
  const playback = useRef({ tUs: 0, speed: 0.1, paused: false })
  const cancelBatch = useRef(false)
  playback.current.speed = speed
  playback.current.paused = paused

  // A thread principal só lê a memória compartilhada, uma vez por quadro, e desenha.
  useEffect(() => {
    if (!handle) return
    let raf = 0
    let last = performance.now()
    let lastKey = ''
    const tick = (now: number) => {
      const dtMs = Math.min(100, now - last)
      last = now
      const p = playback.current
      const liveUs = handle.nowUs()
      if (!p.paused) p.tUs = Number.isFinite(p.speed) ? p.tUs + dtMs * 1000 * p.speed : liveUs
      p.tUs = Math.max(0, Math.min(p.tUs, liveUs))

      const status = handle.status()
      const key = `${status}:${Math.round(p.tUs)}:${status ? '' : Math.round(liveUs / 20_000)}`
      if (key !== lastKey) {
        lastKey = key
        const timeline = handle.timeline()
        const fxUs = MONEY_FX_MS * 1000 * (Number.isFinite(p.speed) ? p.speed : 1)
        setFrame({
          tUs: p.tUs,
          liveUs,
          timeline,
          view: viewAt(handle.config, handle.clients, timeline, p.tUs, handle.deadlock(), fxUs),
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [handle])

  useEffect(() => onRunningChange(running), [running, onRunningChange])

  async function execute(alg: Algorithm, lock: LockMode): Promise<RunRecord> {
    const run = startRun({ config, scenarioName, algorithm: alg, lockMode: lock })
    playback.current.tUs = 0
    setPaused(false)
    setRecord(null)
    setHandle(run)
    const result = await run.finished
    setRecord(result)
    onRunFinished(result)
    return result
  }

  async function start() {
    setError('')
    setRunning(true)
    try {
      await execute(algorithm, lockMode)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  async function startAll() {
    setError('')
    setRunning(true)
    cancelBatch.current = false
    setSpeed(Infinity)
    const combos = ALGORITHMS.flatMap((alg) => LOCK_MODES.map((lock) => [alg, lock] as const))
    try {
      for (let i = 0; i < combos.length && !cancelBatch.current; i++) {
        setBatch({ done: i, total: combos.length })
        setAlgorithm(combos[i][0])
        setLockMode(combos[i][1])
        await execute(combos[i][0], combos[i][1])
        await new Promise((resolve) => setTimeout(resolve, 250)) // deixa a tela mostrar o resultado
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBatch(null)
      setRunning(false)
    }
  }

  function stop() {
    cancelBatch.current = true
    handle?.stop()
  }

  function seek(tUs: number) {
    playback.current.tUs = tUs
    setPaused(true)
  }

  function replay() {
    playback.current.tUs = 0
    if (!Number.isFinite(speed)) setSpeed(0.1)
    setPaused(false)
  }

  const shown = handle
  const status = shown?.status() ?? null
  const deadlock = shown?.deadlock()
  const atEnd = !!frame && !!status && frame.tUs >= frame.liveUs

  return (
    <div className="sim">
      <section className="panel controls">
        <label className="field">
          <span>Escalonamento</span>
          <select value={algorithm} disabled={running} onChange={(e) => setAlgorithm(e.target.value as Algorithm)}>
            {ALGORITHMS.map((alg) => (
              <option key={alg} value={alg}>
                {ALGORITHM_LABEL[alg]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Sincronismo das contas</span>
          <select value={lockMode} disabled={running} onChange={(e) => setLockMode(e.target.value as LockMode)}>
            {LOCK_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {LOCK_MODE_LABEL[mode]}
              </option>
            ))}
          </select>
        </label>
        <div className="control-buttons">
          <button type="button" className="btn btn-primary" disabled={running || !isolated} onClick={start}>
            ▶ Iniciar
          </button>
          <button type="button" className="btn" disabled={!running} onClick={stop}>
            ■ Parar
          </button>
          <button
            type="button"
            className="btn"
            disabled={running || !isolated}
            onClick={startAll}
            title="Roda as 16 combinações de algoritmo × sincronismo sobre este cenário, uma após a outra"
          >
            ⏩ Rodar as 16 combinações
          </button>
        </div>
        <div className="field speed">
          <span>Velocidade da animação (não altera o benchmark)</span>
          <div className="segmented">
            {SPEEDS.map((option) => (
              <button
                key={option.label}
                type="button"
                className={speed === option.value ? 'seg seg-active' : 'seg'}
                onClick={() => {
                  setSpeed(option.value)
                  setPaused(false)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {error && <div className="banner banner-error">Erro ao executar: {error}</div>}
      {batch && (
        <div className="banner">
          Rodando combinação {batch.done + 1} de {batch.total}: {ALGORITHM_LABEL[algorithm]} × {LOCK_MODE_LABEL[lockMode]}…
        </div>
      )}

      {!shown || !frame ? (
        <section className="panel empty-state">
          <h2>Pronto para abrir a agência</h2>
          <p className="muted">
            Ajuste o cenário à esquerda, escolha o algoritmo de escalonamento e o modo de sincronismo e clique em{' '}
            <strong>Iniciar</strong>. Cada caixa roda em um Web Worker (thread real) e todos compartilham os saldos em um
            SharedArrayBuffer. A execução acontece em tempo real; a tela a reproduz em câmera lenta.
          </p>
        </section>
      ) : (
        <>
          <section className="panel playback">
            <div className="playback-info">
              <strong>
                {ALGORITHM_LABEL[shown.algorithm]} × {LOCK_MODE_LABEL[shown.lockMode]}
              </strong>
              {status ? <StatusBadge status={status} /> : <span className="status status-running">● Executando</span>}
              <span className="muted">
                t = {formatMs(frame.tUs / 1000)} de {formatMs(frame.liveUs / 1000)}
              </span>
              {deadlock && !frame.view.deadlockVisible && (
                <span className="status status-deadlock">☠ deadlock em {formatMs(deadlock.atUs / 1000)} (a animação chega lá)</span>
              )}
            </div>
            <div className="playback-controls">
              <button type="button" className="btn btn-small" onClick={() => setPaused(!paused)} disabled={atEnd}>
                {paused ? '▶ Continuar' : '⏸ Pausar'}
              </button>
              <button type="button" className="btn btn-small" onClick={replay}>
                ↺ Rever do início
              </button>
              <button type="button" className="btn btn-small" onClick={() => seek(frame.liveUs)} disabled={atEnd}>
                ⏭ Ir para o fim
              </button>
              <input
                type="range"
                className="scrubber"
                min={0}
                max={Math.max(1, frame.liveUs)}
                value={frame.tUs}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label="Posição na linha do tempo"
              />
            </div>
          </section>

          {deadlock && frame.view.deadlockVisible && <DeadlockPanel deadlock={deadlock} accounts={shown.config.accounts} />}

          <Caixas config={shown.config} clients={shown.clients} view={frame.view} />
          <Cofres config={shown.config} lockMode={shown.lockMode} view={frame.view} />
          <Fila clients={shown.clients} view={frame.view} />

          <section className="panel">
            <header className="panel-header">
              <h2>Gantt</h2>
              <span className="muted">uma linha por caixa</span>
            </header>
            <Gantt
              config={shown.config}
              clients={shown.clients}
              timeline={frame.timeline}
              tUs={frame.tUs}
              deadlock={deadlock}
              theme={theme}
            />
          </section>

          {record && status && (
            <section className="panel">
              <header className="panel-header">
                <h2>Métricas da execução</h2>
                <span className="muted">salva automaticamente em Comparações</span>
              </header>
              <MetricsSummary run={record} />
            </section>
          )}
        </>
      )}
    </div>
  )
}
