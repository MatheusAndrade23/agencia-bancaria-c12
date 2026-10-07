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
