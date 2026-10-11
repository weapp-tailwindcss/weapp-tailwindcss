/* eslint-disable regexp/no-unused-capturing-group */
import process from 'node:process'

const files = process.argv.slice(2).filter(file => !file.startsWith('--'))
const rules = [[/packages\/weapp-tailwindcss\/src\/(bundlers|compiler)/, '需要 compiler/adapter 契约、demo、E2E 与矩阵证据'], [/packages-runtime\//, '需要 runtime 兼容性、体积与 tree-shaking 验证'], [/skills\/|AGENTS\.md$/, '需要 skill/规则触发样例与评测说明'], [/platform|uni-app|taro/i, '需要平台矩阵与迁移文档同步']]
const findings = files.flatMap(file => rules.filter(([pattern]) => pattern.test(file)).map(([, message]) => ({ file, message })))
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), documentationOnly: files.length > 0 && files.every(file => /(^|\/)(docs|README|website)\//.test(file) || /README\.md$/.test(file)), findings }
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
if (process.argv.includes('--check') && findings.length === 0 && files.length > 0 && !report.documentationOnly) {
  process.exitCode = 1
}
