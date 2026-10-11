#!/usr/bin/env node
/* eslint-disable node/prefer-global/process, style/max-statements-per-line */
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve('packages-runtime')
const entries = fs.readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name)
const report = entries.map((name) => { const pkg = JSON.parse(fs.readFileSync(path.join(root, name, 'package.json'), 'utf8')); return { name: pkg.name, sideEffects: pkg.sideEffects ?? true, exports: Object.keys(pkg.exports || {}), budgetBytes: Number(process.env.P2_RUNTIME_BUDGET || 200000) } })
if (process.argv.includes('--help')) { console.log('用法: node scripts/p2-runtime-size.mjs [--json]'); process.exit(0) }
const result = { schemaVersion: 1, generatedAt: new Date().toISOString(), entries: report }
console.log(process.argv.includes('--json') ? JSON.stringify(result, null, 2) : report.map(r => `- ${r.name}: sideEffects=${r.sideEffects}, budget=${r.budgetBytes} bytes`).join('\n'))
