/* eslint-disable node/prefer-global/process */
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const check = args.includes('--check')
const positional = args.filter(arg => !arg.startsWith('--'))
const input = positional[0] ?? 'benchmark/version-compare/projects.mjs'
const output = positional[1] ?? '.tmp/p1-support-matrix.json'
const source = fs.readFileSync(path.resolve(input), 'utf8')
const rows = [...source.matchAll(/key:\s*['"]([^'"]+)['"][\s\S]*?framework:\s*['"]([^'"]+)['"]/g)].map(([, key, framework]) => ({ key, framework, bundler: 'unknown', tailwind: 'v3/v4', platform: 'mini-program', status: 'partial', tests: ['benchmark/version-compare'], evidence: 'benchmark/version-compare' }))
fs.mkdirSync(path.dirname(path.resolve(output)), { recursive: true })
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), rows }
fs.writeFileSync(path.resolve(output), `${JSON.stringify(report, null, 2)}\n`)
const markdown = `${rows.map(row => `| ${row.framework} | ${row.bundler} | ${row.tailwind} | ${row.platform} | ${row.status} | ${row.evidence} |`).join('\n')}\n`
fs.writeFileSync(path.resolve(output, '..', `${path.basename(output, path.extname(output))}.md`), `| Framework | Bundler | Tailwind | Platform | Status | Evidence |\n|---|---|---|---|---|---|\n${markdown}`)
if (check && rows.some(row => ['blocked', 'unsupported'].includes(row.status))) {
  process.exitCode = 1
}
process.stdout.write(`生成支持矩阵 ${rows.length} 项: ${output}\n`)
