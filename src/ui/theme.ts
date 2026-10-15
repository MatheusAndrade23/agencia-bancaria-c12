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
  surface: '#ffffff',
  text: '#222222',
  textSecondary: '#4a4a4a',
  textMuted: '#767676',
  grid: '#e6e6e6',
  ops: ['#1baf7a', '#eb6834', '#2a78d6', '#eda100', '#e87ba4'],
  series: ['#ec0000', '#2a78d6', '#1baf7a', '#eda100'],
  sequential: ['#fde3e3', '#f9b8b8', '#f48a8a', '#ee5555', '#ec0000', '#b50000', '#7a0000'],
  good: '#2e8540',
  warning: '#e8a400',
  critical: '#c00000',
}

/** Texto legível sobre um passo da rampa sequencial. */
export function sequentialInk(step: number): string {
  return step >= 4 ? '#ffffff' : '#222222'
}

/** Cor estável por cliente (ângulo áureo espalha os matizes). */
export function clientColor(id: number): string {
  return `hsl(${(id * 137.508) % 360} 60% 62%)`
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '-'
  if (Math.abs(ms) >= 1000) return `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} s`
  return `${ms.toLocaleString('pt-BR', { maximumFractionDigits: ms < 10 ? 1 : 0 })} ms`
}

export function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits })
}
