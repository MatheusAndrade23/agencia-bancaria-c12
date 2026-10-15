import { Icon } from './icons'
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
import { MetricsSummary, StatusBadge, formatReputation } from './MetricsSummary'
import { formatMs, formatNumber, usePalette } from './theme'

interface Props {
  runs: RunRecord[]
  onDelete(id: string): void
  onClearAll(): void
}

interface MetricOption {
  key: string
  label: string
  /** undefined = métrica ausente (execução salva por uma versão antiga) */
  value(m: Metrics): number | undefined
  format(value: number): string
}

const METRIC_OPTIONS: MetricOption[] = [
  { key: 'reputation', label: 'Reputação da empresa (−100 a +100)', value: (m) => m.reputation, format: (v) => formatReputation(v) },
  { key: 'satisfaction', label: 'Índice de satisfação (0 a 100)', value: (m) => m.satisfaction, format: (v) => formatNumber(v, 1) },
  { key: 'satisfactionCommon', label: 'Satisfação dos comuns', value: (m) => m.satisfactionCommon, format: (v) => formatNumber(v, 1) },
  { key: 'satisfactionPref', label: 'Satisfação dos preferenciais', value: (m) => m.satisfactionPref, format: (v) => formatNumber(v, 1) },
  { key: 'gaveUp', label: 'Desistências', value: (m) => m.gaveUp, format: (v) => formatNumber(v, 1) },
  { key: 'disturbed', label: 'Clientes incomodados por incidentes', value: (m) => m.disturbed, format: (v) => formatNumber(v, 1) },
  { key: 'events', label: 'Idosos que passaram mal + crianças no chão', value: (m) => (m.elderlySick === undefined ? undefined : m.elderlySick + (m.infantFloor ?? 0)), format: (v) => formatNumber(v, 1) },
  { key: 'mood', label: 'Humor médio (0 feliz a 4 furioso)', value: (m) => m.moodAvg, format: (v) => formatNumber(v, 2) },
  { key: 'waitAvg', label: 'Espera média na fila', value: (m) => m.waitAvgMs, format: formatMs },
  { key: 'waitCommon', label: 'Espera média dos comuns', value: (m) => m.waitCommonAvgMs, format: formatMs },
  { key: 'waitPref', label: 'Espera média dos preferenciais', value: (m) => m.waitPrefAvgMs, format: formatMs },
  { key: 'waitMax', label: 'Espera máxima', value: (m) => m.waitMaxMs, format: formatMs },
  { key: 'turnaround', label: 'Turnaround médio', value: (m) => m.turnaroundAvgMs, format: formatMs },
  { key: 'makespan', label: 'Makespan', value: (m) => m.makespanMs, format: formatMs },
  { key: 'throughput', label: 'Throughput (clientes/s)', value: (m) => m.throughput, format: (v) => formatNumber(v) },
  { key: 'rho', label: 'ρ, carga por caixa (abaixo de 1 dá conta)', value: (m) => m.rho ?? 0, format: (v) => formatNumber(v, 2) },
  { key: 'littleLq', label: 'Lq, clientes na fila (Little)', value: (m) => m.littleLq ?? 0, format: (v) => formatNumber(v, 2) },
  { key: 'littleL', label: 'L, clientes na agência (Little)', value: (m) => m.littleL ?? 0, format: (v) => formatNumber(v, 2) },
  { key: 'lockWait', label: 'Tempo esperando lock', value: (m) => m.lockWaitTotalMs, format: formatMs },
  { key: 'money', label: 'Dinheiro inconsistente (módulo)', value: (m) => Math.abs(m.inconsistentCents), format: (v) => formatMoney(Math.round(v)) },
]

type SortKey = 'date' | 'scenario' | 'algorithm' | 'lock' | 'status' | 'reputation' | 'satisfaction' | 'gaveUp' | 'events' | 'makespan' | 'wait' | 'waitPref' | 'waitCommon' | 'turnaround' | 'throughput' | 'lockWait' | 'rho' | 'littleLq' | 'money' | 'wrong'

const COLUMNS: { key: SortKey; label: string; numeric?: boolean; value(run: RunRecord): number | string; render(run: RunRecord): React.ReactNode }[] = [
  { key: 'date', label: 'Data', value: (r) => r.createdAt, render: (r) => new Date(r.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'medium' }) },
  { key: 'scenario', label: 'Cenário', value: (r) => r.scenarioName, render: (r) => <span title={`hash ${r.scenarioId}`}>{r.scenarioName} <span className="muted">· seed {r.config.seed}</span></span> },
  { key: 'algorithm', label: 'Algoritmo', value: (r) => ALGORITHMS.indexOf(r.algorithm), render: (r) => ALGORITHM_LABEL[r.algorithm] },
  { key: 'lock', label: 'Sincronismo', value: (r) => LOCK_MODES.indexOf(r.lockMode), render: (r) => LOCK_MODE_LABEL[r.lockMode] },
  { key: 'status', label: 'Status', value: (r) => r.status, render: (r) => <StatusBadge status={r.status} /> },
  { key: 'reputation', label: 'Reputação', numeric: true, value: (r) => r.metrics.reputation ?? -1000, render: (r) => (r.metrics.reputation === undefined ? '-' : <span className={r.metrics.reputation < -10 ? 'bad' : ''}>{formatReputation(r.metrics.reputation)}</span>) },
  { key: 'satisfaction', label: 'Satisfação', numeric: true, value: (r) => r.metrics.satisfaction ?? -1, render: (r) => (r.metrics.satisfaction === undefined ? '-' : <span title={`mediana ${formatNumber(r.metrics.satisfactionMedian ?? 0, 1)} · P10 ${formatNumber(r.metrics.satisfactionP10 ?? 0, 1)}`}>{formatNumber(r.metrics.satisfaction, 1)}</span>) },
  { key: 'gaveUp', label: 'Desistências', numeric: true, value: (r) => r.metrics.gaveUp ?? -1, render: (r) => (r.metrics.gaveUp === undefined ? '-' : <span className={r.metrics.gaveUp ? 'bad' : ''}>{r.metrics.gaveUp}</span>) },
  { key: 'events', label: 'Passou mal / chão', numeric: true, value: (r) => (r.metrics.elderlySick ?? -1) + (r.metrics.infantFloor ?? 0), render: (r) => (r.metrics.elderlySick === undefined ? '-' : `${r.metrics.elderlySick} / ${r.metrics.infantFloor ?? 0}`) },
  { key: 'makespan', label: 'Makespan', numeric: true, value: (r) => r.metrics.makespanMs, render: (r) => formatMs(r.metrics.makespanMs) },
  { key: 'wait', label: 'Espera média', numeric: true, value: (r) => r.metrics.waitAvgMs, render: (r) => formatMs(r.metrics.waitAvgMs) },
  { key: 'waitPref', label: 'Pref.', numeric: true, value: (r) => r.metrics.waitPrefAvgMs, render: (r) => formatMs(r.metrics.waitPrefAvgMs) },
  { key: 'waitCommon', label: 'Comuns', numeric: true, value: (r) => r.metrics.waitCommonAvgMs, render: (r) => formatMs(r.metrics.waitCommonAvgMs) },
  { key: 'turnaround', label: 'Turnaround', numeric: true, value: (r) => r.metrics.turnaroundAvgMs, render: (r) => formatMs(r.metrics.turnaroundAvgMs) },
  { key: 'throughput', label: 'Clientes/s', numeric: true, value: (r) => r.metrics.throughput, render: (r) => formatNumber(r.metrics.throughput) },
  { key: 'rho', label: 'ρ', numeric: true, value: (r) => r.metrics.rho ?? 0, render: (r) => (r.metrics.rho === undefined ? '-' : <span title={r.metrics.rho < 1 ? 'os caixas dão conta' : 'chega mais trabalho do que os caixas atendem'}>{formatNumber(r.metrics.rho, 2)} <Icon name={r.metrics.rho < 1 ? 'check' : 'alert'} size={12} /></span>) },
  { key: 'littleLq', label: 'Lq (Little)', numeric: true, value: (r) => r.metrics.littleLq ?? 0, render: (r) => (r.metrics.littleLq === undefined ? '-' : formatNumber(r.metrics.littleLq, 2)) },
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
            <Icon name="trash" size={14} /> Limpar tudo
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
                        {sort.key === column.key && <Icon name={sort.dir === 1 ? 'chevron-up' : 'chevron-down'} size={12} />}
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
                        <Icon name="x" size={14} />
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
          <Ranking runs={scenarioRuns} />
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
        stats: meanAndSd(completed.map((run) => metric.value(run.metrics)).filter((v): v is number => v !== undefined)),
      }
    }),
  )
  const means = cells.flat().filter((cell) => cell.stats.n > 0).map((cell) => cell.stats.mean)
  const min = Math.min(...means)
  const max = Math.max(...means)
  const palette = usePalette()
  const ramp = palette.sequential
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
                        -
                      </td>
                    )
                  }
                  if (cell.stats.n === 0) {
                    return (
                      <td key={cell.lockMode} className={cell.deadlocks ? 'heat-deadlock' : 'heat-empty'}>
                        {cell.deadlocks ? (
                          <>
                            <strong><Icon name="skull" size={14} /> DEADLOCK</strong>
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
                      style={{ background: ramp[step], color: palette.sequentialInk[step] }}
                      title={`${ALGORITHM_LABEL[cell.algorithm]} × ${LOCK_MODE_LABEL[cell.lockMode]}: ${metric.format(cell.stats.mean)} (n=${cell.stats.n})`}
                    >
                      <strong>{metric.format(cell.stats.mean)}</strong>
                      <small>
                        {cell.stats.n > 1 ? `± ${metric.format(cell.stats.sd)} · n=${cell.stats.n}` : 'n=1'}
                        {cell.deadlocks > 0 && ` · ${cell.deadlocks} em deadlock`}
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

interface RankingRow {
  algorithm: Algorithm
  lockMode: LockMode
  total: number
  deadlocks: number
  n: number
  reputation: number
  satisfaction: number
  common: number
  gaveUp: number
  incidents: number
  makespanMs: number
  wrongMoney: boolean
}

/**
 * Ranking das combinações do cenário: a que deixa a empresa com melhor reputação vem primeiro,
 * com a satisfação desempatando. Combinações que travaram em deadlock em todas as tentativas vão para o fim.
 */
function Ranking({ runs }: { runs: RunRecord[] }) {
  const rows: RankingRow[] = []
  for (const algorithm of ALGORITHMS) {
    for (const lockMode of LOCK_MODES) {
      const all = runs.filter((run) => run.algorithm === algorithm && run.lockMode === lockMode)
      if (all.length === 0) continue
      const measured = all.filter((run) => run.status === 'completed' && run.metrics.reputation !== undefined)
      const avg = (value: (m: Metrics) => number | undefined) => meanAndSd(measured.map((run) => value(run.metrics) ?? 0)).mean
      rows.push({
        algorithm,
        lockMode,
        total: all.length,
        deadlocks: all.filter((run) => run.status === 'deadlock').length,
        n: measured.length,
        reputation: avg((m) => m.reputation),
        satisfaction: avg((m) => m.satisfaction),
        common: avg((m) => m.satisfactionCommon),
        gaveUp: avg((m) => m.gaveUp),
        incidents: avg((m) => (m.elderlySick ?? 0) + (m.infantFloor ?? 0)),
        makespanMs: avg((m) => m.makespanMs),
        wrongMoney: measured.some((run) => run.metrics.wrongAccounts > 0),
      })
    }
  }
  rows.sort((a, b) => (b.n > 0 ? 1 : 0) - (a.n > 0 ? 1 : 0) || b.reputation - a.reputation || b.satisfaction - a.satisfaction)
  const best = rows.find((row) => row.n > 0)

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Qual combinação escolher</h2>
        <span className="muted">ordenado pela reputação da empresa; a satisfação desempata</span>
      </header>
      {!best ? (
        <p className="empty">Rode o cenário com a versão atual para medir satisfação e reputação (execuções antigas não têm essas métricas).</p>
      ) : (
        <>
          <p className="ranking-best">
            <Icon name="check" size={16} /> Melhor neste cenário: <strong>{ALGORITHM_LABEL[best.algorithm]} × {LOCK_MODE_LABEL[best.lockMode]}</strong>, com reputação{' '}
            {formatReputation(best.reputation)} e satisfação {formatNumber(best.satisfaction, 1)}
            {best.n > 1 ? ` (média de ${best.n} execuções)` : ''}.
          </p>
          <div className="table-scroll">
            <table className="ranking">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Combinação</th>
                  <th className="num">Reputação</th>
                  <th className="num">Satisfação</th>
                  <th className="num">Comuns</th>
                  <th className="num">Desistências</th>
                  <th className="num">Incidentes</th>
                  <th className="num">Makespan</th>
                  <th className="num">Execuções</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={`${row.algorithm}-${row.lockMode}`} className={row === best ? 'row-selected' : ''}>
                    <td>{row.n > 0 ? i + 1 : '-'}</td>
                    <td>
                      {ALGORITHM_LABEL[row.algorithm]} × {LOCK_MODE_LABEL[row.lockMode]}
                      {row.wrongMoney && <span className="bad small"> · dinheiro errado</span>}
                      {row.deadlocks > 0 && (
                        <span className="bad small">
                          {' '}
                          · <Icon name="skull" size={12} /> {row.deadlocks} em deadlock
                        </span>
                      )}
                    </td>
                    {row.n > 0 ? (
                      <>
                        <td className="num">
                          <strong>{formatReputation(row.reputation)}</strong>
                        </td>
                        <td className="num">{formatNumber(row.satisfaction, 1)}</td>
                        <td className="num">{formatNumber(row.common, 1)}</td>
                        <td className="num">{formatNumber(row.gaveUp, 1)}</td>
                        <td className="num">{formatNumber(row.incidents, 1)}</td>
                        <td className="num">{formatMs(row.makespanMs)}</td>
                      </>
                    ) : (
                      <td colSpan={6} className="muted small">
                        sem execução concluída com as métricas novas
                      </td>
                    )}
                    <td className="num">{row.n}/{row.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="muted small">
            Os valores são médias das execuções concluídas de cada combinação. Rode as 16 combinações algumas vezes para a média
            ficar estável: os tempos variam um pouco de uma execução para outra e a inconsistência do sem lock varia muito.
          </p>
        </>
      )}
    </section>
  )
}
