import {
  PdfParser,
  createMockRuleSet,
  generateMockData
} from '@hamster-note/pdf-parser'

const app = document.querySelector('#app')

if (!app) {
  throw new Error('Missing #app element')
}

const ruleSet = createMockRuleSet({
  id: 'vite-fixture-rule-set'
})

const { samples } = generateMockData(ruleSet)

app.textContent = JSON.stringify({
  hasPdfParser: typeof PdfParser === 'function',
  sampleCount: samples.length
})
