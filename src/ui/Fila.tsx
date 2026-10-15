import { Icon, OpIcon, PrefStar } from './icons'
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
      <OpIcon op={op.key} size={18} /> #{client.id} {compact ? op.short : op.label}
      {client.priority === 1 && <PrefStar />}
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
          {view.gaveUp > 0 && ` · ${view.gaveUp} desistiram`}
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
                {client.priority === 1 && <span className="badge-pref-full"><PrefStar size={11} /> {client.kind === 1 ? 'Idoso' : 'Criança'}</span>}
              </div>
              <div className="queue-op">
                <OpIcon op={op.key} size={18} /> {op.label}
              </div>
              <div className="muted small">
                {formatMoney(client.amount)} · {accountName(client.from)}
                {client.to >= 0 ? ` → ${accountName(client.to)}` : ''}
              </div>
              <div className="queue-wait">
                <Icon name="clock" size={12} /> {formatMs(item.waitUs / 1000)}
                {item.sick && <span className="bad"> · passou mal</span>}
                {item.floor && <span className="muted"> · criança no chão</span>}
              </div>
            </div>
          )
        })}
        {hidden > 0 && <div className="queue-more">+{hidden} na fila</div>}
      </div>
    </section>
  )
}
