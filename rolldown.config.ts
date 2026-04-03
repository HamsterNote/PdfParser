export default {
  input: {
    index: './src/index.ts',
    node: './src/node.ts',
    'cli/generate': './src/cli/generate.ts'
  },
  output: [{ dir: 'dist', format: 'es', sourcemap: true }],
  external: ['pdfjs-dist', /^node:/]
}
