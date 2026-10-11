#!/usr/bin/env node
/* eslint-disable node/prefer-global/process, style/max-statements-per-line */
import fs from 'node:fs'
import path from 'node:path'

const file = path.resolve('docs/engineering/p2-compatibility-matrix.json')
if (process.argv.includes('--help')) { console.log('用法: node scripts/p2-compat-check.mjs'); process.exit(0) }
const matrix = JSON.parse(fs.readFileSync(file, 'utf8'))
const allowed = new Set(['verified', 'partial', 'blocked', 'unsupported'])
const errors = []
for (const row of matrix.entries || []) {
  if (!row.owner || !row.test入口 || !allowed.has(row.status)) { errors.push(`兼容性条目字段无效: ${row.name || '<unknown>'}`) }
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1) }
console.log(`兼容性矩阵通过：${matrix.entries.length} 项`)
