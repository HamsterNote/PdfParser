import baseConfig from '@system-ui-js/development-base/eslint.config.js'

const config = Array.isArray(baseConfig) ? baseConfig : [baseConfig]

// 在基础配置之上补充忽略项，避免 lint 扫描构建产物与覆盖率
const ignores = ['node_modules/', 'dist/', 'build/', 'coverage/', '*.min.js']

export default [...config, { ignores }]
