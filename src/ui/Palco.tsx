import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { eventAt, moodLevel, outcomesAt, patienceUs as patienceOf, summarize } from '../sim/satisfaction'
import type { AgencyView } from '../sim/timeline'
import {
  KIND_ELDERLY, KIND_INFANT, OPS, OP_BILL, OP_DEPOSIT, OP_LOAN, OP_TRANSFER, OP_WITHDRAW, RESULT_OK, RESULT_REFUSED,
  accountName, formatMoney,
  type Client, type DeadlockInfo, type LockMode, type ScenarioConfig, type Timeline,
} from '../sim/types'
import { cycleText } from './DeadlockPanel'
import { Face, Icon, Person, Teller, moodFace, type Mood } from './icons'
import { moodText, satisfactionTone } from './MetricsSummary'
import { Saguao, stageLayout } from './Saguao'
import { formatMs, formatNumber, usePalette } from './theme'

interface Props {
  config: ScenarioConfig
  clients: Client[]
  lockMode: LockMode
  timeline: Timeline
  view: AgencyView
  tUs: number
  /** duração das animações de dinheiro, em µs do tempo da simulação */
  fxUs: number
  deadlock?: DeadlockInfo
  /** linha de título (algoritmo, status, tempo) */
  header: ReactNode
  /** barra de controles no rodapé */
  footer: ReactNode
  /** resumo mostrado sobre o palco quando a execução termina */
  summary?: ReactNode
}

interface Point {
  x: number
  y: number
}

const STATE_LABEL = { idle: 'Livre', serving: 'Atendendo', waiting: 'Esperando lock', deadlock: 'DEADLOCK', finished: 'Encerrado' }

const MOOD_CLASS = ['calm', 'calm', 'bored', 'angry', 'furious'] as const

/** Humor de quem espera: vai piorando conforme a paciência acaba (mesma escala das métricas). */
function mood(ratio: number): { face: Mood; level: (typeof MOOD_CLASS)[number] } {
  const level = moodLevel(ratio)
  return { face: moodFace(level), level: MOOD_CLASS[level] }
}

function lerp(a: Point, b: Point, p: number, arc = 0): Point {
  const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2
  return { x: a.x + (b.x - a.x) * eased, y: a.y + (b.y - a.y) * eased - Math.sin(p * Math.PI) * arc }
}

/**
 * Modo tela cheia: a agência desenhada como um palco. As pessoas entram pela porta,
 * esperam na fila (e vão perdendo a paciência), andam até o caixa e o dinheiro circula
 * entre os cofres. Tudo é função do instante `tUs`, como no resto da simulação.
 */
export function Palco({ config, clients, lockMode, timeline, view, tUs, fxUs, deadlock, header, footer, summary }: Props) {
  const palette = usePalette()
  const floorRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 1200, h: 640 })
  useEffect(() => {
    const element = floorRef.current
    if (!element) return
    const measure = () => setSize({ w: Math.max(480, element.clientWidth), h: Math.max(420, element.clientHeight) })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // paciência do cenário: quem espera isso sem ser chamado vai embora
  const patienceUs = patienceOf(config)

  // índice de satisfação ao vivo: só quem já foi atendido ou desistiu até o instante t
  const live = useMemo(() => {
    const wrong = view.accounts.map((account) => account.balance !== account.expected)
    return summarize(clients, outcomesAt(config, clients, timeline, tUs, wrong))
  }, [config, clients, timeline, tUs, view.accounts])

  const { w, h } = size
  const layout = stageLayout(w, h, config.accounts, config.tellers)
  const { vaultY, tellerY, serveY, queueTop, vaultW, tellerW, vaultAt, tellerAt, door, rows, rowHeight, lineWidth, queueLeft } = layout
  const globalAt: Point = { x: w / 2, y: (vaultY + tellerY) / 2 + 4 }
  const lockAt = (lock: number): Point => (lock >= config.accounts ? globalAt : { x: vaultAt(lock).x, y: vaultY + 44 })

  // fila em cobrinha: o primeiro da fila fica à esquerda da primeira fileira e cada fileira
  // seguinte volta no sentido contrário; aperta os lugares se não couber
  const slotWidth = Math.max(24, Math.min(62, (lineWidth * rows) / Math.max(1, view.queue.length)))
  const perRow = Math.max(1, Math.floor(lineWidth / slotWidth))
  const slotAt = (position: number): Point => {
    const row = Math.min(rows - 1, Math.floor(position / perRow))
    const column = position % perRow
    return {
      x: queueLeft + (row % 2 === 0 ? column : perRow - 1 - column) * slotWidth + slotWidth / 2,
      y: queueTop + row * rowHeight,
    }
  }

  const queuePosition = new Map(view.queue.map((item, position) => [item.client, position]))
  const queueItem = new Map(view.queue.map((item) => [item.client, item]))
  const cycleTellers = new Set(deadlock && view.deadlockVisible ? deadlock.cycle.map((s) => s.teller) : [])

  // ---- pessoas ----
  const people: ReactNode[] = []
  let angry = 0
  let furious = 0
  let worst = { ratio: 0, client: -1, waitUs: 0 }
  const waits = { pref: [] as number[], common: [] as number[] }
  timeline.clients.forEach((trace, i) => {
    const client = clients[i]
    if (!client) return
    const op = OPS[client.op]
    let at: Point
    let face: Mood = 'happy'
    let level = 'calm'
    let opacity = 1
    let ratio = -1
    let bubble = ''
    let sick = false
    let floor = false
    const giveUpAt = trace.gaveUpUs || (trace.startUs === 0 ? client.arrivalUs + patienceUs : 0)

    if (client.arrivalUs > tUs) {
      if (client.arrivalUs > tUs + fxUs) return // ainda longe da agência
      at = door
      opacity = 0
    } else if (giveUpAt > 0 && giveUpAt <= tUs && (trace.startUs === 0 || trace.startUs > tUs)) {
      // desistiu: sai furioso pela porta
      const p = (tUs - giveUpAt) / (fxUs * 1.4 || 1)
      if (p > 1) return
      at = door
      opacity = p < 0.6 ? 1 : 0
      face = 'furious'
      level = 'furious'
      bubble = 'desistiu'
      sick = eventAt(client, KIND_ELDERLY, patienceUs, giveUpAt) > 0
      floor = eventAt(client, KIND_INFANT, patienceUs, giveUpAt) > 0
    } else if (trace.startUs === 0 || trace.startUs > tUs) {
      const position = queuePosition.get(i) ?? 0
      sick = queueItem.get(i)?.sick ?? false
      floor = queueItem.get(i)?.floor ?? false
      at = slotAt(position)
      const waitUs = tUs - client.arrivalUs
      ratio = waitUs / patienceUs
      ;({ face, level } = mood(ratio))
      if (level === 'angry') angry++
      if (level === 'furious') furious++
      if (ratio > worst.ratio) worst = { ratio, client: i, waitUs }
      ;(client.priority === 1 ? waits.pref : waits.common).push(waitUs)
    } else if (trace.endUs === 0 || trace.endUs > tUs) {
      at = { x: tellerAt(trace.teller).x, y: serveY }
      const teller = view.tellers[trace.teller]
      face = teller?.state === 'deadlock' ? 'dizzy' : teller?.state === 'waiting' ? 'tense' : 'happy'
      level = teller?.state === 'deadlock' ? 'furious' : 'calm'
      sick = eventAt(client, KIND_ELDERLY, patienceUs, trace.startUs) > 0
      floor = eventAt(client, KIND_INFANT, patienceUs, trace.startUs) > 0
    } else {
      if (tUs - trace.endUs > fxUs * 1.4) return // já foi embora
      at = { x: tellerAt(trace.teller).x, y: serveY + 46 }
      opacity = 0
      face = trace.result === RESULT_REFUSED ? 'sad' : 'happy'
      bubble = trace.result === RESULT_REFUSED ? 'recusado' : ''
    }
    if (sick && !bubble) bubble = 'passou mal'

    people.push(
      <div
        key={client.id}
        className={`person person-${level} op-${op.key} ${client.priority === 1 ? 'person-pref' : ''} ${sick ? 'person-sick' : ''} ${floor ? 'person-floor' : ''}`}
        style={{ transform: `translate(${at.x}px, ${at.y}px)`, opacity, zIndex: ratio >= 1 ? 3 : 2 }}
        title={`Cliente #${client.id} · ${op.label} · ${formatMoney(client.amount)}`}
      >
        <span className="person-face">
          <Person mood={face} color={palette.ops[client.op]} preferential={client.priority === 1} kind={client.kind} sick={sick} floor={floor} size={54} />
        </span>
        <span className="person-tag">#{client.id}</span>
        {ratio >= 0 && (
          <span className="patience" aria-label="Paciência">
            <span className="patience-fill" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
          </span>
        )}
        {bubble && <span className="person-bubble">{bubble}</span>}
      </div>,
    )
  })
  const avg = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0)
  const worstMood = mood(worst.ratio)

  // ---- dinheiro circulando ----
  const money: ReactNode[] = []
  timeline.clients.forEach((trace, i) => {
    const client = clients[i]
    if (!client || trace.endUs === 0 || trace.result !== RESULT_OK || client.op === OP_LOAN) return
    const elapsed = tUs - trace.endUs
    if (elapsed < 0 || elapsed >= fxUs) return
    const p = elapsed / fxUs
    const vault = vaultAt(client.from)
    const desk = { x: tellerAt(trace.teller).x, y: tellerY - 30 }
    let at: Point
    let label: ReactNode
    if (client.op === OP_TRANSFER) {
      at = lerp({ x: vault.x, y: vaultY - 6 }, { x: vaultAt(client.to).x, y: vaultY - 6 }, p, 34)
      label = <><Icon name="banknote" size={15} /> {formatMoney(client.amount)}</>
    } else if (client.op === OP_DEPOSIT) {
      at = lerp(desk, vault, p)
      label = <><Icon name="banknote" size={15} /> +{formatMoney(client.amount)}</>
    } else if (client.op === OP_WITHDRAW) {
      at = lerp(vault, desk, p)
      label = <><Icon name="banknote" size={15} /> −{formatMoney(client.amount)}</>
    } else if (client.op === OP_BILL) {
      at = lerp(vault, { x: vault.x + 40, y: -24 }, p)
      label = <><Icon name="bill" size={15} /> −{formatMoney(client.amount)}</>
    } else {
      return
    }
    money.push(
      <div key={client.id} className={`stage-money op-${OPS[client.op].key}`} style={{ transform: `translate(${at.x}px, ${at.y}px)`, opacity: p > 0.85 ? (1 - p) / 0.15 : 1 }}>
        {label}
      </div>,
    )
  })

  // cofres que acabaram de ser escritos piscam
  const hit = new Set<number>()
  for (const [at, account] of timeline.writes) {
    if (at > tUs) break
    if (tUs - at < fxUs * 0.5) hit.add(account)
  }

  return (
    <div className="stage">
      <header className="stage-hud">
        <div className="stage-title">{header}</div>
        <div className={`hud-box starvation starvation-${worstMood.level}`}>
          <span className="hud-label">Starvation · paciência de {formatMs(patienceUs / 1000)}</span>
          <div className="starvation-row">
            <span className="starvation-face">
              <Face mood={view.queue.length ? worstMood.face : 'sleep'} size={40} />
            </span>
            <div className="starvation-meter">
              <span className="patience patience-big">
                <span className="patience-fill" style={{ width: `${Math.min(100, worst.ratio * 100)}%` }} />
              </span>
              <span className="small">
                {worst.client >= 0
                  ? `maior espera: ${formatMs(worst.waitUs / 1000)} (#${clients[worst.client].id})`
                  : 'ninguém esperando'}
              </span>
              <span className="small mood-counts">
                <Face mood="angry" size={16} /> {angry} irritados <Face mood="furious" size={16} /> {furious} furiosos
              </span>
              <span className="small muted">
                espera média agora: preferenciais {formatMs(avg(waits.pref) / 1000)}, comuns {formatMs(avg(waits.common) / 1000)}
              </span>
            </div>
          </div>
        </div>
        <div className={`hud-box satisfaction-hud satisfaction-${live.satisfaction === null ? 'none' : satisfactionTone(live.satisfaction)}`}>
          <span className="hud-label">Satisfação dos clientes</span>
          <div className="starvation-row">
            <span className="satisfaction-hud-score">
              <strong>{live.satisfaction === null ? '-' : formatNumber(live.satisfaction, 0)}</strong>
              <small>de 100</small>
            </span>
            <div className="starvation-meter">
              <span className="small">
                <Face mood={moodFace(live.moodAvg)} size={16} /> humor médio {moodText(live.moodAvg)}
              </span>
              <span className="small">
                <Icon name="door" size={13} /> {live.gaveUp} desistiram
              </span>
              <span className="small">
                <Icon name="alert" size={13} /> {live.elderlySick} passaram mal · <Icon name="baby" size={13} /> {live.infantFloor} no chão
              </span>
            </div>
          </div>
        </div>
        <div className={`hud-box ${view.realTotal !== view.expectedTotal ? 'hud-bad' : 'hud-good'}`}>
          <span className="hud-label">Invariante do dinheiro</span>
          <span className="small">
            esperado <strong>{formatMoney(view.expectedTotal)}</strong>
          </span>
          <span className="small">
            real <strong>{formatMoney(view.realTotal)}</strong>
          </span>
          <strong className="hud-diff">
            <Icon name={view.realTotal === view.expectedTotal ? 'check' : 'x'} size={15} />{' '}
            {view.realTotal === view.expectedTotal ? 'confere' : formatMoney(view.realTotal - view.expectedTotal)}
          </strong>
        </div>
      </header>

      <div className="stage-floor" ref={floorRef}>
        <Saguao w={w} h={h} accounts={config.accounts} tellers={config.tellers} />
        {/* cadeados: linha contínua = o caixa tem o lock; tracejada = está esperando */}
        <svg className="stage-lines" width={w} height={h} aria-hidden>
          {view.tellers.flatMap((teller, t) => {
            const from = { x: tellerAt(t).x, y: tellerY - 50 }
            const dead = cycleTellers.has(t) || teller.state === 'deadlock'
            return [
              ...teller.holding.map((lock) => {
                const to = lockAt(lock)
                return <line key={`h${t}-${lock}`} x1={from.x - 8} y1={from.y} x2={to.x - 8} y2={to.y} className={dead ? 'line-hold line-dead' : 'line-hold'} />
              }),
              teller.waitingFor >= 0 ? (
                <line key={`w${t}`} x1={from.x + 8} y1={from.y} x2={lockAt(teller.waitingFor).x + 8} y2={lockAt(teller.waitingFor).y} className={dead ? 'line-wait line-dead' : 'line-wait'} />
              ) : null,
            ]
          })}
        </svg>

        {view.accounts.map((account, a) => {
          const wrong = account.balance !== account.expected
          const at = vaultAt(a)
          return (
            <div
              key={a}
              className={`stage-vault ${account.owner >= 0 ? 'stage-vault-locked' : ''} ${account.inCycle ? 'stage-vault-dead' : ''} ${hit.has(a) ? 'stage-vault-hit' : ''}`}
              style={{ transform: `translate(${at.x}px, ${at.y}px)`, width: vaultW }}
            >
              <div className="stage-vault-head">
                <span className="stage-vault-name">
                  <Icon name="vault" size={16} /> Conta {accountName(a)}
                </span>
                <span className="stage-vault-name">
                  {account.owner >= 0 ? (
                    <><Icon name="lock" size={13} /> C{account.owner + 1}</>
                  ) : lockMode === 'ordered' || lockMode === 'unordered' ? (
                    <Icon name="unlock" size={13} />
                  ) : null}
                </span>
              </div>
              <strong className={wrong ? 'bad' : ''}>{formatMoney(account.balance)}</strong>
              <span className={`small ${wrong ? 'bad' : 'muted'}`}>
                {wrong ? (
                  <><Icon name="x" size={12} /> deveria ser {formatMoney(account.expected)}</>
                ) : account.waiters.length ? (
                  <><Icon name="hourglass" size={12} /> {account.waiters.map((t) => `C${t + 1}`).join(', ')}</>
                ) : (
                  <><Icon name="check" size={12} /> confere</>
                )}
              </span>
            </div>
          )
        })}

        {lockMode === 'global' && (
          <div className={`stage-global ${view.globalLock.owner >= 0 ? 'stage-vault-locked' : ''}`} style={{ transform: `translate(${globalAt.x}px, ${globalAt.y}px)` }}>
            <Icon name={view.globalLock.owner >= 0 ? 'lock' : 'unlock'} size={14} />
            {view.globalLock.owner >= 0 ? `Lock global: Caixa ${view.globalLock.owner + 1}` : 'Lock global livre'}
            {view.globalLock.waiters.length > 0 && <> · <Icon name="hourglass" size={13} /> {view.globalLock.waiters.length}</>}
          </div>
        )}

        {view.tellers.map((teller, t) => {
          const at = tellerAt(t)
          return (
            <div key={t} className={`stage-teller teller-${teller.state}`} style={{ transform: `translate(${at.x}px, ${at.y}px)`, width: tellerW }}>
              <div className="stage-teller-head">
                <span className="stage-teller-face">
                  <Teller state={teller.state} size={38} />
                </span>
                <div>
                  <strong>Caixa {t + 1}</strong>
                  <span className="small">{STATE_LABEL[teller.state]}</span>
                </div>
              </div>
              <div className="progress">
                <div className="progress-bar" style={{ width: `${Math.round(teller.progress * 100)}%` }} />
              </div>
              <span className="small muted stage-teller-served">{teller.served} atendidos</span>
              <span className="small muted stage-teller-op">
                {clients[teller.client]
                  ? `${OPS[clients[teller.client].op].label} · ${accountName(clients[teller.client].from)}${clients[teller.client].to >= 0 ? ` → ${accountName(clients[teller.client].to)}` : ''}`
                  : ' '}
              </span>
            </div>
          )
        })}

        <div className="stage-label" style={{ transform: `translate(14px, ${queueTop - 64}px)` }}>
          Fila · {view.queue.length} esperando · {view.notArrived} a caminho · {view.done} atendidos
          {view.gaveUp > 0 && ` · ${view.gaveUp} desistiram`}
        </div>

        {people}
        {money}

        {deadlock && view.deadlockVisible && (
          <div className="stage-deadlock" role="alert">
            <strong><Icon name="skull" size={20} /> DEADLOCK em {formatMs(deadlock.atUs / 1000)}</strong>
            <span>{deadlock.reason === 'cycle' ? cycleText(deadlock, config.accounts) : 'Nenhum progresso com caixas esperando lock.'}</span>
          </div>
        )}
        {summary && <div className="stage-summary">{summary}</div>}
      </div>

      <footer className="stage-footer">{footer}</footer>
    </div>
  )
}
