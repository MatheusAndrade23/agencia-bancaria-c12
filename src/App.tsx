import { useCallback, useMemo, useState } from 'react'
import { DEFAULT_CONFIG, PRESETS, generateQueue, sanitizeConfig, scenarioId } from './sim/queue'
import type { RunRecord, SavedScenario, ScenarioConfig } from './sim/types'
import * as storage from './storage/storage'
import { Comparacoes } from './ui/Comparacoes'
import { ConfigPanel } from './ui/ConfigPanel'
import { SimulationPage } from './ui/SimulationPage'
import { useTheme } from './ui/theme'

type Tab = 'sim' | 'compare'

/** Nome do cenário: o salvo pelo usuário, o do preset ou "Personalizado". */
function resolveScenarioName(config: ScenarioConfig, scenarios: SavedScenario[]): string {
  const id = scenarioId(config)
  return (
    scenarios.find((s) => s.id === id)?.name ??
    PRESETS.find((p) => scenarioId(p.config) === id)?.name ??
    'Personalizado'
  )
}

export function App() {
  const [theme, toggleTheme] = useTheme()
  const [tab, setTab] = useState<Tab>('sim')
  const [rawConfig, setRawConfig] = useState<ScenarioConfig>(DEFAULT_CONFIG)
  const [runs, setRuns] = useState<RunRecord[]>(storage.loadRuns)
  const [scenarios, setScenarios] = useState<SavedScenario[]>(storage.loadScenarios)
  const [running, setRunning] = useState(false)
  const [notice, setNotice] = useState('')

  const config = useMemo(() => sanitizeConfig(rawConfig), [rawConfig])
  const clients = useMemo(() => generateQueue(config), [config])
  const scenarioName = useMemo(() => resolveScenarioName(config, scenarios), [config, scenarios])
  const isolated = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined'

  const onRunFinished = useCallback((record: RunRecord) => {
    try {
      setRuns(storage.saveRun(record))
    } catch {
      setNotice('Não foi possível salvar a execução: o armazenamento do navegador está cheio. Exporte e limpe as execuções antigas.')
    }
  }, [])

  /** Salva a configuração atual como "Cenário N", com o próximo número livre. */
  function saveScenario() {
    const used = scenarios.map((s) => Number(/^Cenário (\d+)$/.exec(s.name)?.[1] ?? 0))
    const name = `Cenário ${Math.max(0, ...used) + 1}`
    setScenarios(storage.saveScenario({ id: scenarioId(config), name, config, savedAt: new Date().toISOString() }))
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(storage.exportAll(), null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `agencia-bancaria-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function importJson(file: File) {
    try {
      const added = storage.importAll(await file.text())
      setRuns(storage.loadRuns())
      setScenarios(storage.loadScenarios())
      setNotice(`Importado: ${added.runs} execuções e ${added.scenarios} cenários novos.`)
    } catch (e) {
      setNotice(`Falha ao importar: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  function clearAll() {
    if (!window.confirm('Apagar TODAS as execuções e cenários salvos neste navegador? Isso não pode ser desfeito.')) return
    storage.clearAll()
    setRuns([])
    setScenarios([])
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span aria-hidden>🏦</span>
          <div>
            <h1>Agência Bancária</h1>
            <span className="muted small">Escalonamento e sincronismo de threads — Sistemas Operacionais</span>
          </div>
        </div>
        <nav className="tabs" aria-label="Telas">
          <button type="button" className={tab === 'sim' ? 'tab tab-active' : 'tab'} onClick={() => setTab('sim')}>
            Simulação
          </button>
          <button type="button" className={tab === 'compare' ? 'tab tab-active' : 'tab'} onClick={() => setTab('compare')}>
            Comparações <span className="count">{runs.length}</span>
          </button>
        </nav>
        <button type="button" className="btn btn-small" onClick={toggleTheme} aria-label="Alternar tema claro/escuro">
          {theme === 'dark' ? '☀ Claro' : '🌙 Escuro'}
        </button>
      </header>

      {!isolated && (
        <div className="banner banner-error" role="alert">
          <strong>SharedArrayBuffer indisponível.</strong> A página não está "cross-origin isolated"
          (<code>crossOriginIsolated === false</code>), então os caixas não conseguem compartilhar memória. Abra o app
          por <code>npm run dev</code> ou <code>npm run preview</code> (que enviam os headers{' '}
          <code>Cross-Origin-Opener-Policy: same-origin</code> e <code>Cross-Origin-Embedder-Policy: require-corp</code>)
          em <code>http://localhost</code>.
        </div>
      )}
      {notice && (
        <div className="banner">
          {notice}{' '}
          <button type="button" className="link" onClick={() => setNotice('')}>
            fechar
          </button>
        </div>
      )}

      {/* a simulação continua montada ao trocar de aba, para não perder a execução em andamento */}
      <main className="layout" hidden={tab !== 'sim'}>
        <ConfigPanel
          config={rawConfig}
          clients={clients}
          scenarioName={scenarioName}
          scenarios={scenarios}
          disabled={running}
          onChange={setRawConfig}
          onSaveScenario={saveScenario}
          onDeleteScenario={(name) => setScenarios(storage.deleteScenario(name))}
        />
        <SimulationPage
          config={config}
          scenarioName={scenarioName}
          theme={theme}
          isolated={isolated}
          onRunFinished={onRunFinished}
          onRunningChange={setRunning}
        />
      </main>
      {tab === 'compare' && (
        <main>
          <Comparacoes
            runs={runs}
            theme={theme}
            onDelete={(id) => setRuns(storage.deleteRun(id))}
            onExport={exportJson}
            onImport={importJson}
            onClearAll={clearAll}
          />
        </main>
      )}
    </div>
  )
}
