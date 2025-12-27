const baseConfig = require('@system-ui-js/development-base/jest.config.cjs')

/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  ...baseConfig,
  // 使用 ESM 以兼容 pdfjs-dist 的 .mjs 构建
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          target: 'ES2022',
          module: 'ESNext',
          moduleResolution: 'bundler',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true
        }
      }
    ]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(pdfjs-dist)/)'
  ],
  // 保持测试目录与项目结构一致
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // 支持 @ 别名指向 src 与相对导入补全
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^pdfjs-dist$': '<rootDir>/node_modules/pdfjs-dist/legacy/build/pdf.mjs'
  },
  // 初始化 pdfjs worker 等全局配置
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts']
}
