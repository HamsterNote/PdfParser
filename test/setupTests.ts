/**
 * Jest 全局初始化：确保 pdfjs worker 已配置，避免测试运行时报错。
 */

// pdfjs-dist 依赖 DOMMatrix，Node 环境需要简单 polyfill
if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
  // 轻量实现，仅满足 pdf.js 的类型检查需求
  ;(globalThis as { DOMMatrix: unknown }).DOMMatrix = class DOMMatrix {
    constructor(_init?: unknown) {}
  }
}

// 初始化 pdfjs worker（使用 legacy build）
import { setupPdfjsWorkerLegacy } from '../src/__tests__/utils'
setupPdfjsWorkerLegacy()
