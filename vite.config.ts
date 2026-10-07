import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// SharedArrayBuffer só existe em páginas "cross-origin isolated".
// Esses dois headers ligam o isolamento no servidor de dev e no preview.
const isolationHeaders = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default defineConfig({
  plugins: [react()],
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  worker: { format: 'es' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
