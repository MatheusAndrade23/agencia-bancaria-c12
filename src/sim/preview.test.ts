import { describe, expect, it } from 'vitest'
import { previewSchedule } from './preview'
import { DEFAULT_CONFIG, PRESETS, generateQueue } from './queue'
import { ALGORITHMS, type Client } from './types'

const config = { ...DEFAULT_CONFIG, tellers: 1, criticalWindowMs: 0 }
const client = (id: number, arrivalMs: number, priority: 0 | 1, durationMs: number): Client => ({
  id, arrivalUs: arrivalMs * 1000, priority, op: 0, from: 0, to: -1, amount: 100, durationUs: durationMs * 1000,
})

describe('previsão da ordem de atendimento', () => {
  it('atende cada cliente exatamente uma vez, nunca antes de chegar', () => {
    for (const preset of PRESETS) {
      const clients = generateQueue(preset.config)
      for (const algorithm of ALGORITHMS) {
        const slots = previewSchedule(preset.config, clients, algorithm)
        expect(slots.map((s) => s.index).sort((a, b) => a - b)).toEqual(clients.map((_, i) => i))
        for (const slot of slots) expect(slot.startUs).toBeGreaterThanOrEqual(clients[slot.index].arrivalUs)
      }
    }
  })

  it('um caixa nunca atende dois clientes ao mesmo tempo', () => {
    const clients = generateQueue(DEFAULT_CONFIG)
    const slots = previewSchedule(DEFAULT_CONFIG, clients, 'fcfs')
    for (let t = 0; t < DEFAULT_CONFIG.tellers; t++) {
      const mine = slots.filter((s) => s.teller === t)
      for (let i = 1; i < mine.length; i++) expect(mine[i].startUs).toBeGreaterThanOrEqual(mine[i - 1].endUs)
    }
  })

  it('cada algoritmo ordena a mesma fila do seu jeito', () => {
    // todos chegam enquanto o caixa atende o cliente 0
    const clients = [client(0, 0, 0, 100), client(1, 10, 0, 80), client(2, 20, 1, 60), client(3, 30, 0, 20)]
    const order = (algorithm: (typeof ALGORITHMS)[number]) => previewSchedule(config, clients, algorithm).map((s) => s.index)
    expect(order('fcfs')).toEqual([0, 1, 2, 3])
    expect(order('sjf')).toEqual([0, 3, 2, 1])
    expect(order('priority')).toEqual([0, 2, 1, 3])
  })

  it('o caixa fica ocioso até a próxima chegada quando a fila esvazia', () => {
    const slots = previewSchedule(config, [client(0, 0, 0, 10), client(1, 500, 0, 10)], 'fcfs')
    expect(slots[1].startUs).toBe(500_000)
  })
})
