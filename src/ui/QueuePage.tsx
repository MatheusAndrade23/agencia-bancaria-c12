import { useEffect, useMemo, useRef, useState } from 'react'
import { scenarioId } from '../sim/queue'
import {
  OPS, OP_TRANSFER, accountName, formatMoney,
  type Client, type ScenarioConfig,
} from '../sim/types'
import { PALETTE, formatMs, formatNumber, sequentialInk } from './theme'

interface Props {
  config: ScenarioConfig
  clients: Client[]
  scenarioName: string
  onGoToSimulation(): void
}

const CHIP_WIDTH = 38
const LANE_HEIGHT = 24

function clientTitle(client: Client): string {
  const accounts = `${accountName(client.from)}${client.to >= 0 ? ` → ${accountName(client.to)}` : ''}`
  return (
    `Cliente #${client.id}${client.priority === 1 ? ' (preferencial)' : ''}\n` +
    `${OPS[client.op].label} · ${formatMoney(client.amount)} · conta ${accounts}\n` +
    `chega em ${formatMs(client.arrivalUs / 1000)} · dura ${formatMs(client.durationUs / 1000)}`
  )
}

/** Chip pequeno de um cliente: cor = operação, estrela = preferencial. */
function MiniChip({ client, style }: { client: Client; style?: React.CSSProperties }) {
  return (
    <span
      className={`mini-chip op-${OPS[client.op].key} ${client.priority === 1 ? 'mini-chip-pref' : ''}`}
      style={style}
      title={clientTitle(client)}
    >
      {client.priority === 1 && <span aria-hidden>★</span>}
      {client.id}
    </span>
  )
}

/** Linha do tempo das chegadas: cada cliente aparece no instante em que entra na agência. */
function ArrivalTimeline({ clients }: { clients: Client[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(800)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(Math.max(200, element.clientWidth)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const spanUs = Math.max(1, clients[clients.length - 1]?.arrivalUs ?? 1)
  const { placed, lanes } = useMemo(() => {
    // empilha em faixas os clientes que chegam quase juntos, para os chips não se sobreporem
    const laneRight: number[] = []
    const placed = clients.map((client) => {
      const x = (client.arrivalUs / spanUs) * (width - CHIP_WIDTH)
      let lane = laneRight.findIndex((right) => right + 2 <= x)
      if (lane < 0) lane = laneRight.length
      laneRight[lane] = x + CHIP_WIDTH
      return { client, x, lane }
    })
    return { placed, lanes: Math.max(1, laneRight.length) }
  }, [clients, spanUs, width])

  return (
    <div className="arrivals" ref={ref}>
      <div className="arrivals-plot" style={{ height: lanes * LANE_HEIGHT }}>
        {placed.map(({ client, x, lane }) => (
          <MiniChip key={client.id} client={client} style={{ position: 'absolute', left: x, bottom: lane * LANE_HEIGHT, width: CHIP_WIDTH - 2 }} />
        ))}
      </div>
      <div className="arrivals-axis">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <span key={fraction} style={{ left: `${fraction * 100}%` }} className={fraction === 0 ? 'tick-first' : fraction === 1 ? 'tick-last' : ''}>
            {formatMs((spanUs * fraction) / 1000)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Tela que mostra, antes de rodar, como é a fila que o cenário gera. */
export function QueuePage({ config, clients, scenarioName, onGoToSimulation }: Props) {
  const [asTable, setAsTable] = useState(false)

  const stats = useMemo(() => {
    const preferential = clients.filter((c) => c.priority === 1).length
    const workUs = clients.reduce((sum, c) => sum + c.durationUs + config.criticalWindowMs * 1000, 0)
    const spanUs = clients[clients.length - 1]?.arrivalUs ?? 0
    const counts = OPS.map((_, op) => clients.filter((c) => c.op === op).length)
    // quanto trabalho chega por unidade de tempo, comparado ao que os caixas conseguem atender
    const pressure = spanUs > 0 ? workUs / config.tellers / spanUs : Infinity
    return { preferential, workUs, spanUs, counts, pressure }
  }, [clients, config])

  const transfers = useMemo(() => {
    const matrix = Array.from({ length: config.accounts }, () => new Array<number>(config.accounts).fill(0))
    for (const client of clients) if (client.op === OP_TRANSFER) matrix[client.from][client.to]++
    let crossed = 0
    for (let a = 0; a < config.accounts; a++) for (let b = a + 1; b < config.accounts; b++) if (matrix[a][b] > 0 && matrix[b][a] > 0) crossed++
    return { matrix, crossed, max: Math.max(1, ...matrix.flat()), total: matrix.flat().reduce((a, b) => a + b, 0) }
  }, [clients, config.accounts])

  const ramp = PALETTE.sequential
  const pressureText =
    stats.pressure > 1.15
      ? 'chega mais trabalho do que os caixas atendem: a fila acumula'
      : stats.pressure > 0.85
        ? 'chegadas e atendimento quase empatados'
        : 'os caixas dão conta: a fila fica curta'

  return (
    <div className="queue-page">
      <section className="panel">
        <header className="panel-header">
          <h2>Fila do cenário</h2>
          <span className="muted">
            {scenarioName} · seed {config.seed} · <code>{scenarioId(config)}</code>
          </span>
          <span className="spacer" />
          <button type="button" className="btn btn-primary" onClick={onGoToSimulation}>
            Simular este cenário →
          </button>
        </header>
        <p className="muted small">
          Esta é a fila que será usada em todas as execuções deste cenário. A mesma seed gera sempre exatamente estes
          clientes, nesta ordem de chegada. Mude a configuração à esquerda e a fila se atualiza na hora.
        </p>
        <dl className="metric-grid tiles">
          <div className="metric">
            <dt>Clientes</dt>
            <dd>{clients.length}</dd>
          </div>
          <div className="metric">
            <dt>Preferenciais</dt>
            <dd>
              ★ {stats.preferential} <small>({formatNumber((stats.preferential / clients.length) * 100, 0)}%)</small>
            </dd>
          </div>
          <div className="metric">
            <dt>Última chegada em</dt>
            <dd>{formatMs(stats.spanUs / 1000)}</dd>
          </div>
          <div className="metric">
            <dt>Trabalho total</dt>
            <dd>
              {formatMs(stats.workUs / 1000)} <small>÷ {config.tellers} caixas</small>
            </dd>
          </div>
          <div className="metric metric-wide">
            <dt>Pressão sobre os caixas</dt>
            <dd>
              {Number.isFinite(stats.pressure) ? `${formatNumber(stats.pressure)}×` : '—'} <small>{pressureText}</small>
            </dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>Chegadas ao longo do tempo</h2>
          <span className="muted">cada chip é um cliente, posicionado no instante em que chega</span>
        </header>
        <ArrivalTimeline clients={clients} />
        <div className="legend">
          {OPS.map((op, i) => (
            <span key={op.key} className={`op-${op.key}`}>
              <i className="dot" /> {op.icon} {op.label} <strong>{stats.counts[i]}</strong>
            </span>
          ))}
          <span>
            <span className="mini-chip mini-chip-pref legend-chip">★</span> preferencial
          </span>
        </div>
      </section>

      <div className="queue-split">
        <section className="panel">
          <header className="panel-header">
            <h2>Composição</h2>
          </header>
          <h3>Tipos de operação</h3>
          <div className="stack-bar" role="img" aria-label="Proporção de cada tipo de operação">
            {OPS.map((op, i) =>
              stats.counts[i] > 0 ? (
                <span key={op.key} className={`op-${op.key}`} style={{ flexGrow: stats.counts[i] }} title={`${op.label}: ${stats.counts[i]}`}>
                  {op.icon} {stats.counts[i]}
                </span>
              ) : null,
            )}
          </div>
          <h3>Prioridade</h3>
          <div className="stack-bar" role="img" aria-label="Proporção de preferenciais e comuns">
            {stats.preferential > 0 && (
              <span className="bar-pref" style={{ flexGrow: stats.preferential }}>
                ★ {stats.preferential} preferenciais
              </span>
            )}
            {clients.length - stats.preferential > 0 && (
              <span className="bar-common" style={{ flexGrow: clients.length - stats.preferential }}>
                {clients.length - stats.preferential} comuns
              </span>
            )}
          </div>
        </section>

        <section className="panel">
          <header className="panel-header">
            <h2>Transferências entre contas</h2>
            <span className="muted">{transfers.total} no total</span>
          </header>
          {transfers.total === 0 ? (
            <p className="empty">Este cenário não tem transferências.</p>
          ) : (
            <>
              <div className="table-scroll">
                <table className="heatmap transfer-matrix">
                  <thead>
                    <tr>
                      <th>origem ↓ destino →</th>
                      {transfers.matrix.map((_, b) => (
                        <th key={b}>{accountName(b)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {transfers.matrix.map((row, a) => (
                      <tr key={a}>
                        <th>{accountName(a)}</th>
                        {row.map((count, b) => {
                          if (a === b) return <td key={b} className="heat-empty" />
                          if (count === 0) return <td key={b} className="heat-empty">0</td>
                          const step = Math.min(ramp.length - 1, Math.floor((count / transfers.max) * (ramp.length - 1)))
                          const crossed = transfers.matrix[b][a] > 0
                          return (
                            <td key={b} style={{ background: ramp[step], color: sequentialInk(step) }} title={`${count} transferências de ${accountName(a)} para ${accountName(b)}`}>
                              <strong>
                                {count}
                                {crossed ? ' ⇄' : ''}
                              </strong>
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted small">
                {transfers.crossed > 0
                  ? `⇄ ${transfers.crossed} par${transfers.crossed === 1 ? '' : 'es'} de contas com transferências nos dois sentidos: é aí que o lock por cofre sem ordenação pode entrar em deadlock.`
                  : 'Nenhum par de contas tem transferências nos dois sentidos, então não há como formar o ciclo de espera clássico.'}
              </p>
            </>
          )}
        </section>
      </div>

      <section className="panel">
        <header className="panel-header">
          <h2>Todos os clientes</h2>
          <span className="muted">em ordem de chegada</span>
          <span className="spacer" />
          <div className="segmented">
            <button type="button" className={asTable ? 'seg' : 'seg seg-active'} onClick={() => setAsTable(false)}>
              Cartões
            </button>
            <button type="button" className={asTable ? 'seg seg-active' : 'seg'} onClick={() => setAsTable(true)}>
              Tabela
            </button>
          </div>
        </header>
        {asTable ? (
          <div className="table-scroll queue-table-full">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Chegada</th>
                  <th>Prioridade</th>
                  <th>Operação</th>
                  <th>Contas</th>
                  <th className="num">Valor</th>
                  <th className="num">Duração</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>{client.id}</td>
                    <td>{formatMs(client.arrivalUs / 1000)}</td>
                    <td>{client.priority === 1 ? '★ Preferencial' : 'Comum'}</td>
                    <td>
                      <span className={`dot op-${OPS[client.op].key}`} /> {OPS[client.op].label}
                    </td>
                    <td>
                      {accountName(client.from)}
                      {client.to >= 0 ? ` → ${accountName(client.to)}` : ''}
                    </td>
                    <td className="num">{formatMoney(client.amount)}</td>
                    <td className="num">{formatMs(client.durationUs / 1000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="queue">
            {clients.map((client) => {
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
                  <div className="queue-wait">
                    chega {formatMs(client.arrivalUs / 1000)} · dura {formatMs(client.durationUs / 1000)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
