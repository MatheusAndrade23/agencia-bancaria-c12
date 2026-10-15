import { Face, Icon, moodFace } from './icons'
import { MOOD_LABEL, type MoodLevel } from '../sim/satisfaction'
import { STATUS_LABEL, formatMoney, type RunRecord } from '../sim/types'
import { formatMs, formatNumber } from './theme'

export function StatusBadge({ status }: { status: RunRecord['status'] }) {
  const icon = status === 'completed' ? 'check' : status === 'deadlock' ? 'skull' : 'stop'
  return (
    <span className={`status status-${status}`}>
      <Icon name={icon} /> {STATUS_LABEL[status]}
    </span>
  )
}

/** Teoria das filas aplicada à execução: estabilidade (ρ) e Teorema de Little (L = λ·W). */
export function LittlePanel({ run, compact }: { run: RunRecord; compact?: boolean }) {
  const m = run.metrics
  if (m.rho === undefined || m.littleL === undefined || m.littleLq === undefined || m.arrivalRate === undefined || m.serviceAvgMs === undefined) return null
  const stable = m.rho < 1
  const tellers = run.config.tellers
  // régua de 0 a 2: até 1 os caixas dão conta
  const marker = Math.min(100, (m.rho / 2) * 100)
  return (
    <div className={`little ${stable ? 'little-ok' : 'little-over'}`}>
      <div className="little-head">
        <span className="little-badge">
          <Icon name={stable ? 'check' : 'alert'} size={18} />
        </span>
        <div>
          <strong>{stable ? 'Os caixas dão conta das chegadas' : 'Os caixas não dão conta das chegadas'}</strong>
          <span className="small muted">
            {stable
              ? `Cada caixa fica ocupado ${formatNumber(m.rho * 100, 0)}% do tempo enquanto chegam clientes.`
              : `Chega ${formatNumber(m.rho, 1)} vezes o que ${tellers} caixas atendem. Seriam precisos ${Math.floor(m.rho * tellers) + 1} caixas.`}
          </span>
        </div>
      </div>
      <div className="rho-meter" aria-label={`ρ = ${formatNumber(m.rho, 2)}`}>
        <span className="rho-marker" style={{ left: `${marker}%` }} />
        <span className="rho-tick">1</span>
      </div>
      <div className="little-kpis">
        <div>
          <span>ρ</span>
          <strong>{formatNumber(m.rho, 2)}</strong>
          <small>carga por caixa</small>
        </div>
        <div>
          <span>L</span>
          <strong>{formatNumber(m.littleL, 1)}</strong>
          <small>clientes na agência, em média</small>
        </div>
        <div>
          <span>Lq</span>
          <strong>{formatNumber(m.littleLq, 1)}</strong>
          <small>clientes na fila, em média</small>
        </div>
      </div>
      {!compact && (
        <details className="little-math">
          <summary className="small">Ver as contas</summary>
          <ul className="small">
            <li>ρ = λ × S ÷ c = {formatNumber(m.arrivalRate)}/s × {formatMs(m.serviceAvgMs)} ÷ {tellers}</li>
            <li>L = λ × W = {formatNumber(m.throughput)}/s × {formatMs(m.turnaroundAvgMs)}</li>
            <li>Lq = λ × Wq = {formatNumber(m.throughput)}/s × {formatMs(m.waitAvgMs)}</li>
            <li className="muted">
              No ρ, λ é a taxa de chegada e S o atendimento médio. No Teorema de Little, λ é a vazão da execução, W o
              tempo na agência e Wq a espera na fila.
              {run.status !== 'completed' && ' A execução não terminou, então os valores são parciais.'}
            </li>
          </ul>
        </details>
      )}
    </div>
  )
}

export function moodText(level: number): string {
  return MOOD_LABEL[Math.max(0, Math.min(4, Math.round(level))) as MoodLevel]
}

/** Faixa do índice: verde a partir de 70, amarelo a partir de 40, vermelho abaixo. */
export function satisfactionTone(value: number): 'good' | 'warn' | 'bad' {
  return value >= 70 ? 'good' : value >= 40 ? 'warn' : 'bad'
}

/** Índice de satisfação, humor e o que aconteceu na fila (desistências e eventos). */
export function SatisfactionPanel({ run }: { run: RunRecord }) {
  const m = run.metrics
  if (m.satisfaction === undefined || m.moodAvg === undefined || m.moodMedian === undefined || m.moodP90 === undefined) return null
  const tone = satisfactionTone(m.satisfaction)
  const moods: [string, number][] = [
    ['média', m.moodAvg],
    ['mediana', m.moodMedian],
    ['P90', m.moodP90],
  ]
  return (
    <div className={`satisfaction satisfaction-${tone}`}>
      <div className="satisfaction-head">
        <span className="satisfaction-score">
          <strong>{formatNumber(m.satisfaction, 1)}</strong>
          <small>de 100</small>
        </span>
        <div>
          <strong>Índice de satisfação</strong>
          <span className="small muted">
            mediana {formatNumber(m.satisfactionMedian ?? 0, 1)} · 10% piores com até {formatNumber(m.satisfactionP10 ?? 0, 1)}
          </span>
          <span className="small muted">
            preferenciais {m.satisfactionPref === undefined ? '-' : formatNumber(m.satisfactionPref, 1)} · comuns{' '}
            {m.satisfactionCommon === undefined ? '-' : formatNumber(m.satisfactionCommon, 1)}
          </span>
        </div>
      </div>
      <div className="satisfaction-moods" aria-label="Humor ao ser chamado ou desistir">
        {moods.map(([label, value]) => (
          <div key={label}>
            <Face mood={moodFace(value)} size={26} />
            <span className="small">
              <strong>{moodText(value)}</strong> {formatNumber(value, 1)}
            </span>
            <small className="muted">{label} do humor</small>
          </div>
        ))}
      </div>
      <div className="satisfaction-events small">
        <span className={m.gaveUp ? 'bad' : ''}>
          <Icon name="door" size={14} /> {m.gaveUp ?? 0} desistiram ({m.gaveUpPref ?? 0} pref., {m.gaveUpCommon ?? 0} comuns)
        </span>
        <span className={m.elderlySick ? 'bad' : ''}>
          <Icon name="alert" size={14} /> {m.elderlySick ?? 0} idosos passaram mal
        </span>
        <span>
          <Icon name="baby" size={14} /> {m.infantFloor ?? 0} crianças no chão
        </span>
        <span className="muted">paciência de {formatMs(m.patienceMs ?? run.config.patienceMs)}</span>
      </div>
    </div>
  )
}

/** Resumo das métricas de uma execução. */
export function MetricsSummary({ run }: { run: RunRecord }) {
  const m = run.metrics
  const items: [string, string, boolean?][] = [
    ['Makespan', formatMs(m.makespanMs)],
    ['Atendidos', `${m.served}/${m.total}${m.refused ? ` (${m.refused} recusados)` : ''}`],
    ...(m.gaveUp !== undefined ? [['Desistências', String(m.gaveUp), m.gaveUp > 0] as [string, string, boolean]] : []),
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
      <SatisfactionPanel run={run} />
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
