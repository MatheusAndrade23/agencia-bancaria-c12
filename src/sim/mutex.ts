// Mutex sobre uma célula de Int32Array compartilhado, no estilo futex:
//   0 = livre, 1 = travado, 2 = travado e há (ou pode haver) alguém dormindo à espera.
// Atomics.wait bloqueia a thread, então lock() só pode ser chamado dentro de workers.

const UNLOCKED = 0
const LOCKED = 1
const CONTENDED = 2

/** Tenta travar sem bloquear. Retorna true se conseguiu. */
export function tryLock(mem: Int32Array, index: number): boolean {
  return Atomics.compareExchange(mem, index, UNLOCKED, LOCKED) === UNLOCKED
}

/** Trava, dormindo (Atomics.wait) enquanto outra thread detiver o lock. */
export function lock(mem: Int32Array, index: number): void {
  let seen = Atomics.compareExchange(mem, index, UNLOCKED, LOCKED)
  if (seen === UNLOCKED) return
  do {
    // marca que há alguém esperando; se o lock ainda estiver ocupado, dorme
    if (seen === CONTENDED || Atomics.compareExchange(mem, index, LOCKED, CONTENDED) !== UNLOCKED) {
      Atomics.wait(mem, index, CONTENDED)
    }
    seen = Atomics.compareExchange(mem, index, UNLOCKED, CONTENDED)
  } while (seen !== UNLOCKED)
}

/** Destrava e, se havia alguém esperando, acorda uma thread. */
export function unlock(mem: Int32Array, index: number): void {
  if (Atomics.sub(mem, index, 1) !== LOCKED) {
    Atomics.store(mem, index, UNLOCKED)
    Atomics.notify(mem, index, 1)
  }
}
