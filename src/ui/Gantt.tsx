import { useEffect, useRef, useState } from 'react'
import {
  OPS, accountName, formatMoney, lockName,
  type Client, type DeadlockInfo, type ScenarioConfig, type Timeline,
} from '../sim/types'
import { PALETTE, clientColor, formatMs } from './theme'

interface Props {
  config: ScenarioConfig
  clients: Client[]
  timeline: Timeline
  /** desenha só o que aconteceu até este instante */
  tUs: number
  deadlock?: DeadlockInfo
  rowHeight?: number
}

interface Block {
  client: number
  x: number
  y: number
  w: number
  h: number
}

const LABEL_WIDTH = 64
const AXIS_HEIGHT = 22
const PAD_RIGHT = 10

function niceStep(spanMs: number, maxTicks: number): number {
  const raw = spanMs / maxTicks
  const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 1e-9)))
  for (const m of [1, 2, 5, 10]) if (m * pow >= raw) return m * pow
  return 10 * pow
}

function hatch(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string) {
  ctx.save()
  ctx.beginPath()
  ctx.rect(x, y, w, h)
  ctx.clip()
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.beginPath()
  for (let i = -h; i < w; i += 6) {
    ctx.moveTo(x + i, y + h)
    ctx.lineTo(x + i + h, y)
  }
  ctx.stroke()
  ctx.restore()
}

/** Diagrama de Gantt: uma linha por caixa, um bloco por cliente, hachura = esperando lock. */
export function Gantt({ config, clients, timeline, tUs, deadlock, rowHeight = 30 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const blocksRef = useRef<Block[]>([])
  const [width, setWidth] = useState(600)
  const [hover, setHover] = useState<{ client: number; x: number; y: number } | null>(null)
  const height = AXIS_HEIGHT + config.tellers * rowHeight + 4

  useEffect(() => {
    const element = wrapRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setWidth(Math.max(240, element.clientWidth)))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const palette = PALETTE
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const spanUs = Math.max(timeline.endUs, tUs, 50_000)
    const plotWidth = width - LABEL_WIDTH - PAD_RIGHT
    const xOf = (us: number) => LABEL_WIDTH + (us / spanUs) * plotWidth
    const blockedTellers = new Set(deadlock && tUs >= deadlock.atUs ? deadlock.blockedTellers : [])

    // eixo do tempo
    ctx.font = '11px system-ui, sans-serif'
    ctx.textBaseline = 'middle'
    const stepMs = niceStep(spanUs / 1000, Math.max(2, Math.floor(plotWidth / 80)))
    for (let ms = 0; ms * 1000 <= spanUs; ms += stepMs) {
      const x = Math.round(xOf(ms * 1000)) + 0.5
      ctx.strokeStyle = palette.grid
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, AXIS_HEIGHT)
      ctx.lineTo(x, height)
      ctx.stroke()
      ctx.fillStyle = palette.textMuted
      ctx.textAlign = ms === 0 ? 'left' : 'center'
      ctx.fillText(formatMs(ms), x, AXIS_HEIGHT / 2)
    }

    for (let t = 0; t < config.tellers; t++) {
      const y = AXIS_HEIGHT + t * rowHeight
      ctx.fillStyle = blockedTellers.has(t) ? palette.critical : palette.textSecondary
      ctx.textAlign = 'left'
      ctx.font = `${blockedTellers.has(t) ? '600 ' : ''}12px system-ui, sans-serif`
      ctx.fillText(`Caixa ${t + 1}`, 4, y + rowHeight / 2)
    }

    const blocks: Block[] = []
    timeline.clients.forEach((trace, i) => {
      if (trace.startUs === 0 || trace.startUs > tUs || trace.teller < 0) return
      const end = Math.min(trace.endUs || tUs, tUs)
      const x = xOf(trace.startUs)
      const w = Math.max(1.5, xOf(end) - x - 1) // 1px de respiro entre blocos vizinhos
      const y = AXIS_HEIGHT + trace.teller * rowHeight + 3
      const h = rowHeight - 6
      ctx.fillStyle = clientColor(i)
      ctx.beginPath()
      ctx.roundRect(x, y, w, h, 3)
      ctx.fill()

      // trechos esperando lock
      const waits: [number, number][] = [
        [trace.wait1Us, trace.acq1Us],
        [trace.wait2Us, trace.acq2Us],
      ]
      for (const [from, to] of waits) {
        if (from === 0 || from > tUs) continue
        const wx = xOf(from)
        const ww = Math.max(1.5, xOf(Math.min(to || tUs, tUs)) - wx)
        ctx.fillStyle = palette.surface
        ctx.globalAlpha = 0.55
        ctx.fillRect(wx, y, ww, h)
        ctx.globalAlpha = 1
        hatch(ctx, wx, y, ww, h, to === 0 && blockedTellers.has(trace.teller) ? palette.critical : palette.text)
      }

      if (trace.endUs === 0 && blockedTellers.has(trace.teller)) {
        ctx.strokeStyle = palette.critical
        ctx.lineWidth = 2
        ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
      }
      if (w > 26) {
        ctx.fillStyle = '#0b0b0b'
        ctx.font = '600 10.5px system-ui, sans-serif'
        ctx.textAlign = 'left'
        ctx.fillText(`#${clients[i]?.id ?? i}`, x + 4, y + h / 2 + 0.5)
      }
      blocks.push({ client: i, x, y, w, h })
    })
    blocksRef.current = blocks

    // cursor do instante atual
    if (tUs < spanUs) {
      const x = Math.round(xOf(tUs)) + 0.5
      ctx.strokeStyle = palette.text
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x, AXIS_HEIGHT - 4)
      ctx.lineTo(x, height)
      ctx.stroke()
    }
    if (deadlock && tUs >= deadlock.atUs) {
      const x = Math.round(xOf(deadlock.atUs)) + 0.5
      ctx.strokeStyle = palette.critical
      ctx.lineWidth = 2
      ctx.setLineDash([4, 3])
      ctx.beginPath()
      ctx.moveTo(x, AXIS_HEIGHT - 4)
      ctx.lineTo(x, height)
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [config, clients, timeline, tUs, deadlock, width, height, rowHeight])

  function onMove(event: React.MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    const block = blocksRef.current.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y - 3 && y <= b.y + b.h + 3)
    setHover(block ? { client: block.client, x, y } : null)
  }

  const hovered = hover ? clients[hover.client] : undefined
  const trace = hover ? timeline.clients[hover.client] : undefined

  return (
    <div className="gantt" ref={wrapRef}>
      <canvas
        ref={canvasRef}
        style={{ width, height }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Diagrama de Gantt dos caixas"
      />
      {hover && hovered && trace && (
        <div className="tooltip" style={{ left: Math.min(hover.x + 12, width - 220), top: hover.y + 14 }}>
          <strong>
            Cliente #{hovered.id} {hovered.priority === 1 ? '★ preferencial' : ''}
          </strong>
          <div>
            {OPS[hovered.op].label} · {formatMoney(hovered.amount)} · {accountName(hovered.from)}
            {hovered.to >= 0 ? ` → ${accountName(hovered.to)}` : ''}
          </div>
          <div>Esperou na fila: {formatMs((trace.startUs - hovered.arrivalUs) / 1000)}</div>
          <div>
            Atendimento: {formatMs(trace.startUs / 1000)} →{' '}
            {trace.endUs ? formatMs(trace.endUs / 1000) : 'não terminou'}
          </div>
          {trace.wait1Us > 0 && (
            <div>
              Esperou {lockName(trace.lock1, config.accounts)}:{' '}
              {trace.acq1Us ? formatMs((trace.acq1Us - trace.wait1Us) / 1000) : 'para sempre'}
            </div>
          )}
          {trace.wait2Us > 0 && (
            <div>
              Esperou {lockName(trace.lock2, config.accounts)}:{' '}
              {trace.acq2Us ? formatMs((trace.acq2Us - trace.wait2Us) / 1000) : 'para sempre'}
            </div>
          )}
          {trace.result === 2 && <div>Operação recusada (saldo insuficiente)</div>}
        </div>
      )}
      <div className="gantt-legend">
        <span>
          <i className="swatch swatch-block" /> atendimento (uma cor por cliente)
        </span>
        <span>
          <i className="swatch swatch-hatch" /> esperando lock
        </span>
      </div>
    </div>
  )
}
