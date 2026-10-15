import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import type { Theme } from './theme'

const THEME_KEY = 'agencia-bancaria.theme.v1'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Preferência salva pelo usuário, ou null se ele nunca escolheu. */
function readSaved(): Theme | null {
  try {
    const value = localStorage.getItem(THEME_KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return typeof window.matchMedia === 'function' && window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
}

/** Tema inicial: a escolha salva ou, sem ela, o tema do sistema. */
export function initialTheme(): Theme {
  return readSaved() ?? systemTheme()
}

/** Tema atual e a troca entre claro e escuro. Sem escolha salva, acompanha o sistema. */
export function useTheme() {
  const [saved, setSaved] = useState<Theme | null>(readSaved)
  const [system, setSystem] = useState<Theme>(systemTheme)
  const theme = saved ?? system

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia(DARK_QUERY)
    const onChange = () => setSystem(query.matches ? 'dark' : 'light')
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  useLayoutEffect(() => applyTheme(theme), [theme])

  const toggle = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // sem armazenamento a troca vale só para esta sessão
    }
    setSaved(next)
  }, [theme])

  return { theme, toggle }
}
