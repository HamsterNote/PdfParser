/**
 * Jest 早期初始化：在模块加载前注入必要的 polyfill。
 * 此文件通过 setupFiles 配置，在测试框架安装前执行。
 */

// pdfjs-dist 依赖 DOMMatrix，Node 环境需要 polyfill
if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === 'undefined') {
  // 轻量实现，仅满足 pdf.js 的类型检查需求
  ;(globalThis as { DOMMatrix: unknown }).DOMMatrix = class DOMMatrix {
    constructor(_init?: unknown) {}
  }
}
