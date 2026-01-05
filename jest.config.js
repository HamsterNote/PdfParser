export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^@PdfParser$': '<rootDir>/src/index.ts',
    '^@hamster-note/document-parser$':
      '<rootDir>/src/__mocks__/@hamster-note/document-parser.ts',
    '^@hamster-note/types$': '<rootDir>/src/__mocks__/@hamster-note/types.ts'
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          esModuleInterop: true,
          allowSyntheticDefaultImports: true
        }
      }
    ]
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/__mocks__/**'
  ],
  // 在模块加载前注入 DOMMatrix polyfill
  setupFiles: ['<rootDir>/test/setupPolyfills.ts'],
  // 初始化 pdfjs worker 等全局配置
  setupFilesAfterEnv: ['<rootDir>/test/setupTests.ts']
}
