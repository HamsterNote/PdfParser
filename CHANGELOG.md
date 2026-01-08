# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [UnReleased]

### Changed
- 修改 CI 脚本
- 优化单元测试
- 增加打包工具
- 更新 PdfParser 类，支持多种文件扩展名

## [0.2.0] - 2025-12-28

### Added
- Jest 测试框架及相关配置
- 新增测试脚本: test, test:watch, test:coverage
- 大幅扩展测试覆盖范围:
  - mapTextContentToIntermediate.test.ts: 新增多个测试套件,包括坐标转换、内容处理、文本方向映射、样式处理等
  - 新增 asTextItem.test.ts
  - 新增 collectMetrics.test.ts
  - 新增 mapTextDir.test.ts
  - 新增 outline-mapping.test.ts
  - 新增 transformToViewport.test.ts
- 在 PdfParser 类中添加 encode 方法的接口声明(当前为未实现状态)
- DOMMatrix polyfill 以满足 pdf.js 在 Node.js 环境的依赖
- pdfjs-dist worker 初始化工具函数
- 全局测试设置文件（test/setupTests.ts）
- TypeScript 构建配置文件（tsconfig.build.json）

### Changed
- 升级依赖版本:
  - @hamster-note/document-parser: ^0.1.0 → ^0.2.0
  - @hamster-note/types: ^0.1.0 → ^0.2.0
- 更新 yarn.lock 以反映新的依赖关系
- 修改包输出路径为 dist 目录

### Fixed
- 修复 pdfjs-dist 在 Node.js 环境的兼容性问题，使用 legacy build

### [0.1.0] - Initial Release
- 初始化项目
- 实现基本的 PdfParser 功能
- 支持 PDF 文本坐标映射
