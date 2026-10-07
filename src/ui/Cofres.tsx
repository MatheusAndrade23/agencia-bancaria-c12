import { useLayoutEffect, useRef, useState } from 'react'
import type { AgencyView } from '../sim/timeline'
import { accountName, formatMoney, type LockMode, type ScenarioConfig } from '../sim/types'

interface Props {
  config: ScenarioConfig
  lockMode: LockMode
  view: AgencyView
}

interface Point {
  x: number
  y: number
}

function tellerList(tellers: number[]): string {
  return tellers.map((t) => `Caixa ${t + 1}`).join(', ')
}

/** Painel da invariante: o dinheiro que deveria existir vs. o que está nas contas. */
export function Invariante({ view }: { view: AgencyView }) {
  const diff = view.realTotal - view.expectedTotal
  return (
    <div className={`invariant ${diff !== 0 ? 'invariant-bad' : ''}`}>
      <div>
        <span className="muted small">Saldo total esperado</span>
        <strong>{formatMoney(view.expectedTotal)}</strong>
      </div>
      <div>
        <span className="muted small">Saldo total real</span>
        <strong>{formatMoney(view.realTotal)}</strong>
      </div>
      <div>
        <span className="muted small">Dinheiro inconsistente</span>
        <strong>
          {diff === 0 ? '✓ ' : '✗ '}
          {diff > 0 ? '+' : ''}
          {formatMoney(diff)}
        </strong>
      </div>
    </div>
  )
}

/** As contas (cofres): saldo ao vivo, quem tem o cadeado e quem está esperando. */
export function Cofres({ config, lockMode, view }: Props) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [centers, setCenters] = useState<Point[]>([])

  // posição de cada cofre, para animar o dinheiro indo de um para o outro
  useLayoutEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const measure = () => {
      const origin = grid.getBoundingClientRect()
      setCenters(
        Array.from(grid.querySelectorAll<HTMLElement>('[data-account]')).map((el) => {
          const rect = el.getBoundingClientRect()
          return { x: rect.left - origin.left + rect.width / 2, y: rect.top - origin.top + rect.height / 2 }
        }),
      )
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(grid)
    return () => observer.disconnect()
  }, [config.accounts])

  return (
    <section className="panel">
      <header className="panel-header">
        <h2>Cofres</h2>
        {lockMode === 'global' && (
          <span className={`lock-tag ${view.globalLock.owner >= 0 ? 'lock-tag-held' : ''}`}>
            {view.globalLock.owner >= 0 ? `🔒 Lock global: Caixa ${view.globalLock.owner + 1}` : '🔓 Lock global livre'}
            {view.globalLock.waiters.length > 0 && ` · ⏳ ${tellerList(view.globalLock.waiters)}`}
          </span>
        )}
        {lockMode === 'none' && <span className="muted">sem cadeados: qualquer caixa mexe em qualquer conta</span>}
      </header>
      <Invariante view={view} />
      <div className="vaults" ref={gridRef}>
        {view.accounts.map((account, a) => {
          const wrong = account.balance !== account.expected
          return (
            <div
              key={a}
              data-account={a}
              className={`vault ${account.owner >= 0 ? 'vault-locked' : ''} ${account.inCycle ? 'vault-deadlock' : ''}`}
            >
              <div className="vault-head">
                <strong>Conta {accountName(a)}</strong>
                <span className="vault-lock">
                  {account.owner >= 0 ? `🔒 Caixa ${account.owner + 1}` : lockMode === 'none' || lockMode === 'global' ? '' : '🔓 livre'}
                </span>
              </div>
              <div className={`vault-balance ${wrong ? 'bad' : ''}`}>{formatMoney(account.balance)}</div>
              <div className={`small ${wrong ? 'bad' : 'muted'}`}>
                {wrong ? `✗ deveria ser ${formatMoney(account.expected)}` : '✓ confere'}
              </div>
              <div className="vault-waiters small">
                {account.waiters.length > 0 ? `⏳ ${tellerList(account.waiters)}` : ' '}
              </div>
            </div>
          )
        })}
        {view.transfers.map((fx) => {
          const from = centers[fx.from]
          const to = centers[fx.to]
          if (!from || !to) return null
          const p = fx.progress
          const eased = p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2
          const x = from.x + (to.x - from.x) * eased
          const y = from.y + (to.y - from.y) * eased - Math.sin(p * Math.PI) * 26
          return (
            <div key={fx.client} className="money" style={{ left: x, top: y, opacity: p > 0.85 ? (1 - p) / 0.15 : 1 }}>
              💸 {formatMoney(fx.amount)}
            </div>
          )
        })}
      </div>
    </section>
  )
}
