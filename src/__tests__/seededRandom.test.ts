import { describe, it, expect } from '@jest/globals'
import { createSeededRandom } from '@PdfParser'

describe('createSeededRandom', () => {
  it('相同 seed 生成一致序列', () => {
    const first = createSeededRandom(42)
    const second = createSeededRandom(42)

    const sequenceA = [first.next(), first.next(), first.next()]
    const sequenceB = [second.next(), second.next(), second.next()]

    expect(sequenceA).toEqual(sequenceB)
  })

  it('不同 seed 产生不同序列', () => {
    const first = createSeededRandom(1)
    const second = createSeededRandom(2)

    expect(first.next()).not.toBe(second.next())
  })

  it('nextInt 在区间内返回整数', () => {
    const random = createSeededRandom(10)
    const value = random.nextInt(3, 7)

    expect(Number.isInteger(value)).toBe(true)
    expect(value).toBeGreaterThanOrEqual(3)
    expect(value).toBeLessThanOrEqual(7)
  })

  it('nextInt 支持边界相等的情况', () => {
    const random = createSeededRandom(5)
    expect(random.nextInt(4, 4)).toBe(4)
  })

  it('nextInt 处理非法区间', () => {
    const random = createSeededRandom(5)
    expect(() => random.nextInt(5, 2)).toThrow('max 必须大于等于 min')
  })
})
