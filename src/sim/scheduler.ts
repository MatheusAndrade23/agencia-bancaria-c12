import type { Algorithm } from './types'

/** Um cliente que já chegou e ainda não foi atendido. */
export interface ReadyClient {
  index: number
  arrivalUs: number
  /** 1 = preferencial, 0 = comum */
  priority: number
  durationUs: number
}

export interface SchedulerParams {
  nowUs: number
  /** a cada `agingUs` de espera o cliente ganha 1 nível de prioridade */
  agingUs: number
}

/** Prioridade efetiva no aging: cresce linearmente com o tempo de espera. */
export function effectivePriority(client: ReadyClient, params: SchedulerParams): number {
  const waitedUs = Math.max(0, params.nowUs - client.arrivalUs)
  return client.priority + waitedUs / Math.max(1, params.agingUs)
}

/** Desempate comum a todos os algoritmos: quem chegou antes; depois, menor índice. */
function byArrival(a: ReadyClient, b: ReadyClient): number {
  return a.arrivalUs - b.arrivalUs || a.index - b.index
}

/**
 * Compara dois clientes prontos. Retorna negativo se `a` deve ser atendido antes de `b`.
 * Todos os algoritmos são não-preemptivos: só decidem quem é o próximo.
 */
export function compareClients(
  algorithm: Algorithm,
  a: ReadyClient,
  b: ReadyClient,
  params: SchedulerParams,
): number {
  switch (algorithm) {
    case 'fcfs':
      return byArrival(a, b)
    case 'sjf':
      return a.durationUs - b.durationUs || byArrival(a, b)
    case 'priority':
      return b.priority - a.priority || byArrival(a, b)
    case 'aging':
      return effectivePriority(b, params) - effectivePriority(a, params) || byArrival(a, b)
  }
}

/** Escolhe o próximo cliente entre os prontos. Retorna null se a lista estiver vazia. */
export function pickNext(
  algorithm: Algorithm,
  ready: readonly ReadyClient[],
  params: SchedulerParams,
): ReadyClient | null {
  let best: ReadyClient | null = null
  for (const candidate of ready) {
    if (best === null || compareClients(algorithm, candidate, best, params) < 0) best = candidate
  }
  return best
}
