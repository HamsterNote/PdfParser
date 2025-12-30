# 更新日志

## [Unreleased]

### Added
- Jest 测试框架配置，支持 ESM 和 TypeScript
- DOMMatrix polyfill 以满足 pdf.js 在 Node.js 环境的依赖
- pdfjs-dist worker 初始化工具函数
- 全局测试设置文件（test/setupTests.ts）
- TypeScript 构建配置文件（tsconfig.build.json）

### Changed
- 更新 package.json，添加 Jest 相关依赖和测试脚本
- 修改包输出路径为 dist 目录
- 简化基础测试用例，验证测试环境配置

### Fixed
- 修复 pdfjs-dist 在 Node.js 环境的兼容性问题，使用 legacy build

### Chore
- 配置项目启用 ESM 模块支持，在 package.json 中添加 "type": "module"
- 更新 yarn.lock 依赖版本格式为语义化版本范围
