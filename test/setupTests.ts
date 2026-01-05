/**
 * Jest 全局初始化：确保 pdfjs worker 已配置，避免测试运行时报错。
 * 注意：DOMMatrix polyfill 已移至 setupPolyfills.ts，通过 setupFiles 更早执行。
 */

// 初始化 pdfjs worker（使用 legacy build）
import { setupPdfjsWorkerLegacy } from '../src/__tests__/utils'
setupPdfjsWorkerLegacy()
