import { lockName, type DeadlockInfo } from '../sim/types'
import { formatMs } from './theme'

/** "Caixa 1 → Conta A → Caixa 2 → Conta B → Caixa 1" */
export function cycleText(deadlock: DeadlockInfo, accounts: number): string {
  if (deadlock.cycle.length === 0) return ''
  const parts = deadlock.cycle.flatMap((step) => [`Caixa ${step.teller + 1}`, lockName(step.lock, accounts)])
  return [...parts, `Caixa ${deadlock.cycle[0].teller + 1}`].join(' → ')
}

interface Props {
  deadlock: DeadlockInfo
  accounts: number
}

/** Desenha o ciclo do grafo de espera que causou o deadlock. */
export function DeadlockPanel({ deadlock, accounts }: Props) {
  const nodes = deadlock.cycle.flatMap((step) => [
    { kind: 'teller' as const, label: `Caixa ${step.teller + 1}` },
    { kind: 'lock' as const, label: lockName(step.lock, accounts) },
  ])
  const width = 380
  const height = 230
  const points = nodes.map((_, i) => {
    const angle = (i / nodes.length) * Math.PI * 2 - Math.PI
    return { x: width / 2 + Math.cos(angle) * 130, y: height / 2 + Math.sin(angle) * 78 }
  })

  return (
    <section className="panel deadlock-panel" role="alert">
      <header className="panel-header">
        <h2>☠ Deadlock detectado em {formatMs(deadlock.atUs / 1000)}</h2>
      </header>
      {deadlock.reason === 'cycle' ? (
        <>
          <p className="cycle-text">{cycleText(deadlock, accounts)}</p>
          <svg viewBox={`0 0 ${width} ${height}`} className="cycle-svg" role="img" aria-label="Ciclo de espera">
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" className="cycle-arrow-head" />
              </marker>
            </defs>
            {points.map((from, i) => {
              const to = points[(i + 1) % points.length]
              const dx = to.x - from.x
              const dy = to.y - from.y
              const length = Math.hypot(dx, dy) || 1
              const pad = 40
              return (
                <line
                  key={i}
                  x1={from.x + (dx / length) * pad}
                  y1={from.y + (dy / length) * pad * 0.6}
                  x2={to.x - (dx / length) * pad}
                  y2={to.y - (dy / length) * pad * 0.6}
                  className={nodes[i].kind === 'teller' ? 'cycle-edge cycle-edge-wait' : 'cycle-edge'}
                  markerEnd="url(#arrow)"
                />
              )
            })}
            {nodes.map((node, i) => (
              <g key={i} transform={`translate(${points[i].x} ${points[i].y})`}>
                <rect x={-38} y={-15} width={76} height={30} rx={node.kind === 'teller' ? 6 : 15} className={`cycle-node cycle-node-${node.kind}`} />
                <text textAnchor="middle" dominantBaseline="central" className="cycle-label">
                  {node.label}
                </text>
              </g>
            ))}
          </svg>
          <p className="muted small">
            Seta tracejada: o caixa <em>espera</em> o cadeado. Seta contínua: o cadeado <em>está em posse</em> do caixa.
            Ninguém solta o que tem, então ninguém consegue o que quer.
          </p>
        </>
      ) : (
        <p>
          Nenhum progresso com caixas esperando lock: {deadlock.blockedTellers.map((t) => `Caixa ${t + 1}`).join(', ')}.
        </p>
      )}
      <p className="muted small">Os workers foram encerrados e a execução foi salva com as métricas parciais.</p>
    </section>
  )
}
