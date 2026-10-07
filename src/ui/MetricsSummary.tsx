import { STATUS_LABEL, formatMoney, type RunRecord } from '../sim/types'
import { formatMs, formatNumber } from './theme'

export function StatusBadge({ status }: { status: RunRecord['status'] }) {
  const icon = status === 'completed' ? '✓' : status === 'deadlock' ? '☠' : '■'
  return (
    <span className={`status status-${status}`}>
      {icon} {STATUS_LABEL[status]}
    </span>
  )
}

/** Teoria das filas aplicada à execução: estabilidade (ρ) e Teorema de Little (L = λ·W). */
export function LittlePanel({ run, compact }: { run: RunRecord; compact?: boolean }) {
  const m = run.metrics
  if (m.rho === undefined || m.littleL === undefined || m.littleLq === undefined || m.arrivalRate === undefined || m.serviceAvgMs === undefined) return null
  const stable = m.rho < 1
  const tellers = run.config.tellers
  return (
    <div className={`little ${stable ? 'little-ok' : 'little-over'}`}>
      <div className="little-verdict">
        <span className="little-icon" aria-hidden>
          {stable ? '✅' : '⚠️'}
        </span>
        <div>
          <strong>
            ρ = {formatNumber(m.rho, 2)} {stable ? '< 1: dá para atender tudo' : '≥ 1: não dá para atender no ritmo das chegadas'}
          </strong>
          <span className="small">
            {stable
              ? `Os ${tellers} caixas dão conta: usam em média ${formatNumber(m.rho * 100, 0)}% da capacidade.`
              : `Chega ${formatNumber(m.rho, 1)}× mais trabalho do que ${tellers} caixas atendem. A fila cresce enquanto houver chegadas; seriam precisos pelo menos ${Math.floor(m.rho * tellers) + 1} caixas.`}
          </span>
        </div>
      </div>
      <dl className="little-formulas">
        <div>
          <dt>Carga por caixa</dt>
          <dd>
            ρ = λ·S ÷ c = {formatNumber(m.arrivalRate)}/s × {formatMs(m.serviceAvgMs)} ÷ {tellers} = <strong>{formatNumber(m.rho, 2)}</strong>
          </dd>
        </div>
        <div>
          <dt>Little: clientes na agência</dt>
          <dd>
            L = λ·W = {formatNumber(m.throughput)}/s × {formatMs(m.turnaroundAvgMs)} = <strong>{formatNumber(m.littleL, 2)}</strong>
          </dd>
        </div>
        <div>
          <dt>Little: clientes na fila</dt>
          <dd>
            Lq = λ·Wq = {formatNumber(m.throughput)}/s × {formatMs(m.waitAvgMs)} = <strong>{formatNumber(m.littleLq, 2)}</strong>
          </dd>
        </div>
        {!compact && (
          <div>
            <dt>Caixas ocupados em média</dt>
            <dd>
              L − Lq = <strong>{formatNumber(m.littleL - m.littleLq, 2)}</strong> de {tellers}
            </dd>
          </div>
        )}
      </dl>
      {!compact && (
        <p className="muted small">
          Em ρ, λ é a taxa de chegada ({formatNumber(m.arrivalRate)} clientes/s na janela de chegadas) e S o atendimento médio
          medido. No Teorema de Little, λ é a vazão efetiva da execução inteira e W o tempo médio na agência (turnaround).
          {run.status !== 'completed' && ' A execução não terminou, então os valores são parciais.'}
        </p>
      )}
    </div>
  )
}

/** Resumo das métricas de uma execução. */
export function MetricsSummary({ run }: { run: RunRecord }) {
  const m = run.metrics
  const items: [string, string, boolean?][] = [
    ['Makespan', formatMs(m.makespanMs)],
    ['Atendidos', `${m.served}/${m.total}${m.refused ? ` (${m.refused} recusados)` : ''}`],
    ['Espera média', formatMs(m.waitAvgMs)],
    ['Espera mín. / máx.', `${formatMs(m.waitMinMs)} / ${formatMs(m.waitMaxMs)}`],
    ['Espera preferenciais', formatMs(m.waitPrefAvgMs)],
    ['Espera comuns', formatMs(m.waitCommonAvgMs)],
    ['Turnaround médio', formatMs(m.turnaroundAvgMs)],
    ['Throughput', `${formatNumber(m.throughput)} clientes/s`],
    ['Esperando lock (total)', formatMs(m.lockWaitTotalMs)],
    ['Dinheiro inconsistente', formatMoney(m.inconsistentCents), m.inconsistentCents !== 0],
    ['Contas com saldo errado', String(m.wrongAccounts), m.wrongAccounts > 0],
  ]
  return (
    <div className="metrics">
      <LittlePanel run={run} />
      <dl className="metric-grid">
        {items.map(([label, value, bad]) => (
          <div key={label} className={bad ? 'metric bad' : 'metric'}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <table className="mini-table">
        <thead>
          <tr>
            <th>Caixa</th>
            <th>Utilização</th>
            <th>Esperando lock</th>
          </tr>
        </thead>
        <tbody>
          {m.utilization.map((utilization, t) => (
            <tr key={t}>
              <td>Caixa {t + 1}</td>
              <td>
                <span className="util">
                  <span className="util-bar" style={{ width: `${utilization}%` }} />
                </span>{' '}
                {formatNumber(utilization)}%
              </td>
              <td>{formatMs(m.lockWaitMs[t] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
