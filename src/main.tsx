import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import '@fontsource-variable/plus-jakarta-sans'
import './styles.css'
import { applyTheme, initialTheme } from './ui/useTheme'

// aplica o tema antes do primeiro desenho para não piscar o tema errado
applyTheme(initialTheme())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
