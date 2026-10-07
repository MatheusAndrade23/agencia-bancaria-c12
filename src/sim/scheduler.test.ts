import { describe, expect, it } from 'vitest'
import { compareClients, effectivePriority, pickNext, type ReadyClient } from './scheduler'

const ms = (value: number) => value * 1000
const client = (index: number, arrivalMs: number, priority: number, durationMs: number): ReadyClient => ({
  index,
  arrivalUs: ms(arrivalMs),
  priority,
  durationUs: ms(durationMs),
})
const params = { nowUs: ms(1000), agingUs: ms(200) }

describe('escalonadores', () => {
  const ready = [
    client(0, 10, 0, 300), // comum, longo, chegou primeiro
    client(1, 20, 0, 50), // comum, curto
    client(2, 30, 1, 120), // preferencial
    client(3, 40, 1, 80), // preferencial, chegou depois
  ]

  it('fila vazia não escolhe ninguém', () => {
    expect(pickNext('fcfs', [], params)).toBeNull()
  })

  it('FCFS atende na ordem de chegada', () => {
    expect(pickNext('fcfs', ready, params)?.index).toBe(0)
    expect(pickNext('fcfs', [ready[3], ready[1], ready[2]], params)?.index).toBe(1)
  })

  it('SJF atende a menor duração estimada primeiro', () => {
    expect(pickNext('sjf', ready, params)?.index).toBe(1)
  })

  it('SJF desempata pela ordem de chegada', () => {
    const tied = [client(5, 90, 0, 60), client(4, 50, 0, 60)]
    expect(pickNext('sjf', tied, params)?.index).toBe(4)
  })

  it('Prioridade atende preferenciais primeiro, com empate por chegada', () => {
    expect(pickNext('priority', ready, params)?.index).toBe(2)
    expect(pickNext('priority', [ready[0], ready[1]], params)?.index).toBe(0)
  })

  it('Prioridade pura nunca passa um comum na frente de um preferencial (starvation)', () => {
    const oldCommon = client(0, 0, 0, 50)
    const freshPreferential = client(1, 999, 1, 50)
    expect(pickNext('priority', [oldCommon, freshPreferential], params)?.index).toBe(1)
  })

  it('Aging: a prioridade efetiva cresce com o tempo de espera', () => {
    const waiting = client(0, 0, 0, 50)
    expect(effectivePriority(waiting, { nowUs: ms(0), agingUs: ms(200) })).toBe(0)
    expect(effectivePriority(waiting, { nowUs: ms(400), agingUs: ms(200) })).toBe(2)
  })

  it('Aging: um comum que esperou muito passa na frente de um preferencial recém-chegado', () => {
    const oldCommon = client(0, 0, 0, 50)
    const freshPreferential = client(1, 900, 1, 50)
    expect(pickNext('aging', [oldCommon, freshPreferential], params)?.index).toBe(0)
  })

  it('Aging: com esperas parecidas, o preferencial ainda vai primeiro', () => {
    const common = client(0, 900, 0, 50)
    const preferential = client(1, 950, 1, 50)
    expect(pickNext('aging', [common, preferential], params)?.index).toBe(1)
  })

  it('a comparação é antissimétrica', () => {
    for (const algorithm of ['fcfs', 'sjf', 'priority', 'aging'] as const) {
      const ab = compareClients(algorithm, ready[0], ready[2], params)
      const ba = compareClients(algorithm, ready[2], ready[0], params)
      expect(Math.sign(ab)).toBe(-Math.sign(ba))
    }
  })

  it('ordenar com o comparador dá a mesma ordem que escolher um a um', () => {
    for (const algorithm of ['fcfs', 'sjf', 'priority', 'aging'] as const) {
      const sorted = [...ready].sort((a, b) => compareClients(algorithm, a, b, params)).map((c) => c.index)
      const remaining = [...ready]
      const picked: number[] = []
      while (remaining.length) {
        const next = pickNext(algorithm, remaining, params)!
        picked.push(next.index)
        remaining.splice(remaining.indexOf(next), 1)
      }
      expect(picked).toEqual(sorted)
    }
  })
})
