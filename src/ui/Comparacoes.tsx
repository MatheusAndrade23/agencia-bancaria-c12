import { useMemo, useState } from 'react'
import { meanAndSd } from '../sim/metrics'
import { generateQueue } from '../sim/queue'
import { unpackTimeline } from '../sim/timeline'
import {
  ALGORITHMS, ALGORITHM_LABEL, LOCK_MODES, LOCK_MODE_LABEL, formatMoney,
  type Algorithm, type LockMode, type Metrics, type RunRecord,
} from '../sim/types'
import { ComparisonCharts } from './ComparisonCharts'
import { cycleText } from './DeadlockPanel'
import { Gantt } from './Gantt'
import { MetricsSummary, StatusBadge } from './MetricsSummary'
import { PALETTE, formatMs, formatNumber, sequentialInk } from './theme'

interface Props {
  runs: RunRecord[]
  onDelete(id: string): void
  onClearAll(): void
}

interface MetricOption {
  key: string
  label: string
  value(m: Metrics): number
  format(value: number): string
}

const METRIC_OPTIONS: MetricOption[] = [
  { key: 'waitAvg', label: 'Espera média na fila', value: (m) => m.waitAvgMs, format: formatMs },
  { key: 'waitCommon', label: 'Espera média — comuns', value: (m) => m.waitCommonAvgMs, format: formatMs },
  { key: 'waitPref', label: 'Espera média — preferenciais', value: (m) => m.waitPrefAvgMs, format: formatMs },
  { key: 'waitMax', label: 'Espera máxima', value: (m) => m.waitMaxMs, format: formatMs },
  { key: 'turnaround', label: 'Turnaround médio', value: (m) => m.turnaroundAvgMs, format: formatMs },
  { key: 'makespan', label: 'Makespan', value: (m) => m.makespanMs, format: formatMs },
  { key: 'throughput', label: 'Throughput (clientes/s)', value: (m) => m.throughput, format: (v) => formatNumber(v) },
  { key: 'lockWait', label: 'Tempo esperando lock', value: (m) => m.lockWaitTotalMs, format: formatMs },
  { key: 'money', label: 'Dinheiro inconsistente (módulo)', value: (m) => Math.abs(m.inconsistentCents), format: (v) => formatMoney(Math.round(v)) },
]

type SortKey = 'date' | 'scenario' | 'algorithm' | 'lock' | 'status' | 'makespan' | 'wait' | 'waitPref' | 'waitCommon' | 'turnaround' | 'throughput' | 'lockWait' | 'money' | 'wrong'

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; value(run: RunRecord): number | string; render(run: RunRecord): React.ReactNode }[] = [
  { key: 'date', label: 'Data', value: (r) => r.createdAt, render: (r) => new Date(r.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }) },
  { key: 'scenario', label: 'Cenário', value: (r) => r.scenarioName, render: (r) => <span title={`hash ${r.scenarioId}`}>{r.scenarioName} <span className="muted">· seed {r.config.seed}</span></span> },
  { key: 'algorithm', label: 'Algoritmo', value: (r) => ALGORITHMS.indexOf(r.algorithm), render: (r) => ALGORITHM_LABEL[r.algorithm] },
  { key: 'lock', label: 'Sincronismo', value: (r) => LOCK_MODES.indexOf(r.lockMode), render: (r) => LOCK_MODE_LABEL[r.lockMode] },
  { key: 'status', label: 'Status', value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
  { key: 'makespan', label: 'Makespan', numeric: true, value: (r) => r.metrics.makespanMs, render: (r) => formatMs(r.metrics.makespanMs) },
  { key: 'wait', label: 'Espera média', numeric: true, value: (r) => r.metrics.waitAvgMs, render: (r) => formatMs(r.metrics.waitAvgMs) },
  { key: 'waitPref', label: 'Pref.', numeric: true, value: (r) => r.metrics.waitPrefAvgMs, render: (r) => formatMs(r.metrics.waitPrefAvgMs) },
  { key: 'waitCommon', label: 'Comuns', numeric: true, value: (r) => r.metrics.waitCommonAvgMs, render: (r) => formatMs(r.metrics.waitCommonAvgMs) },
  { key: 'turnaround', label: 'Turnaround', numeric: true, value: (r) => r.metrics.turnaroundAvgMs, render: (r) => formatMs(r.metrics.turnaroundAvgMs) },
  { key: 'throughput', label: 'Clientes/s', numeric: true, value: (r) => r.metrics.throughput, render: (r) => formatNumber(r.metrics.throughput) },
  { key: 'lockWait', label: 'Esp. lock', numeric: true, value: (r) => r.metrics.lockWaitTotalMs, render: (r) => formatMs(r.metrics.lockWaitTotalMs) },
  { key: 'money', label: 'Inconsistente', numeric: true, value: (r) => Math.abs(r.metrics.inconsistentCents), render: (r) => <span className={r.metrics.inconsistentCents !== 0 ? 'bad' : ''}>{formatMoney(r.metrics.inconsistentCents)}</span> },
  { key: 'wrong', label: 'Contas erradas', numeric: true, value: (r) => r.metrics.wrongAccounts, render: (r) => <span className={r.metrics.wrongAccounts ? 'bad' : ''}>{r.metrics.wrongAccounts}</span> },
]

const MAX_SELECTED = 4

export function Comparacoes({ runs, onDelete, onClearAll }: Props) {
  const scenarios = useMemo(() => {
    const byId = new Map<string, { id: string; label: string; last: string }>()
    for (const run of runs) {
      const previous = byId.get(run.scenarioId)
      if (!previous || run.createdAt > previous.last) {
        byId.set(run.scenarioId, { id: run.scenarioId, label: `${run.scenarioName} · seed ${run.config.seed} · ${run.scenarioId}`, last: run.createdAt })
      }
    }
    return [...byId.values()].sort((a, b) => b.last.localeCompare(a.last))
  }, [runs])

  const [scenarioChoice, setScenarioChoice] = useState<string>('latest')
  const [algorithmFilter, setAlgorithmFilter] = useState<Algorithm | 'all'>('all')
  const [lockFilter, setLockFilter] = useState<LockMode | 'all'>('all')
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })
  const [selected, setSelected] = useState<string[]>([])
  const [metricKey, setMetricKey] = useState('waitAvg')

  // "latest" acompanha o cenário da execução mais recente
  const scenarioFilter =
    scenarioChoice === 'latest' || (scenarioChoice !== 'all' && !scenarios.some((s) => s.id === scenarioChoice))
      ? (scenarios[0]?.id ?? 'all')
      : scenarioChoice

  const scenarioRuns = useMemo(
    () => (scenarioFilter === 'all' ? runs : runs.filter((run) => run.scenarioId === scenarioFilter)),
    [runs, scenarioFilter],
  )
  const filtered = useMemo(() => {
    const column = COLUMNS.find((c) => c.key === sort.key)!
    return scenarioRuns
      .filter((run) => algorithmFilter === 'all' || run.algorithm === algorithmFilter)
      .filter((run) => lockFilter === 'all' || run.lockMode === lockFilter)
      .sort((a, b) => {
        const va = column.value(a)
        const vb = column.value(b)
        const order = typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb))
        return order * sort.dir
      })
  }, [scenarioRuns, algorithmFilter, lockFilter, sort])

  const selectedRuns = selected.map((id) => runs.find((run) => run.id === id)).filter((run): run is RunRecord => !!run)

  function toggleSelected(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : current.length >= MAX_SELECTED ? current : [...current, id],
    )
  }

  function toggleSort(key: SortKey) {
    setSort((current) => (current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 }))
  }

  return (
    <div className="compare">
      <section className="panel">
        <header className="panel-header">
          <h2>Execuções salvas</h2>
          <span className="muted">{runs.length} no navegador (localStorage)</span>
          <span className="spacer" />
          <button type="button" className="btn btn-small btn-danger" onClick={onClearAll}>
            🗑 Limpar tudo
          </button>
        </header>

        <div className="filters">
          <label className="field">
            <span>Cenário</span>
            <select value={scenarioFilter} onChange={(e) => setScenarioChoice(e.target.value)}>
              <option value="all">Todos os cenários</option>
              {scenarios.map((scenario) => (
                <option key={scenario.id} value={scenario.id}>
                  {scenario.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Algoritmo</span>
            <select value={algorithmFilter} onChange={(e) => setAlgorithmFilter(e.target.value as Algorithm | 'all')}>
              <option value="all">Todos</option>
              {ALGORITHMS.map((alg) => (
                <option key={alg} value={alg}>
                  {ALGORITHM_LABEL[alg]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Sincronismo</span>
            <select value={lockFilter} onChange={(e) => setLockFilter(e.target.value as LockMode | 'all')}>
              <option value="all">Todos</option>
              {LOCK_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {LOCK_MODE_LABEL[mode]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filtered.length === 0 ? (
          <p className="empty">
            {runs.length === 0
              ? 'Nenhuma execução ainda. Rode uma simulação e ela aparece aqui.'
              : 'Nenhuma execução com esses filtros.'}
          </p>
        ) : (
          <div className="table-scroll runs-table">
            <table>
              <thead>
                <tr>
                  <th title={`Selecione de 2 a ${MAX_SELECTED} para comparar`}>Comparar</th>
                  {COLUMNS.map((column) => (
                    <th key={column.key} className={column.numeric ? 'num' : ''} aria-sort={sort.key === column.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" className="th-btn" onClick={() => toggleSort(column.key)}>
                        {column.label}
                        {sort.key === column.key ? (sort.dir === 1 ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((run) => (
                  <tr key={run.id} className={selected.includes(run.id) ? 'row-selected' : ''}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.includes(run.id)}
                        disabled={!selected.includes(run.id) && selected.length >= MAX_SELECTED}
                        onChange={() => toggleSelected(run.id)}
                        aria-label="Selecionar para comparação"
                      />
                    </td>
                    {COLUMNS.map((column) => (
                      <td key={column.key} className={column.numeric ? 'num' : ''}>
                        {column.render(run)}
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="icon-btn"
                        aria-label="Excluir execução"
                        title="Excluir execução"
                        onClick={() => {
                          setSelected((current) => current.filter((id) => id !== run.id))
                          onDelete(run.id)
                        }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Comparação lado a lado</h2>
          <span className="muted">
            {selectedRuns.length < 2
              ? `marque de 2 a ${MAX_SELECTED} execuções na tabela (${selectedRuns.length} marcada${selectedRuns.length === 1 ? '' : 's'})`
              : `${selectedRuns.length} execuções`}
          </span>
        </header>
        {selectedRuns.length >= 2 && (
          <div className="side-by-side" style={{ gridTemplateColumns: `repeat(${selectedRuns.length}, minmax(280px, 1fr))` }}>
            {selectedRuns.map((run) => (
              <SideBySideCard key={run.id} run={run} />
            ))}
          </div>
        )}
      </section>

      {scenarioFilter === 'all' ? (
        <section className="panel">
          <p className="empty">Selecione um cenário para ver a matriz e os gráficos: só faz sentido comparar execuções sobre a mesma fila.</p>
        </section>
      ) : (
        <>
          <Heatmap runs={scenarioRuns} metricKey={metricKey} onMetricChange={setMetricKey} />
          <ComparisonCharts runs={scenarioRuns} />
        </>
      )}
    </div>
  )
}

function SideBySideCard({ run }: { run: RunRecord }) {
  const clients = useMemo(() => generateQueue(run.config), [run])
  const timeline = useMemo(() => unpackTimeline(run.timeline), [run])
  return (
    <article className="side-card">
      <header>
        <strong>
          {ALGORITHM_LABEL[run.algorithm]} × {LOCK_MODE_LABEL[run.lockMode]}
        </strong>
        <StatusBadge status={run.status} />
      </header>
      <div className="muted small">
        {run.scenarioName} · seed {run.config.seed} · {new Date(run.createdAt).toLocaleString('pt-BR')}
      </div>
      {run.deadlock && run.deadlock.cycle.length > 0 && <p className="cycle-text small">{cycleText(run.deadlock, run.config.accounts)}</p>}
      <Gantt config={run.config} clients={clients} timeline={timeline} tUs={timeline.endUs} deadlock={run.deadlock} rowHeight={24} />
      <MetricsSummary run={run} />
    </article>
  )
}

interface HeatmapProps {
  runs: RunRecord[]
  metricKey: string
  onMetricChange(key: string): void
}

/** Matriz algoritmo × modo de lock. Só execuções concluídas entram na média. */
function Heatmap({ runs, metricKey, onMetricChange }: HeatmapProps) {
  const metric = METRIC_OPTIONS.find((option) => option.key === metricKey) ?? METRIC_OPTIONS[0]

  const cells = ALGORITHMS.map((algorithm) =>
    LOCK_MODES.map((lockMode) => {
      const all = runs.filter((run) => run.algorithm === algorithm && run.lockMode === lockMode)
      const completed = all.filter((run) => run.status === 'completed')
      return {
        algorithm,
        lockMode,
        total: all.length,
        deadlocks: all.filter((run) => run.status === 'deadlock').length,
        stats: meanAndSd(completed.map((run) => metric.value(run.metrics))),
      }
    }),
  )
  const means = cells.flat().filter((cell) => cell.stats.n > 0).map((cell) => cell.stats.mean)
  const min = Math.min(...means)
  const max = Math.max(...means)
  const ramp = PALETTE.sequential
  // valores altos usam o tom que mais se destaca da superfície
  const stepOf = (value: number) => (max > min ? Math.min(ramp.length - 1, Math.floor(((value - min) / (max - min)) * ramp.length)) : 0)

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Matriz algoritmo × sincronismo</h2>
        <span className="spacer" />
        <label className="field field-inline">
          <span>Métrica</span>
          <select value={metric.key} onChange={(e) => onMetricChange(e.target.value)}>
            {METRIC_OPTIONS.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="table-scroll">
        <table className="heatmap">
          <thead>
            <tr>
              <th />
              {LOCK_MODES.map((mode) => (
                <th key={mode}>{LOCK_MODE_LABEL[mode]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cells.map((row, r) => (
              <tr key={ALGORITHMS[r]}>
                <th>{ALGORITHM_LABEL[ALGORITHMS[r]]}</th>
                {row.map((cell) => {
                  if (cell.total === 0) {
                    return (
                      <td key={cell.lockMode} className="heat-empty">
                        —
                      </td>
                    )
                  }
                  if (cell.stats.n === 0) {
                    return (
                      <td key={cell.lockMode} className={cell.deadlocks ? 'heat-deadlock' : 'heat-empty'}>
                        {cell.deadlocks ? (
                          <>
                            <strong>☠ DEADLOCK</strong>
                            <small>
                              {cell.deadlocks} de {cell.total}
                            </small>
                          </>
                        ) : (
                          <small>só interrompidas</small>
                        )}
                      </td>
                    )
                  }
                  const step = stepOf(cell.stats.mean)
                  return (
                    <td
                      key={cell.lockMode}
                      style={{ background: ramp[step], color: sequentialInk(step) }}
                      title={`${ALGORITHM_LABEL[cell.algorithm]} × ${LOCK_MODE_LABEL[cell.lockMode]}: ${metric.format(cell.stats.mean)} (n=${cell.stats.n})`}
                    >
                      <strong>{metric.format(cell.stats.mean)}</strong>
                      <small>
                        {cell.stats.n > 1 ? `± ${metric.format(cell.stats.sd)} · n=${cell.stats.n}` : 'n=1'}
                        {cell.deadlocks > 0 && ` · ☠ ${cell.deadlocks}`}
                      </small>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Cada célula mostra a média ± desvio padrão das execuções <em>concluídas</em> daquela combinação. Células em
        vermelho travaram em deadlock em todas as tentativas.
      </p>
    </section>
  )
}
