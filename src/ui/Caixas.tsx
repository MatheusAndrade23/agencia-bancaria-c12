import type { AgencyView, TellerViewState } from '../sim/timeline'
import { OPS, accountName, formatMoney, lockName, type Client, type ScenarioConfig } from '../sim/types'

const STATE_LABEL: Record<TellerViewState, string> = {
  idle: 'Livre',
  serving: 'Atendendo',
  waiting: 'Esperando lock',
  deadlock: 'DEADLOCK',
  finished: 'Encerrado',
}
const STATE_ICON: Record<TellerViewState, string> = {
  idle: '○',
  serving: '●',
  waiting: '⏳',
  deadlock: '☠',
  finished: '✓',
}

interface Props {
  config: ScenarioConfig
  clients: Client[]
  view: AgencyView
}

/** Os caixas (cada um é um Web Worker), lado a lado. */
export function Caixas({ config, clients, view }: Props) {
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Caixas</h2>
        <span className="muted">cada caixa é uma thread (Web Worker)</span>
      </header>
      <div className="tellers">
        {view.tellers.map((teller, t) => {
          const client = teller.client >= 0 ? clients[teller.client] : undefined
          const op = client ? OPS[client.op] : undefined
          return (
            <div key={t} className={`teller teller-${teller.state}`}>
              <div className="teller-head">
                <strong>Caixa {t + 1}</strong>
                <span className="teller-state">
                  <span aria-hidden>{STATE_ICON[teller.state]}</span> {STATE_LABEL[teller.state]}
                </span>
              </div>
              {client && op ? (
                <div className="teller-body">
                  <div className={`teller-client op-${op.key}`}>
                    <span aria-hidden>{op.icon}</span> #{client.id} · {op.label}
                    {client.priority === 1 && <span className="badge-pref">★</span>}
                  </div>
                  <div className="muted small">
                    {formatMoney(client.amount)} · {accountName(client.from)}
                    {client.to >= 0 ? ` → ${accountName(client.to)}` : ''}
                  </div>
                  <div className="progress" aria-label="Progresso do atendimento">
                    <div className="progress-bar" style={{ width: `${Math.round(teller.progress * 100)}%` }} />
                  </div>
                  <div className="teller-locks small">
                    {teller.holding.map((lock) => (
                      <span key={`h${lock}`} className="lock-tag">
                        🔒 {lockName(lock, config.accounts)}
                      </span>
                    ))}
                    {teller.waitingFor >= 0 && (
                      <span className="lock-tag lock-tag-wait">⏳ quer {lockName(teller.waitingFor, config.accounts)}</span>
                    )}
                  </div>
                </div>
              ) : (
                <div className="teller-body teller-empty muted small">
                  {teller.state === 'finished' ? 'Expediente encerrado.' : 'Aguardando o próximo cliente…'}
                </div>
              )}
              <div className="teller-foot muted small">{teller.served} atendidos</div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
