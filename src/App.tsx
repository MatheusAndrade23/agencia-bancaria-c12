import { useCallback, useMemo, useState } from 'react'
import { DEFAULT_CONFIG, PRESETS, generateQueue, sanitizeConfig, scenarioId } from './sim/queue'
import type { RunRecord, SavedScenario, ScenarioConfig } from './sim/types'
import * as storage from './storage/storage'
import { Comparacoes } from './ui/Comparacoes'
import { ConfigPanel } from './ui/ConfigPanel'
import { QueuePage } from './ui/QueuePage'
import { SimulationPage } from './ui/SimulationPage'

type Tab = 'scenario' | 'sim' | 'compare'

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
  const [tab, setTab] = useState<Tab>('scenario')
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
      setNotice('Não foi possível salvar a execução: o armazenamento do navegador está cheio. Exclua execuções antigas em Comparações.')
    }
  }, [])

  /** Salva a configuração atual como "Cenário N", com o próximo número livre. */
  function saveScenario() {
    const used = scenarios.map((s) => Number(/^Cenário (\d+)$/.exec(s.name)?.[1] ?? 0))
    const name = `Cenário ${Math.max(0, ...used) + 1}`
    setScenarios(storage.saveScenario({ id: scenarioId(config), name, config, savedAt: new Date().toISOString() }))
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
          <button type="button" className={tab === 'scenario' ? 'tab tab-active' : 'tab'} onClick={() => setTab('scenario')}>
            1. Cenário e fila
          </button>
          <button type="button" className={tab === 'sim' ? 'tab tab-active' : 'tab'} onClick={() => setTab('sim')}>
            2. Simulação
          </button>
          <button type="button" className={tab === 'compare' ? 'tab tab-active' : 'tab'} onClick={() => setTab('compare')}>
            3. Comparações <span className="count">{runs.length}</span>
          </button>
        </nav>
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

      {tab === 'scenario' && (
        <main className="layout">
          <ConfigPanel
            config={rawConfig}
            scenarioName={scenarioName}
            scenarios={scenarios}
            disabled={running}
            onChange={setRawConfig}
            onSaveScenario={saveScenario}
            onDeleteScenario={(name) => setScenarios(storage.deleteScenario(name))}
          />
          <QueuePage config={config} clients={clients} scenarioName={scenarioName} onGoToSimulation={() => setTab('sim')} />
        </main>
      )}
      {/* a simulação continua montada ao trocar de aba, para não perder a execução em andamento */}
      <main hidden={tab !== 'sim'}>
        <SimulationPage
          config={config}
          clients={clients}
          scenarioName={scenarioName}
          isolated={isolated}
          onRunFinished={onRunFinished}
          onRunningChange={setRunning}
          onEditScenario={() => setTab('scenario')}
        />
      </main>
      {tab === 'compare' && (
        <main>
          <Comparacoes
            runs={runs}
           
            onDelete={(id) => setRuns(storage.deleteRun(id))}
            onClearAll={clearAll}
          />
        </main>
      )}
    </div>
  )
}
