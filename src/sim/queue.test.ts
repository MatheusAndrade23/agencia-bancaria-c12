import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, PRESETS, generateQueue, sanitizeConfig, scenarioId } from './queue'
import { mulberry32 } from './rng'
import { OP_TRANSFER } from './types'

describe('mulberry32', () => {
  it('a mesma seed gera a mesma sequência', () => {
    const a = mulberry32(123)
    const b = mulberry32(123)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })

  it('seeds diferentes geram sequências diferentes', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()])
  })

  it('gera valores em [0, 1)', () => {
    const rand = mulberry32(99)
    for (let i = 0; i < 1000; i++) {
      const value = rand()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })
})

describe('gerador de fila', () => {
  it('a mesma seed gera exatamente a mesma fila', () => {
    expect(generateQueue(DEFAULT_CONFIG)).toEqual(generateQueue({ ...DEFAULT_CONFIG }))
  })

  it('seeds diferentes geram filas diferentes', () => {
    expect(generateQueue(DEFAULT_CONFIG)).not.toEqual(generateQueue({ ...DEFAULT_CONFIG, seed: DEFAULT_CONFIG.seed + 1 }))
  })

  it('gera a quantidade pedida, com chegadas em ordem crescente', () => {
    const queue = generateQueue({ ...DEFAULT_CONFIG, clients: 120 })
    expect(queue).toHaveLength(120)
    expect(queue[0].arrivalUs).toBe(0)
    for (let i = 1; i < queue.length; i++) expect(queue[i].arrivalUs).toBeGreaterThanOrEqual(queue[i - 1].arrivalUs)
  })

  it('contas ficam dentro do intervalo e transferências têm origem ≠ destino', () => {
    for (const preset of PRESETS) {
      for (const client of generateQueue(preset.config)) {
        expect(client.from).toBeGreaterThanOrEqual(0)
        expect(client.from).toBeLessThan(preset.config.accounts)
        expect(client.amount).toBeGreaterThan(0)
        expect(client.durationUs).toBeGreaterThan(0)
        if (client.op === OP_TRANSFER) {
          expect(client.to).toBeGreaterThanOrEqual(0)
          expect(client.to).toBeLessThan(preset.config.accounts)
          expect(client.to).not.toBe(client.from)
        } else {
          expect(client.to).toBe(-1)
        }
      }
    }
  })

  it('respeita o percentual de operações', () => {
    const onlyTransfers = generateQueue({
      ...DEFAULT_CONFIG,
      mix: { deposit: 0, withdraw: 0, transfer: 100, bill: 0, loan: 0 },
    })
    expect(onlyTransfers.every((c) => c.op === OP_TRANSFER)).toBe(true)
  })

  it('respeita o percentual de preferenciais', () => {
    expect(generateQueue({ ...DEFAULT_CONFIG, preferentialPct: 0 }).every((c) => c.priority === 0)).toBe(true)
    expect(generateQueue({ ...DEFAULT_CONFIG, preferentialPct: 100 }).every((c) => c.priority === 1)).toBe(true)
  })

  it('o preset de deadlock tem transferências cruzadas (A→B e B→A)', () => {
    const queue = generateQueue(PRESETS.find((p) => p.key === 'deadlock')!.config)
    expect(queue.some((c) => c.from === 0 && c.to === 1)).toBe(true)
    expect(queue.some((c) => c.from === 1 && c.to === 0)).toBe(true)
  })
})

describe('cenário', () => {
  it('o id é estável e muda quando a config muda', () => {
    expect(scenarioId(DEFAULT_CONFIG)).toBe(scenarioId({ ...DEFAULT_CONFIG }))
    expect(scenarioId(DEFAULT_CONFIG)).not.toBe(scenarioId({ ...DEFAULT_CONFIG, seed: 1 }))
    expect(scenarioId(DEFAULT_CONFIG)).not.toBe(scenarioId({ ...DEFAULT_CONFIG, tellers: 2 }))
  })

  it('sanitizeConfig limita valores fora da faixa', () => {
    const config = sanitizeConfig({ ...DEFAULT_CONFIG, tellers: 99, accounts: 1, clients: -5 })
    expect(config.tellers).toBe(8)
    expect(config.accounts).toBe(2)
    expect(config.clients).toBe(1)
  })
})
