import { describe, it, expect, beforeAll } from '@jest/globals'
import { PdfParser } from '@PdfParser'
import { readFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * PDF 解析集成测试 - test_github.pdf
 * 测试文件: 4 页 GitHub 用户主页 PDF，包含 Z.X/wszxdhr 用户信息
 */

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

describe('PdfParser Integration Tests - test_github.pdf', () => {
  let pdfBuffer: ArrayBuffer
  let document: Awaited<ReturnType<typeof PdfParser.encode>>

  beforeAll(async () => {
    const pdfPath = path.resolve(__dirname, 'test_github.pdf')
    const buffer = await readFile(pdfPath)
    pdfBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    )
    document = await PdfParser.encode(pdfBuffer)
  }, 30000)

  describe('PDF 文件加载', () => {
    it('应该成功加载 test_github.pdf 文件', () => {
      expect(pdfBuffer).toBeDefined()
      expect(pdfBuffer.byteLength).toBeGreaterThan(0)
    })
  })

  describe('PDF 解析结果', () => {
    it('应该成功解析 PDF 并返回 IntermediateDocument', () => {
      expect(document).toBeDefined()
      expect(document).not.toBeNull()
    })

    it('应该包含有效的文档 ID', () => {
      expect(document?.id).toBeDefined()
      expect(typeof document?.id).toBe('string')
      expect(document?.id.length).toBeGreaterThan(0)
    })

    it('应该包含文档标题', () => {
      expect(document?.title).toBeDefined()
      expect(typeof document?.title).toBe('string')
    })
  })

  describe('页面结构验证', () => {
    it('应该包含正确的页数 (4 页)', () => {
      expect(document?.pageCount).toBe(4)
    })

    it('每页都应该有有效的 ID', async () => {
      for (let i = 1; i <= 4; i++) {
        const page = await document?.getPageByPageNumber(i)
        expect(page).toBeDefined()
        expect(page?.id).toBeDefined()
        expect(page?.id).toContain(`page-${i}`)
      }
    })

    it('每页都应该有合理的尺寸', () => {
      for (let i = 1; i <= 4; i++) {
        const size = document?.getPageSizeByPageNumber(i)
        expect(size).toBeDefined()
        expect(size?.x).toBeGreaterThan(0)
        expect(size?.y).toBeGreaterThan(0)
      }
    })
  })

  describe('文本内容提取验证', () => {
    it('应该能获取第一页的数据', async () => {
      const page = await document?.getPageByPageNumber(1)
      expect(page).toBeDefined()
      expect(page?.texts).toBeDefined()
    })

    it('第一页应该包含用户名 "Z.X" 或 "wszxdhr"', async () => {
      const page = await document?.getPageByPageNumber(1)
      const allText = page?.texts?.map((t) => t.content).join('') ?? ''

      const hasZX = allText.includes('Z.X')
      const hasWszxdhr = allText.includes('wszxdhr')
      expect(hasZX || hasWszxdhr).toBe(true)
    })

    it('第一页应该包含邮箱 "job@z-x.vip"', async () => {
      const page = await document?.getPageByPageNumber(1)
      const allText = page?.texts?.map((t) => t.content).join('') ?? ''
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()
      const hasEmail = normalizedText.includes('job@z-x.vip')
      expect(hasEmail).toBe(true)
    })

    it('应该包含 "followers" 和 "following" 统计信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const allText = page?.texts?.map((t) => t.content).join('') ?? ''
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()

      expect(
        normalizedText.includes('followers') ||
          normalizedText.includes('follower')
      ).toBe(true)
      expect(normalizedText.includes('following')).toBe(true)
    })

    it('应该包含 "Repositories" 信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const allText = page?.texts?.map((t) => t.content).join('') ?? ''
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()

      expect(
        normalizedText.includes('repositories') ||
          normalizedText.includes('repository')
      ).toBe(true)
    })
  })

  describe('文本属性验证', () => {
    it('文本元素应该有有效的 ID', async () => {
      const page = await document?.getPageByPageNumber(1)
      const texts = page?.texts ?? []
      expect(texts.length).toBeGreaterThan(0)

      for (let i = 0; i < Math.min(5, texts.length); i++) {
        expect(texts[i].id).toBeDefined()
        expect(texts[i].id).toContain('page-1-text-')
      }
    })

    it('文本元素应该有位置信息 (x, y)', async () => {
      const page = await document?.getPageByPageNumber(1)
      const texts = page?.texts ?? []
      expect(texts.length).toBeGreaterThan(0)

      for (const text of texts.slice(0, 5)) {
        expect(typeof text.x).toBe('number')
        expect(typeof text.y).toBe('number')
        expect(Number.isFinite(text.x)).toBe(true)
        expect(Number.isFinite(text.y)).toBe(true)
      }
    })

    it('文本元素应该有尺寸信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const texts = page?.texts ?? []
      expect(texts.length).toBeGreaterThan(0)

      for (const text of texts.slice(0, 5)) {
        expect(typeof text.width).toBe('number')
        expect(typeof text.height).toBe('number')
        expect(text.width).toBeGreaterThanOrEqual(0)
        expect(text.height).toBeGreaterThanOrEqual(0)
      }
    })

    it('文本元素应该有字体大小信息', async () => {
      const page = await document?.getPageByPageNumber(1)
      const texts = page?.texts ?? []
      expect(texts.length).toBeGreaterThan(0)

      for (const text of texts.slice(0, 5)) {
        expect(typeof text.fontSize).toBe('number')
        expect(text.fontSize).toBeGreaterThanOrEqual(0)
      }
    })
  })

  describe('多页解析验证', () => {
    it('应该能解析所有 4 页的数据', async () => {
      for (let pageNum = 1; pageNum <= 4; pageNum++) {
        const page = await document?.getPageByPageNumber(pageNum)
        expect(page).toBeDefined()
        expect(page?.number).toBe(pageNum)
      }
    })

    it('第二页应该包含活动统计信息', async () => {
      const page = await document?.getPageByPageNumber(2)
      const allText = page?.texts?.map((t) => t.content).join('') ?? ''
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()

      const hasRelevantContent =
        normalizedText.includes('activity') ||
        normalizedText.includes('commits') ||
        normalizedText.includes('repositories') ||
        normalizedText.includes('pinned')

      expect(hasRelevantContent).toBe(true)
    })

    it('第三页应该包含贡献日历或项目信息', async () => {
      const page = await document?.getPageByPageNumber(3)
      const allText = page?.texts?.map((t) => t.content).join('') ?? ''
      const normalizedText = allText.replace(/\s+/g, '').toLowerCase()

      const hasRelevantContent =
        normalizedText.includes('contribution') ||
        normalizedText.includes('homepage') ||
        normalizedText.includes('public') ||
        normalizedText.includes('javascript') ||
        normalizedText.includes('vue')

      expect(hasRelevantContent).toBe(true)
    })
  })

  describe('边界情况处理', () => {
    it('获取不存在的页面应该返回 undefined', async () => {
      const page = await document?.getPageByPageNumber(999)
      expect(page).toBeUndefined()
    })

    it('获取页码为 0 的页面应该返回 undefined', async () => {
      const page = await document?.getPageByPageNumber(0)
      expect(page).toBeUndefined()
    })

    it('获取负数页码的页面应该返回 undefined', async () => {
      const page = await document?.getPageByPageNumber(-1)
      expect(page).toBeUndefined()
    })
  })
})
