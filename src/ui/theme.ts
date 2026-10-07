import { useEffect, useState } from 'react'

export type ThemeName = 'light' | 'dark'

export interface Palette {
  surface: string
  text: string
  textSecondary: string
  textMuted: string
  grid: string
  /** cor por tipo de operação, na ordem de OPS */
  ops: string[]
  series: string[]
  /** rampa sequencial (claro → escuro) para o heatmap */
  sequential: string[]
  good: string
  warning: string
  critical: string
}

export const PALETTES: Record<ThemeName, Palette> = {
  light: {
    surface: '#fcfcfb',
    text: '#0b0b0b',
    textSecondary: '#52514e',
    textMuted: '#8a8984',
    grid: '#e6e5e0',
    ops: ['#1baf7a', '#eb6834', '#2a78d6', '#eda100', '#e87ba4'],
    series: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
    sequential: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'],
    good: '#0ca30c',
    warning: '#fab219',
    critical: '#d03b3b',
  },
  dark: {
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
  },
}

const THEME_KEY = 'agencia-bancaria.theme'

function initialTheme(): ThemeName {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme(): [ThemeName, () => void] {
  const [theme, setTheme] = useState<ThemeName>(initialTheme)
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem(THEME_KEY, theme)
  }, [theme])
  return [theme, () => setTheme((current) => (current === 'dark' ? 'light' : 'dark'))]
}

/** Cor estável por cliente (ângulo áureo espalha os matizes). */
export function clientColor(id: number, theme: ThemeName): string {
  const hue = (id * 137.508) % 360
  return theme === 'dark' ? `hsl(${hue} 52% 52%)` : `hsl(${hue} 58% 56%)`
}

export function formatMs(ms: number): string {
  if (!Number.isFinite(ms)) return '—'
  if (Math.abs(ms) >= 1000) return `${(ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} s`
  return `${ms.toLocaleString('pt-BR', { maximumFractionDigits: ms < 10 ? 1 : 0 })} ms`
}

export function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString('pt-BR', { maximumFractionDigits: digits })
}
