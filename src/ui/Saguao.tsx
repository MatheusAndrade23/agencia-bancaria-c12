import { memo, type ReactNode } from 'react'
import { accountName } from '../sim/types'
import { LogoMark } from './icons'

interface Point {
  x: number
  y: number
}

/** Metade da altura dos cartões do palco (cofre e caixa), medida no navegador. */
const VAULT_HALF = 40
const TELLER_HALF = 58

/**
 * Posições do palco a partir do tamanho do piso. O Palco usa para colocar cofres, caixas
 * e fila, e o saguão usa as mesmas contas para que o cenário acompanhe os elementos.
 */
export function stageLayout(w: number, h: number, accounts: number, tellers: number) {
  const vaultY = Math.max(58, h * 0.12)
  const tellerY = h * 0.41
  const serveY = tellerY + 100
  const queueTop = serveY + 118
  const rowHeight = 84
  return {
    vaultY,
    tellerY,
    serveY,
    queueTop,
    rowHeight,
    rows: Math.max(1, Math.floor((h - queueTop - 6) / rowHeight)),
    lineWidth: w - 150,
    queueLeft: 60,
    vaultW: Math.min(170, w / accounts - 12),
    tellerW: Math.min(190, w / tellers - 14),
    vaultAt: (a: number): Point => ({ x: (w * (a + 0.5)) / accounts, y: vaultY }),
    tellerAt: (t: number): Point => ({ x: (w * (t + 0.5)) / tellers, y: tellerY }),
    door: { x: w - 36, y: h - 60 } as Point,
  }
}

interface Props {
  w: number
  h: number
  accounts: number
  tellers: number
}

/** Placa com texto centrado em (x, y). */
function Plate({ x, y, width, height, text, size }: { x: number; y: number; width: number; height: number; text: string; size: number }) {
  return (
    <g>
      <rect className="lobby-plate" x={x - width / 2} y={y - height / 2} width={width} height={height} rx={3} />
      <text className="lobby-plate-text" x={x} y={y} fontSize={size} textAnchor="middle" dominantBaseline="central">
        {text}
      </text>
    </g>
  )
}

/** Logo de chama com o nome do banco, centrado em (x, y). */
const brandWidth = (size: number) => size + 6 + size * 0.78 * 3.3

function Brand({ x, y, size }: { x: number; y: number; size: number }) {
  const text = size * 0.78
  const width = brandWidth(size)
  return (
    <g className="lobby-brand" transform={`translate(${x - width / 2} ${y - size / 2})`}>
      <LogoMark size={size} color="var(--brand)" />
      <text x={size + 6} y={size / 2} fontSize={text} fontWeight={800} dominantBaseline="central" letterSpacing="-0.02em">
        Itander
      </text>
    </g>
  )
}

/**
 * Saguão da agência desenhado atrás do palco: parede com a marca e a sala dos cofres no
 * alto, balcão dos caixas no meio, piso com a fila em cobrinha e a porta de entrada.
 * Só depende do tamanho e da quantidade de caixas e contas, então não redesenha a cada quadro.
 */
export const Saguao = memo(function Saguao({ w, h, accounts, tellers }: Props) {
  const L = stageLayout(w, h, accounts, tellers)
  const vaultTop = L.vaultY - VAULT_HALF
  const vaultBottom = L.vaultY + VAULT_HALF
  const tellerTop = L.tellerY - TELLER_HALF
  const wallBottom = vaultBottom + Math.max(16, (tellerTop - vaultBottom) * 0.6)
  const counterTop = L.tellerY + 44
  const counterFront = L.tellerY + 54
  const counterBottom = L.tellerY + 84
  const vaultSlot = w / accounts

  // ---- sala dos cofres: um nicho por conta, grade entre eles ----
  const pad = Math.max(4, Math.min(18, (vaultSlot - L.vaultW) / 2 - 3))
  const roomTop = Math.max(0, vaultTop - 22)
  const vaults: ReactNode[] = []
  const grille: string[] = []
  for (let a = 0; a < accounts; a++) {
    const { x } = L.vaultAt(a)
    const left = x - L.vaultW / 2 - pad
    const right = x + L.vaultW / 2 + pad
    const top = Math.max(roomTop + 3, vaultTop - 8)
    const bottom = vaultBottom + 8
    const rivets: ReactNode[] = []
    for (let y = top + 8; y < bottom - 4; y += 12) {
      rivets.push(<circle key={`l${y}`} cx={left + 4} cy={y} r={1.6} />, <circle key={`r${y}`} cx={right - 4} cy={y} r={1.6} />)
    }
    vaults.push(
      <g key={a}>
        <rect className="lobby-alcove" x={left} y={top} width={right - left} height={bottom - top} rx={4} />
        <g className="lobby-rivet">{rivets}</g>
        <Plate x={x} y={Math.max(9, vaultTop - 11)} width={Math.min(L.vaultW - 20, 64)} height={14} text={`Conta ${accountName(a)}`} size={9} />
      </g>,
    )
    // grade no vão até o próximo nicho
    const gapEnd = a + 1 < accounts ? L.vaultAt(a + 1).x - L.vaultW / 2 - pad : w - 6
    const gapStart = a === 0 ? 6 : -1
    if (gapStart > 0) for (let gx = gapStart + 5; gx < left - 3; gx += 9) grille.push(`M${gx} ${roomTop + 4}V${vaultBottom + 10}`)
    for (let gx = right + 6; gx < gapEnd - 3; gx += 9) grille.push(`M${gx} ${roomTop + 4}V${vaultBottom + 10}`)
  }

  // marca na parede: no vão entre os cofres do meio quando cabe, senão na faixa abaixo deles
  const freeGap = vaultSlot - L.vaultW - 2 * pad
  const bigBrand = Math.min(44, vaultBottom - roomTop - 30)
  const brand =
    freeGap >= brandWidth(bigBrand) + 24 ? (
      <Brand x={vaultSlot * Math.floor(accounts / 2)} y={L.vaultY} size={bigBrand} />
    ) : (
      <Brand x={w / 2} y={(vaultBottom + 10 + wallBottom) / 2} size={Math.max(12, Math.min(30, wallBottom - vaultBottom - 16))} />
    )

  // ---- balcão: um guichê por caixa, com divisórias de vidro e placa numerada ----
  const desks: ReactNode[] = []
  const deskPlates: ReactNode[] = []
  for (let t = 0; t < tellers; t++) {
    const { x } = L.tellerAt(t)
    desks.push(<rect key={t} className="lobby-desk" x={x - L.tellerW / 2 - 10} y={tellerTop + 14} width={L.tellerW + 20} height={counterTop - tellerTop - 14} rx={4} />)
    deskPlates.push(
      <Plate key={t} x={x + L.tellerW / 2 - 26} y={(counterFront + counterBottom) / 2 + 1} width={46} height={16} text={`Caixa ${t + 1}`} size={9.5} />,
    )
  }
  const partitions: ReactNode[] = []
  for (let t = 1; t < tellers; t++) {
    const x = (w * t) / tellers
    partitions.push(<rect key={t} className="lobby-glass" x={x - 2} y={tellerTop + 4} width={4} height={counterTop - tellerTop - 4} rx={2} />)
  }

  // ---- fila: postes com fita formando o corredor em cobrinha ----
  const beltLeft = 34
  const beltRight = L.queueLeft + L.lineWidth + 22
  const gap = 52
  const belts: ReactNode[] = []
  for (let r = 0; r <= L.rows; r++) {
    const y = L.queueTop - L.rowHeight / 2 + 4 + r * L.rowHeight
    let from = beltLeft
    let to = beltRight
    if (r === 0) from += gap // saída do primeiro da fila, rumo aos caixas
    else if (r === L.rows) {
      // entrada no fim da fila, do lado em que a última fileira termina
      if ((r - 1) % 2 === 0) to -= gap
      else from += gap
    } else if ((r - 1) % 2 === 0) to -= gap // fileira par termina à direita: passagem à direita
    else from += gap
    const count = Math.max(1, Math.round((to - from) / 120))
    const posts: ReactNode[] = []
    for (let i = 0; i <= count; i++) {
      const px = from + ((to - from) * i) / count
      posts.push(
        <g key={i}>
          <circle className="lobby-post-base" cx={px} cy={y + 1} r={6} />
          <circle className="lobby-post" cx={px} cy={y} r={3.5} />
        </g>,
      )
    }
    belts.push(
      <g key={r}>
        <line className="lobby-belt" x1={from} y1={y} x2={to} y2={y} />
        {posts}
      </g>,
    )
  }

  const { door } = L
  const signTop = L.queueTop - 80

  return (
    <svg className="stage-lobby" width={w} height={h} aria-hidden>
      <defs>
        <pattern id="lobby-tiles" width={56} height={56} patternUnits="userSpaceOnUse">
          <rect className="lobby-tile-a" width={56} height={56} />
          <rect className="lobby-tile-b" width={28} height={28} />
          <rect className="lobby-tile-b" x={28} y={28} width={28} height={28} />
        </pattern>
        <pattern id="lobby-boards" width={120} height={14} patternUnits="userSpaceOnUse">
          <rect className="lobby-staff" width={120} height={14} />
          <path className="lobby-seam" d="M0 13.5H120M60 0V14" />
        </pattern>
      </defs>

      {/* piso do público e área dos funcionários */}
      <rect width={w} height={h} fill="url(#lobby-tiles)" />
      <rect y={wallBottom} width={w} height={counterTop - wallBottom} fill="url(#lobby-boards)" />

      {/* parede do fundo */}
      <rect className="lobby-wall" width={w} height={wallBottom} />
      <rect className="lobby-room" x={4} y={roomTop} width={w - 8} height={vaultBottom + 14 - roomTop} rx={4} />
      <path className="lobby-grille" d={grille.join('')} />
      {vaults}
      <rect className="lobby-baseboard" y={wallBottom - 5} width={w} height={5} />
      <rect className="lobby-stripe" y={wallBottom - 8} width={w} height={3} />
      {brand}

      {/* balcão */}
      {desks}
      {partitions}
      <rect className="lobby-counter-top" x={0} y={counterTop} width={w} height={counterFront - counterTop} />
      <rect className="lobby-counter" x={0} y={counterFront} width={w} height={counterBottom - counterFront} />
      <rect className="lobby-stripe" y={counterFront} width={w} height={3} />
      <rect className="lobby-shadow" y={counterBottom} width={w} height={6} />
      {deskPlates}

      {/* fila */}
      {belts}
      <g>
        <line className="lobby-pole" x1={18} y1={L.queueTop - 6} x2={18} y2={L.queueTop + 26} />
        <circle className="lobby-post-base" cx={18} cy={L.queueTop + 27} r={6} />
        <Plate x={18} y={L.queueTop - 14} width={30} height={16} text="Fila" size={10} />
      </g>
      <g transform={`translate(${w - 44} ${signTop})`}>
        <rect className="lobby-sign" x={-38} y={0} width={76} height={34} rx={4} />
        <path className="lobby-sign-star" d="m-26 6.5 1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" />
        <text className="lobby-sign-text" x={-17} y={11} fontSize={8.5}>
          Atendimento
        </text>
        <text className="lobby-sign-text" x={0} y={25} fontSize={8.5} textAnchor="middle">
          preferencial
        </text>
      </g>

      {/* entrada */}
      <g transform={`translate(${door.x} ${door.y})`}>
        <rect className="lobby-door-frame" x={-28} y={-38} width={56} height={74} rx={3} />
        <rect className="lobby-door-glass" x={-23} y={-33} width={22} height={66} />
        <rect className="lobby-door-glass" x={1} y={-33} width={22} height={66} />
        <path className="lobby-door-handle" d="M-5-6v12M5-6v12" />
        <rect className="lobby-mat" x={-34} y={38} width={68} height={Math.min(18, h - door.y - 40)} rx={3} />
        <text className="lobby-mat-text" x={0} y={38 + Math.min(18, h - door.y - 40) / 2} fontSize={9} textAnchor="middle" dominantBaseline="central">
          Entrada
        </text>
      </g>
    </svg>
  )
})
