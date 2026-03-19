export type SeededRandom = {
  next: () => number
  nextInt: (min: number, max: number) => number
}

export function normalizeSeed(seed: number): number {
  if (!Number.isFinite(seed)) return 0
  return Math.floor(seed)
}

export function createSeededRandom(seed: number): SeededRandom {
  let state = normalizeSeed(seed) >>> 0

  const next = (): number => {
    state += 0x6d2b79f5
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const nextInt = (min: number, max: number): number => {
    const lower = Math.ceil(min)
    const upper = Math.floor(max)
    if (upper < lower) {
      throw new Error('max 必须大于等于 min')
    }
    return Math.floor(next() * (upper - lower + 1)) + lower
  }

  return { next, nextInt }
}
