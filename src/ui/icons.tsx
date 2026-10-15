// Ícones e personagens desenhados em SVG (nada de emoji: renderiza igual em qualquer sistema).
// Os ícones de linha usam currentColor, então herdam a cor do texto ao redor.

import type { CSSProperties, ReactNode } from 'react'

export type IconName =
  | 'deposit' | 'withdraw' | 'transfer' | 'bill' | 'loan'
  | 'lock' | 'unlock' | 'hourglass' | 'skull' | 'star' | 'check' | 'x' | 'alert'
  | 'play' | 'stop' | 'pause' | 'forward' | 'replay' | 'skip' | 'fullscreen' | 'edit' | 'trash'
  | 'arrow-right' | 'clock' | 'users' | 'vault' | 'banknote' | 'chevron-up' | 'chevron-down' | 'gauge'

const PATHS: Record<IconName, ReactNode> = {
  // operações
  deposit: (
    <>
      <path d="M12 3v11" />
      <path d="m7.5 9.5 4.5 4.5 4.5-4.5" />
      <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
    </>
  ),
  withdraw: (
    <>
      <path d="M12 14V3" />
      <path d="m7.5 7.5 4.5-4.5 4.5 4.5" />
      <path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
    </>
  ),
  transfer: (
    <>
      <path d="M4 8h15" />
      <path d="m15.5 4.5 3.5 3.5-3.5 3.5" />
      <path d="M20 16H5" />
      <path d="m8.5 12.5-3.5 3.5 3.5 3.5" />
    </>
  ),
  bill: (
    <>
      <path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  loan: (
    <>
      <path d="m3 11 9-7 9 7" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  // estado
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.5-2" />
    </>
  ),
  hourglass: (
    <>
      <path d="M6 3h12M6 21h12" />
      <path d="M7 3c0 5 10 5 10 9s-10 4-10 9" />
      <path d="M17 3c0 5-10 5-10 9s10 4 10 9" />
    </>
  ),
  skull: (
    <>
      <path d="M12 3a8 8 0 0 0-5 14.2V20a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-2.8A8 8 0 0 0 12 3z" />
      <circle cx="9" cy="11.5" r="1.6" fill="currentColor" />
      <circle cx="15" cy="11.5" r="1.6" fill="currentColor" />
      <path d="M10 21v-2.5M14 21v-2.5" />
    </>
  ),
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" fill="currentColor" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  alert: (
    <>
      <path d="M12 3.5 22 20H2z" />
      <path d="M12 10v4.5" />
      <circle cx="12" cy="17.3" r="0.6" fill="currentColor" />
    </>
  ),
  // controles
  play: <path d="M7 4.5v15l12-7.5z" fill="currentColor" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" />,
  pause: (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
      <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
    </>
  ),
  forward: (
    <>
      <path d="M3.5 5.5v13L12 12z" fill="currentColor" />
      <path d="M12 5.5v13l8.5-6.5z" fill="currentColor" />
    </>
  ),
  replay: (
    <>
      <path d="M4 12a8 8 0 1 0 2.4-5.7" />
      <path d="M4 4v4.5h4.5" />
    </>
  ),
  skip: (
    <>
      <path d="M5 5v14l10-7z" fill="currentColor" />
      <path d="M19 5v14" />
    </>
  ),
  fullscreen: <path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" />,
  edit: (
    <>
      <path d="M4 20h4L19 9l-4-4L4 16z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4h6v3" />
      <path d="M6 7l1 13h10l1-13" />
    </>
  ),
  'arrow-right': (
    <>
      <path d="M4 12h15" />
      <path d="m13 6 6 6-6 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14a6.5 6.5 0 0 1 3 6" />
    </>
  ),
  vault: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 8v1.5M12 14.5V16M8 12h1.5M14.5 12H16" />
      <path d="M6 20v1.5M18 20v1.5" />
    </>
  ),
  banknote: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.8" />
      <path d="M6 9.5v5M18 9.5v5" />
    </>
  ),
  'chevron-up': <path d="m6 15 6-6 6 6" />,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  gauge: (
    <>
      <path d="M4 17a8 8 0 1 1 16 0" />
      <path d="m12 17 4-5" />
    </>
  ),
}

export const OP_ICON: Record<'deposit' | 'withdraw' | 'transfer' | 'bill' | 'loan', IconName> = {
  deposit: 'deposit',
  withdraw: 'withdraw',
  transfer: 'transfer',
  bill: 'bill',
  loan: 'loan',
}

interface IconProps {
  name: IconName
  size?: number
  className?: string
  style?: CSSProperties
  title?: string
}

export function Icon({ name, size = 16, className, style, title }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`icon ${className ?? ''}`}
      style={style}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {title && <title>{title}</title>}
      {PATHS[name]}
    </svg>
  )
}

/** Marca do Itander: uma chama estilizada. */
export function LogoMark({ size = 32, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <path
        fill={color}
        d="M16.8 2.5c.9 3.6-.6 5.9-2.4 8.2-1.6 2.1-3.3 4.2-2.6 7.3-2.3-1.2-3.4-3.4-3.2-6-3.1 2.6-4.6 5.6-4.6 9C4 27 9.4 30 16 30s12-3 12-9c0-4.8-3-8.3-6.4-11.1.4 2.6-.3 4.7-2 6.1.6-5.4-.7-9.8-2.8-13.5z"
      />
      <path
        fill="#ffffff"
        opacity="0.9"
        d="M16.4 16.2c.4 2-.5 3.2-1.4 4.3-.8 1-1.4 2-1 3.6-1.3-.6-2-1.8-1.9-3.2-1.6 1.4-2.3 2.9-2.3 4.4 0 2.6 2.8 3.9 6.2 3.9s6.2-1.3 6.2-3.9c0-2.3-1.6-4.1-3.3-5.5.1 1.2-.2 2.2-1 2.9.2-2.6-.4-4.7-1.5-6.5z"
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Rostos: o humor de quem espera, do sorriso à fúria
// ---------------------------------------------------------------------------

export type Mood = 'happy' | 'calm' | 'neutral' | 'bored' | 'angry' | 'furious' | 'tense' | 'dizzy' | 'sad' | 'sleep'

const MOOD_FILL: Record<Mood, string> = {
  happy: '#ffd166',
  calm: '#ffd166',
  neutral: '#ffd166',
  bored: '#ffbf47',
  angry: '#ff8a3d',
  furious: '#ec0000',
  tense: '#ffd166',
  dizzy: '#d6d6d6',
  sad: '#c9d8e8',
  sleep: '#e6e6e6',
}

/** Desenha só o rosto, centrado em (0,0), com raio 10. */
function FaceShape({ mood }: { mood: Mood }) {
  const ink = '#3b2a1a'
  const eye = (x: number) => <circle cx={x} cy={-2} r={1.3} fill={ink} />
  let eyes: ReactNode = (
    <>
      {eye(-3.6)}
      {eye(3.6)}
    </>
  )
  let mouth: ReactNode = <path d="M-4 3.5q4 3.5 8 0" />
  let brows: ReactNode = null
  let extra: ReactNode = null
  switch (mood) {
    case 'happy':
      mouth = <path d="M-5 2.5q5 6 10 0z" fill={ink} />
      break
    case 'neutral':
      mouth = <path d="M-3.5 4.5h7" />
      break
    case 'bored':
      mouth = <path d="M-3.5 5h7" />
      eyes = <path d="M-5.2-2h3.2M2-2h3.2" />
      break
    case 'angry':
      mouth = <path d="M-4 6q4-3.5 8 0" />
      brows = <path d="M-6-6.2l4.2 2.2M6-6.2l-4.2 2.2" />
      break
    case 'furious':
      mouth = <path d="M-4.5 6.5q4.5-4.5 9 0z" fill={ink} />
      brows = <path d="M-6.5-5.5l4.8 2.8M6.5-5.5l-4.8 2.8" strokeWidth={1.8} />
      extra = <path d="M-9-11l1.5 2.5M0-13v3M9-11l-1.5 2.5" stroke="#ec0000" />
      break
    case 'tense':
      mouth = <path d="M-4.5 4.5h9M-3 3v3M0 3v3M3 3v3" />
      break
    case 'dizzy':
      eyes = <path d="M-5-3.5l2.6 2.6M-2.4-3.5-5-0.9M2.4-3.5 5-0.9M5-3.5 2.4-0.9" />
      mouth = <circle cx={0} cy={5} r={1.6} />
      break
    case 'sad':
      mouth = <path d="M-4 6q4-3.5 8 0" />
      break
    case 'sleep':
      eyes = <path d="M-5-2q1.5 1.5 3 0M2-2q1.5 1.5 3 0" />
      mouth = <path d="M-2 5h4" />
      extra = <text x={7} y={-7} fontSize={6} fontWeight={700} fill="#767676" stroke="none">z</text>
      break
  }
  return (
    <g stroke={ink} strokeWidth={1.5} strokeLinecap="round" fill="none">
      <circle r={10} fill={MOOD_FILL[mood]} stroke="#3b2a1a" strokeOpacity={0.35} strokeWidth={1} />
      {brows}
      {eyes}
      {mouth}
      {extra}
    </g>
  )
}

export function Face({ mood, size = 28, className }: { mood: Mood; size?: number; className?: string }) {
  return (
    <svg viewBox="-14 -15 28 28" width={size} height={size} className={className} aria-hidden>
      <FaceShape mood={mood} />
    </svg>
  )
}

/** Cliente: rosto com o humor do momento e o corpo na cor da operação. */
export function Person({ mood, color, preferential, size = 44 }: { mood: Mood; color: string; preferential?: boolean; size?: number }) {
  return (
    <svg viewBox="-16 -15 32 44" width={(size * 32) / 44} height={size} aria-hidden className="person-svg">
      <path d="M-11 28v-6a11 11 0 0 1 22 0v6z" fill={color} stroke="#ffffff" strokeWidth={1.2} />
      <g transform="translate(0 0)">
        <FaceShape mood={mood} />
      </g>
      {preferential && (
        <g transform="translate(9 -10)">
          <circle r={5.5} fill="#ffffff" stroke="#c98500" strokeWidth={1} />
          <path d="m0-3.4 1 2.1 2.3.3-1.7 1.6.4 2.3L0 1.8-2 2.9l.4-2.3L-3.3-1l2.3-.3z" fill="#e8a400" />
        </g>
      )}
    </svg>
  )
}

/** Atendente atrás do balcão, com o uniforme vermelho do banco. */
export function Teller({ state, size = 40 }: { state: 'idle' | 'serving' | 'waiting' | 'deadlock' | 'finished'; size?: number }) {
  const mood: Mood = state === 'deadlock' ? 'dizzy' : state === 'waiting' ? 'tense' : state === 'idle' || state === 'finished' ? 'sleep' : 'happy'
  return (
    <svg viewBox="-16 -15 32 36" width={(size * 32) / 36} height={size} aria-hidden>
      <path d="M-11 21v-4a11 11 0 0 1 22 0v4z" fill="#ec0000" />
      <path d="M-2.5 7.5 0 12l2.5-4.5" fill="#ffffff" />
      <g transform="scale(0.85)">
        <FaceShape mood={mood} />
      </g>
    </svg>
  )
}

/** Ícone da operação dentro de um círculo na cor da operação. */
export function OpIcon({ op, size = 22 }: { op: 'deposit' | 'withdraw' | 'transfer' | 'bill' | 'loan'; size?: number }) {
  return (
    <span className={`op-icon op-${op}`} style={{ width: size, height: size }} aria-hidden>
      <Icon name={OP_ICON[op]} size={Math.round(size * 0.6)} />
    </span>
  )
}

/** Estrela de cliente preferencial. */
export function PrefStar({ size = 13 }: { size?: number }) {
  return <Icon name="star" size={size} className="star" title="Preferencial" />
}
