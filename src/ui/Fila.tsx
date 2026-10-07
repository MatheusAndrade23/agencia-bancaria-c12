import type { AgencyView } from '../sim/timeline'
import { OPS, accountName, formatMoney, type Client } from '../sim/types'
import { formatMs } from './theme'

const MAX_CARDS = 28

interface Props {
  clients: Client[]
  view: AgencyView
}

export function ClientChip({ client, compact }: { client: Client; compact?: boolean }) {
  const op = OPS[client.op]
  return (
    <span className={`chip op-${op.key}`}>
      <span aria-hidden>{op.icon}</span> #{client.id} {compact ? op.short : op.label}
      {client.priority === 1 && <span className="badge-pref" title="Preferencial">★</span>}
    </span>
  )
}

/** Fila de clientes que já chegaram e ainda não foram chamados. */
export function Fila({ clients, view }: Props) {
  const shown = view.queue.slice(0, MAX_CARDS)
  const hidden = view.queue.length - shown.length
  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Fila</h2>
        <span className="muted">
          {view.queue.length} esperando · {view.notArrived} a caminho · {view.done} atendidos
        </span>
      </header>
      <div className="queue">
        {shown.length === 0 && <div className="empty">Ninguém na fila.</div>}
        {shown.map((item) => {
          const client = clients[item.client]
          const op = OPS[client.op]
          return (
            <div key={client.id} className={`queue-card op-${op.key}`}>
              <div className="queue-card-top">
                <span className="queue-id">#{client.id}</span>
                {client.priority === 1 && <span className="badge-pref-full">★ Pref.</span>}
              </div>
              <div className="queue-op">
                <span aria-hidden>{op.icon}</span> {op.label}
              </div>
              <div className="muted small">
                {formatMoney(client.amount)} · {accountName(client.from)}
                {client.to >= 0 ? ` → ${accountName(client.to)}` : ''}
              </div>
              <div className="queue-wait">⏱ {formatMs(item.waitUs / 1000)}</div>
            </div>
          )
        })}
        {hidden > 0 && <div className="queue-more">+{hidden} na fila</div>}
      </div>
    </section>
  )
}
