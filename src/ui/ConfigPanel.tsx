import { useMemo, useState } from 'react'
import { LIMITS, PRESETS, scenarioId } from '../sim/queue'
import {
  OPS, accountName, formatMoney,
  type Client, type OpMix, type SavedScenario, type ScenarioConfig,
} from '../sim/types'
import { formatMs } from './theme'

interface Props {
  config: ScenarioConfig
  clients: Client[]
  scenarioName: string
  scenarios: SavedScenario[]
  disabled: boolean
  onChange(config: ScenarioConfig): void
  onSaveScenario(name: string): void
  onDeleteScenario(name: string): void
}

interface FieldProps {
  label: string
  value: number
  min: number
  max: number
  step?: number
  suffix?: string
  disabled: boolean
  onChange(value: number): void
}

function Field({ label, value, min, max, step = 1, suffix, disabled, onChange }: FieldProps) {
  return (
    <label className="field">
      <span>{label}</span>
      <span className="field-input">
        <input
          type="number"
          value={Number.isFinite(value) ? value : ''}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value === '' ? min : Number(event.target.value))}
        />
        {suffix && <em>{suffix}</em>}
      </span>
    </label>
  )
}

/** Configuração do cenário, presets, cenários salvos e a fila gerada. */
export function ConfigPanel(props: Props) {
  const { config, clients, scenarioName, scenarios, disabled, onChange } = props
  const [name, setName] = useState('')
  const set = (patch: Partial<ScenarioConfig>) => onChange({ ...config, ...patch })
  const setMix = (key: keyof OpMix, value: number) => onChange({ ...config, mix: { ...config.mix, [key]: value } })
  const mixTotal = OPS.reduce((sum, op) => sum + config.mix[op.key], 0)
  const id = useMemo(() => scenarioId(config), [config])
  const counts = useMemo(() => OPS.map((_, op) => clients.filter((c) => c.op === op).length), [clients])
  const preferential = clients.filter((c) => c.priority === 1).length

  return (
    <aside className="config">
      <section className="panel">
        <header className="panel-header">
          <h2>Cenário</h2>
          <span className="muted small" title="Hash da configuração">
            {scenarioName} · <code>{id}</code>
          </span>
        </header>

        <div className="preset-row">
          {PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              className={scenarioId(preset.config) === id ? 'btn btn-small btn-active' : 'btn btn-small'}
              title={preset.description}
              disabled={disabled}
              onClick={() => onChange(preset.config)}
            >
              {preset.name}
            </button>
          ))}
        </div>

        <div className="field-grid">
          <Field label="Caixas" value={config.tellers} {...LIMITS.tellers} disabled={disabled} onChange={(v) => set({ tellers: v })} />
          <Field label="Contas" value={config.accounts} {...LIMITS.accounts} disabled={disabled} onChange={(v) => set({ accounts: v })} />
          <Field label="Clientes" value={config.clients} {...LIMITS.clients} disabled={disabled} onChange={(v) => set({ clients: v })} />
          <Field
            label="Saldo inicial"
            value={config.initialBalance / 100}
            min={0}
            max={LIMITS.initialBalance.max / 100}
            step={100}
            suffix="R$"
            disabled={disabled}
            onChange={(v) => set({ initialBalance: Math.round(v * 100) })}
          />
          <Field label="Preferenciais" value={config.preferentialPct} min={0} max={100} suffix="%" disabled={disabled} onChange={(v) => set({ preferentialPct: v })} />
          <Field label="Intervalo de chegada" value={config.arrivalIntervalMs} {...LIMITS.arrivalIntervalMs} suffix="ms" disabled={disabled} onChange={(v) => set({ arrivalIntervalMs: v })} />
          <Field label="Janela crítica" value={config.criticalWindowMs} {...LIMITS.criticalWindowMs} suffix="ms" disabled={disabled} onChange={(v) => set({ criticalWindowMs: v })} />
          <Field label="Escala das durações" value={config.durationScalePct} {...LIMITS.durationScalePct} step={10} suffix="%" disabled={disabled} onChange={(v) => set({ durationScalePct: v })} />
          <Field label="Passo do aging" value={config.agingMs} {...LIMITS.agingMs} step={10} suffix="ms" disabled={disabled} onChange={(v) => set({ agingMs: v })} />
          <Field label="Semente (seed)" value={config.seed} min={0} max={4294967295} disabled={disabled} onChange={(v) => set({ seed: v })} />
        </div>

        <h3>Tipos de operação (%)</h3>
        <div className="mix-grid">
          {OPS.map((op) => (
            <label key={op.key} className={`mix op-${op.key}`}>
              <span>
                <span aria-hidden>{op.icon}</span> {op.label}
              </span>
              <input
                type="number"
                min={0}
                max={100}
                value={config.mix[op.key]}
                disabled={disabled}
                onChange={(event) => setMix(op.key, Number(event.target.value) || 0)}
              />
            </label>
          ))}
        </div>
        {mixTotal !== 100 && (
          <p className="muted small">
            {mixTotal === 0
              ? 'Soma zero: todas as operações serão transferências.'
              : `A soma é ${mixTotal}%; os pesos são normalizados para 100%.`}
          </p>
        )}

        <h3>Cenários salvos</h3>
        <form
          className="save-row"
          onSubmit={(event) => {
            event.preventDefault()
            if (name.trim()) props.onSaveScenario(name.trim())
            setName('')
          }}
        >
          <input type="text" placeholder="Nome do cenário" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="btn btn-small" disabled={!name.trim()}>
            Salvar
          </button>
        </form>
        {scenarios.length === 0 ? (
          <p className="muted small">Nenhum cenário salvo ainda.</p>
        ) : (
          <ul className="scenario-list">
            {scenarios.map((scenario) => (
              <li key={scenario.name}>
                <button
                  type="button"
                  className={scenario.id === id ? 'link link-active' : 'link'}
                  disabled={disabled}
                  onClick={() => onChange(scenario.config)}
                  title="Carregar este cenário"
                >
                  {scenario.name}
                </button>
                <span className="muted small">
                  seed {scenario.config.seed} · <code>{scenario.id}</code>
                </span>
                <button type="button" className="icon-btn" aria-label={`Excluir cenário ${scenario.name}`} onClick={() => props.onDeleteScenario(scenario.name)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <details>
          <summary>
            <h2>Fila gerada</h2>
            <span className="muted small">
              {clients.length} clientes · {preferential} preferenciais
            </span>
          </summary>
          <p className="muted small">
            {OPS.map((op, i) => `${counts[i]} ${op.label.toLowerCase()}`).join(' · ')}. A mesma seed gera sempre esta mesma fila.
          </p>
          <div className="table-scroll queue-table">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Chegada</th>
                  <th>Prior.</th>
                  <th>Operação</th>
                  <th>Contas</th>
                  <th>Valor</th>
                  <th>Duração</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <td>{client.id}</td>
                    <td>{formatMs(client.arrivalUs / 1000)}</td>
                    <td>{client.priority === 1 ? '★ Pref.' : 'Comum'}</td>
                    <td>
                      <span className={`dot op-${OPS[client.op].key}`} /> {OPS[client.op].label}
                    </td>
                    <td>
                      {accountName(client.from)}
                      {client.to >= 0 ? ` → ${accountName(client.to)}` : ''}
                    </td>
                    <td className="num">{formatMoney(client.amount)}</td>
                    <td className="num">{formatMs(client.durationUs / 1000)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </aside>
  )
}
