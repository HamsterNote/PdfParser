export default {
  input: './src/index.ts',
  output: [{ dir: 'dist', format: 'es', sourcemap: true }],
  external: ['pdfjs-dist']
}
