import { dts } from 'rolldown-plugin-dts'

export default [
  {
    input: {
      browser: './src/browser.ts',
      index: './src/index.ts',
      node: './src/node.ts',
      'cli/generate': './src/cli/generate.ts'
    },
    output: [{ dir: 'dist', format: 'es', sourcemap: true }],
    external: ['pdfjs-dist', /^node:/]
  },
  {
    input: './src/index.ts',
    plugins: [dts({ emitDtsOnly: true })],
    output: [{ dir: 'dist', format: 'es' }],
    external: ['pdfjs-dist', /^node:/]
  },
  {
    input: './src/browser.ts',
    plugins: [dts({ emitDtsOnly: true })],
    output: [{ dir: 'dist', format: 'es' }],
    external: ['pdfjs-dist', /^node:/]
  }
]
