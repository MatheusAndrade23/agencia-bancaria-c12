import { pickNext, type ReadyClient } from './scheduler'
import type { Algorithm, Client, ScenarioConfig } from './types'

export interface PreviewSlot {
  /** índice do cliente na fila */
  index: number
  teller: number
  startUs: number
  endUs: number
}

/**
 * Previsão determinística da ordem de atendimento: simula os caixas em tempo
 * "ideal", sem disputa por lock nem variação do sistema operacional.
 * Serve só para visualizar a fila; a execução real pode divergir um pouco.
 */
export function previewSchedule(config: ScenarioConfig, clients: Client[], algorithm: Algorithm): PreviewSlot[] {
  const freeAt = new Array<number>(Math.max(1, config.tellers)).fill(0)
  const pending = new Set(clients.map((_, i) => i))
  const serviceUs = (client: Client) => client.durationUs + Math.round(config.criticalWindowMs * 1000)
  const slots: PreviewSlot[] = []

  while (pending.size > 0) {
    // o próximo caixa a ficar livre é quem escolhe
    let teller = 0
    for (let t = 1; t < freeAt.length; t++) if (freeAt[t] < freeAt[teller]) teller = t
    let now = freeAt[teller]

    let ready: ReadyClient[] = []
    let nextArrival = Infinity
    for (const i of pending) {
      const client = clients[i]
      if (client.arrivalUs <= now) {
        ready.push({ index: i, arrivalUs: client.arrivalUs, priority: client.priority, durationUs: client.durationUs })
      } else {
        nextArrival = Math.min(nextArrival, client.arrivalUs)
      }
    }
    if (ready.length === 0) {
      // fila vazia: o caixa espera a próxima chegada
      now = nextArrival
      ready = [...pending]
        .filter((i) => clients[i].arrivalUs <= now)
        .map((i) => ({ index: i, arrivalUs: clients[i].arrivalUs, priority: clients[i].priority, durationUs: clients[i].durationUs }))
    }

    const next = pickNext(algorithm, ready, { nowUs: now, agingUs: Math.round(config.agingMs * 1000) })!
    pending.delete(next.index)
    freeAt[teller] = now + serviceUs(clients[next.index])
    slots.push({ index: next.index, teller, startUs: now, endUs: freeAt[teller] })
  }
  return slots
}
