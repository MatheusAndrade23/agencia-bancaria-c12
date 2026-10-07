export interface Palette {
  surface: string
  text: string
  textSecondary: string
  textMuted: string
  grid: string
  /** cor por tipo de operação, na ordem de OPS */
  ops: string[]
  series: string[]
  /** rampa sequencial para o heatmap: do tom mais próximo da superfície ao que mais se destaca */
  sequential: string[]
  good: string
  warning: string
  critical: string
}

export const PALETTE: Palette = {
  surface: '#1a1a19',
  text: '#ffffff',
  textSecondary: '#c3c2b7',
  textMuted: '#8f8e86',
  grid: '#33332f',
  ops: ['#199e70', '#d95926', '#3987e5', '#c98500', '#d55181'],
  series: ['#3987e5', '#d95926', '#199e70', '#c98500'],
  sequential: ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'],
  good: '#0ca30c',
  warning: '#fab219',
  critical: '#d03b3b',
}

/** Texto legível sobre um passo da rampa sequencial. */
export function sequentialInk(step: number): string {
  return step <= 2 ? '#ffffff' : '#0b0b0b'
}

/** Cor estável por cliente (ângulo áureo espalha os matizes). */
export function clientColor(id: number): string {
  return `hsl(${(id * 137.508) % 360} 52% 52%)`
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  if (Math.abs(ms) >= 1000) return `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} s`
  return `${ms.toLocaleString('pt-BR', { maximumFractionDigits: ms < 10 ? 1 : 0 })} ms`
}

export function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits })
}
