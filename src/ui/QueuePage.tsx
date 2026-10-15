import { useEffect, useMemo, useRef, useState } from 'react'
import { scenarioId } from '../sim/queue'
import { OPS, accountName, formatMoney, type Client, type ScenarioConfig } from '../sim/types'
import { Icon, OpIcon, Person } from './icons'
import { formatMs, formatNumber, usePalette } from './theme'

interface Props {
  config: ScenarioConfig
  clients: Client[]
  scenarioName: string
  onGoToSimulation(): void
}

const AVATAR_WIDTH = 30
const LANE_HEIGHT = 44
const BUCKETS = 14

function clientTitle(client: Client): string {
  const accounts = `${accountName(client.from)}${client.to >= 0 ? ` → ${accountName(client.to)}` : ''}`
  return (
    `Cliente #${client.id}${client.priority === 1 ? ' (preferencial)' : ''}\n` +
    `${OPS[client.op].label} de ${formatMoney(client.amount)}, conta ${accounts}\n` +
    `chega em ${formatMs(client.arrivalUs / 1000)} e leva ${formatMs(client.durationUs / 1000)}`
  )
}

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const element = ref.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(Math.max(200, element.clientWidth)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** Cada cliente aparece no instante em que chega, como gente andando na calçada até a agência. */
function ArrivalStreet({ clients }: { clients: Client[] }) {
  const palette = usePalette()
  const [ref, width] = useWidth<HTMLDivElement>(900)
  const spanUs = Math.max(1, clients[clients.length - 1]?.arrivalUs ?? 1)
  const { placed, lanes } = useMemo(() => {
    // quem chega quase junto vai para outra faixa, para ninguém ficar em cima do outro
    const laneRight: number[] = []
    const placed = clients.map((client) => {
      const x = (client.arrivalUs / spanUs) * (width - AVATAR_WIDTH)
      let lane = laneRight.findIndex((right) => right + 2 <= x)
      if (lane < 0) lane = laneRight.length
      laneRight[lane] = x + AVATAR_WIDTH
      return { client, x, lane }
    })
    return { placed, lanes: Math.max(1, laneRight.length) }
  }, [clients, spanUs, width])

  return (
    <div className="street" ref={ref}>
      <div className="street-crowd" style={{ height: lanes * LANE_HEIGHT + 6 }}>
        {placed.map(({ client, x, lane }) => (
          <div key={client.id} className="street-person" style={{ left: x, bottom: lane * LANE_HEIGHT + 4 }} title={clientTitle(client)}>
            <Person mood="happy" color={palette.ops[client.op]} preferential={client.priority === 1} size={34} />
            <span>{client.id}</span>
          </div>
        ))}
      </div>
      <div className="street-road" />
      <div className="street-axis">
        {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
          <span key={fraction} style={{ left: `${fraction * 100}%` }} className={fraction === 0 ? 'tick-first' : fraction === 1 ? 'tick-last' : ''}>
            {formatMs((spanUs * fraction) / 1000)}
          </span>
        ))}
      </div>
    </div>
  )
}

/** Chegadas por intervalo comparadas com o que os caixas conseguem atender no mesmo intervalo. */
function ArrivalRhythm({ clients, config }: { clients: Client[]; config: ScenarioConfig }) {
  const spanUs = Math.max(1, clients[clients.length - 1]?.arrivalUs ?? 1)
  const bucketUs = spanUs / BUCKETS
  const counts = new Array<number>(BUCKETS).fill(0)
  for (const client of clients) counts[Math.min(BUCKETS - 1, Math.floor(client.arrivalUs / bucketUs))]++
  const serviceUs = clients.reduce((sum, c) => sum + c.durationUs, 0) / Math.max(1, clients.length) + config.criticalWindowMs * 1000
  const capacity = (config.tellers * bucketUs) / serviceUs
  const top = Math.max(capacity, ...counts) * 1.15
  const height = 150
  const y = (value: number) => height - (value / top) * height

  return (
    <div className="rhythm">
      <svg viewBox={`0 0 ${BUCKETS * 40} ${height + 22}`} preserveAspectRatio="none" className="rhythm-svg" role="img" aria-label="Chegadas por intervalo de tempo e capacidade dos caixas">
        {counts.map((count, i) => (
          <g key={i}>
            <rect
              x={i * 40 + 5}
              y={y(count)}
              width={30}
              height={height - y(count)}
              rx={3}
              className={count > capacity ? 'rhythm-bar rhythm-over' : 'rhythm-bar'}
            >
              <title>{`${count} chegadas entre ${formatMs((i * bucketUs) / 1000)} e ${formatMs(((i + 1) * bucketUs) / 1000)}`}</title>
            </rect>
            {count > 0 && (
              <text x={i * 40 + 20} y={y(count) - 4} textAnchor="middle" className="rhythm-label">
                {count}
              </text>
            )}
          </g>
        ))}
        <line x1={0} x2={BUCKETS * 40} y1={y(capacity)} y2={y(capacity)} className="rhythm-capacity" />
        <line x1={0} x2={BUCKETS * 40} y1={height} y2={height} className="rhythm-base" />
      </svg>
      <div className="rhythm-legend small">
        <span>
          <i className="swatch rhythm-swatch" /> chegadas por intervalo de {formatMs(bucketUs / 1000)}
        </span>
        <span>
          <i className="swatch rhythm-swatch rhythm-swatch-over" /> acima da capacidade
        </span>
        <span>
          <i className="rhythm-line-swatch" /> os {config.tellers} caixas atendem cerca de {formatNumber(capacity)} clientes por intervalo
        </span>
      </div>
    </div>
  )
}

/** Tela que mostra, antes de rodar, como é a fila que o cenário gera. */
export function QueuePage({ config, clients, scenarioName, onGoToSimulation }: Props) {
  const stats = useMemo(() => {
    const preferential = clients.filter((c) => c.priority === 1).length
    const workUs = clients.reduce((sum, c) => sum + c.durationUs + config.criticalWindowMs * 1000, 0)
    const spanUs = clients[clients.length - 1]?.arrivalUs ?? 0
    const ops = OPS.map((op, i) => {
      const mine = clients.filter((c) => c.op === i)
      const avgMs = mine.length ? mine.reduce((sum, c) => sum + c.durationUs, 0) / mine.length / 1000 : 0
      return { op, count: mine.length, avgMs }
    })
    const slowest = ops.filter((o) => o.count > 0).reduce((a, b) => (b.avgMs > a.avgMs ? b : a), ops[0])
    const pressure = spanUs > 0 ? workUs / config.tellers / spanUs : Infinity
    return { preferential, spanUs, ops, slowest, pressure }
  }, [clients, config])

  const pressureText =
    stats.pressure > 1.15
      ? 'chega mais trabalho do que os caixas atendem, então a fila vai crescer'
      : stats.pressure > 0.85
        ? 'chegadas e atendimento quase empatados'
        : 'os caixas dão conta e a fila fica curta'
  const common = clients.length - stats.preferential

  return (
    <div className="queue-page">
      <section className="hero">
        <div className="hero-title">
          <span className="hero-kicker">Fila do cenário</span>
          <h2>{scenarioName}</h2>
          <span className="hero-meta">
            seed {config.seed} · <code>{scenarioId(config)}</code> · a mesma seed gera sempre esta fila
          </span>
        </div>
        <div className="hero-kpis">
          <div>
            <strong>{clients.length}</strong>
            <span>clientes</span>
          </div>
          <div>
            <strong>{stats.preferential}</strong>
            <span>preferenciais</span>
          </div>
          <div>
            <strong>{formatMs(stats.spanUs / 1000)}</strong>
            <span>até o último chegar</span>
          </div>
          <div>
            <strong>{Number.isFinite(stats.pressure) ? `${formatNumber(stats.pressure)}x` : '-'}</strong>
            <span>pressão sobre os caixas</span>
          </div>
        </div>
        <button type="button" className="btn hero-btn" onClick={onGoToSimulation}>
          Simular este cenário <Icon name="arrow-right" size={16} />
        </button>
      </section>

      <section className="panel">
        <header className="panel-header">
          <h2>
            <Icon name="users" size={18} /> Chegando na agência
          </h2>
          <span className="muted">cada pessoa aparece no instante em que chega; a cor da roupa é a operação</span>
        </header>
        <ArrivalStreet clients={clients} />
        <div className="legend">
          {OPS.map((op) => (
            <span key={op.key}>
              <OpIcon op={op.key} size={18} /> {op.label}
            </span>
          ))}
          <span>
            <Icon name="star" size={14} className="star" /> preferencial
          </span>
        </div>
      </section>

      <div className="queue-split">
        <section className="panel">
          <header className="panel-header">
            <h2>
              <Icon name="gauge" size={18} /> Ritmo de chegada
            </h2>
          </header>
          <p className="muted small rhythm-caption">Pressão de {Number.isFinite(stats.pressure) ? `${formatNumber(stats.pressure)}x` : '-'}: {pressureText}.</p>
          <ArrivalRhythm clients={clients} config={config} />
        </section>

        <section className="panel">
          <header className="panel-header">
            <h2>
              <Icon name="star" size={18} className="star" /> Prioridade
            </h2>
          </header>
          <div className="priority-split">
            <div className="priority-side">
              <Person mood="happy" color="var(--brand)" preferential size={56} />
              <strong>{stats.preferential}</strong>
              <span className="muted small">preferenciais</span>
            </div>
            <div className="priority-bar" role="img" aria-label={`${stats.preferential} preferenciais e ${common} comuns`}>
              <span className="priority-pref" style={{ flexGrow: Math.max(stats.preferential, 0.001) }} />
              <span className="priority-common" style={{ flexGrow: Math.max(common, 0.001) }} />
            </div>
            <div className="priority-side">
              <Person mood="happy" color="var(--neutral-fill)" size={56} />
              <strong>{common}</strong>
              <span className="muted small">comuns</span>
            </div>
          </div>
          <p className="muted small">
            Na Prioridade pura, os comuns só são chamados quando não há preferencial esperando. Com aging, quem espera muito
            sobe de prioridade.
          </p>
        </section>
      </div>

      <section className="panel">
        <header className="panel-header">
          <h2>O que cada cliente veio fazer</h2>
          <span className="muted">tempo médio de atendimento, sem contar a janela crítica de {config.criticalWindowMs} ms</span>
        </header>
        <div className="op-tiles">
          {stats.ops.map(({ op, count, avgMs }) => (
            <div key={op.key} className={`op-tile op-${op.key} ${count === 0 ? 'op-tile-empty' : ''}`}>
              <div className="op-tile-head">
                <OpIcon op={op.key} size={36} />
                {op === stats.slowest.op && count > 0 && <span className="tag-brand">mais demorada</span>}
              </div>
              <span className="op-tile-name">{op.label}</span>
              <strong className="op-tile-count">{count}</strong>
              <div className="op-tile-share">
                <span style={{ width: `${(count / Math.max(1, clients.length)) * 100}%` }} />
              </div>
              <span className="muted small">
                {formatNumber((count / Math.max(1, clients.length)) * 100, 0)}% da fila · {count ? formatMs(avgMs) : '-'} cada
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
