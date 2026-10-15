import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark'

export interface Palette {
  surface: string
  text: string
  textSecondary: string
  textMuted: string
  grid: string
  /** texto sobre os blocos coloridos do Gantt */
  blockInk: string
  /** cor por tipo de operação, na ordem de OPS */
  ops: string[]
  series: string[]
  /** rampa sequencial para o heatmap: do tom mais próximo da superfície ao que mais se destaca */
  sequential: string[]
  /** texto legível sobre cada passo da rampa sequencial */
  sequentialInk: string[]
  good: string
  warning: string
  critical: string
}

const OPS_COLORS = ['#1baf7a', '#eb6834', '#2a78d6', '#eda100', '#e87ba4']

/** Cores usadas fora do CSS (canvas e Chart.js), uma paleta por tema. Espelham os tokens de styles.css. */
export const PALETTES: Record<Theme, Palette> = {
  light: {
    surface: '#ffffff',
    text: '#222222',
    textSecondary: '#4a4a4a',
    textMuted: '#767676',
    grid: '#e6e6e6',
    blockInk: '#0b0b0b',
    ops: OPS_COLORS,
    series: ['#ec0000', '#2a78d6', '#1baf7a', '#eda100'],
    sequential: ['#fde3e3', '#f9b8b8', '#f48a8a', '#ee5555', '#ec0000', '#b50000', '#7a0000'],
    sequentialInk: ['#222222', '#222222', '#222222', '#222222', '#ffffff', '#ffffff', '#ffffff'],
    good: '#2e8540',
    warning: '#e8a400',
    critical: '#c00000',
  },
  dark: {
    surface: '#212428',
    text: '#ececec',
    textSecondary: '#c4c7cb',
    textMuted: '#9a9fa5',
    grid: '#363a40',
    blockInk: '#0b0b0b',
    ops: OPS_COLORS,
    series: ['#ff3b3b', '#4a90e2', '#2fbf8a', '#f2b632'],
    sequential: ['#3a2426', '#58282a', '#7a2b2b', '#a12d2a', '#c93029', '#ec3b33', '#ff6a61'],
    sequentialInk: ['#ececec', '#ececec', '#ffffff', '#ffffff', '#ffffff', '#1a0000', '#1a0000'],
    good: '#4cbb68',
    warning: '#f2b632',
    critical: '#ff5c5c',
  },
}

/** Paleta do tema atual; o App fornece o valor. */
export const PaletteContext = createContext<Palette>(PALETTES.light)

export function usePalette(): Palette {
  return useContext(PaletteContext)
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
