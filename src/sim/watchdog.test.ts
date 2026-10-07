import { describe, expect, it } from 'vitest'
import { Watchdog, findWaitCycle } from './watchdog'

describe('grafo de espera', () => {
  it('sem ninguém esperando não há ciclo', () => {
    expect(findWaitCycle({ waitingFor: [-1, -1], owners: [0, 1] })).toBeNull()
  })

  it('espera em cadeia (sem volta) não é deadlock', () => {
    // caixa 0 espera a conta 1 (do caixa 1); caixa 1 espera a conta 2 (do caixa 2), que está trabalhando
    expect(findWaitCycle({ waitingFor: [1, 2, -1], owners: [0, 1, 2] })).toBeNull()
  })

  it('detecta o ciclo clássico de dois caixas', () => {
    // caixa 0 tem A e espera B; caixa 1 tem B e espera A
    expect(findWaitCycle({ waitingFor: [1, 0], owners: [0, 1] })).toEqual([
      { teller: 0, lock: 1 },
      { teller: 1, lock: 0 },
    ])
  })

  it('detecta um ciclo de três caixas e ignora quem só está na fila do lock', () => {
    const cycle = findWaitCycle({ waitingFor: [0, 1, 2, 0], owners: [1, 2, 3] })
    // caixa 0 só espera a conta 0; o ciclo é 1 → 2 → 3 → 1
    expect(cycle?.map((step) => step.teller)).toEqual([1, 2, 3])
  })

  it('lock esperado sem dono não forma ciclo', () => {
    expect(findWaitCycle({ waitingFor: [1, 0], owners: [0, -1] })).toBeNull()
  })
})

describe('watchdog', () => {
  const sample = (waitingFor: number[], owners: number[], progress: number, nowMs: number) => ({
    waitingFor,
    owners,
    progress,
    nowMs,
    nowUs: nowMs * 1000,
  })

  it('só confirma o ciclo na segunda amostra igual', () => {
    const watchdog = new Watchdog({ stallMs: 1000 })
    expect(watchdog.check(sample([1, 0], [0, 1], 5, 0))).toBeNull()
    const info = watchdog.check(sample([1, 0], [0, 1], 5, 40))
    expect(info?.reason).toBe('cycle')
    expect(info?.blockedTellers).toEqual([0, 1])
  })

  it('um ciclo que some na amostra seguinte é descartado', () => {
    const watchdog = new Watchdog({ stallMs: 1000 })
    expect(watchdog.check(sample([1, 0], [0, 1], 5, 0))).toBeNull()
    expect(watchdog.check(sample([-1, 0], [0, 1], 6, 40))).toBeNull()
    expect(watchdog.check(sample([1, 0], [0, 1], 7, 80))).toBeNull()
  })

  it('declara deadlock por falta de progresso com caixas esperando', () => {
    const watchdog = new Watchdog({ stallMs: 1000 })
    expect(watchdog.check(sample([0, -1], [-1, -1], 3, 0))).toBeNull()
    expect(watchdog.check(sample([0, -1], [-1, -1], 3, 500))).toBeNull()
    expect(watchdog.check(sample([0, -1], [-1, -1], 3, 1100))?.reason).toBe('timeout')
  })

  it('não declara deadlock enquanto há progresso', () => {
    const watchdog = new Watchdog({ stallMs: 1000 })
    for (let i = 0; i < 10; i++) expect(watchdog.check(sample([0, -1], [1, -1], i, i * 500))).toBeNull()
  })
})
