/* eslint-disable node/prefer-global/process, style/max-statements-per-line */
import fs from 'node:fs'
import path from 'node:path'

const file = process.argv[2]
const files = file ? [file] : fs.readdirSync(path.resolve('docs/engineering/evidence')).filter(name => name.endsWith('.json')).map(name => path.join('docs/engineering/evidence', name))
if (!files.length) { throw new Error('未找到 evidence metadata') }
let failed = false
for (const currentFile of files) {
  const metadata = JSON.parse(fs.readFileSync(path.resolve(currentFile), 'utf8'))
  const missing = ['issue', 'status', 'tests'].filter(field => metadata[field] === undefined)
  const statuses = ['verified', 'partial', 'superseded', 'not-reproducible']
  if (!statuses.includes(metadata.status)) { missing.push('status(verified|partial|superseded|not-reproducible)') }
  for (const field of ['fixture', 'e2e', 'benchmark', 'staticSnapshot', 'releaseNote']) {
    const values = metadata[field] === undefined ? [] : (Array.isArray(metadata[field]) ? metadata[field] : [metadata[field]])
    for (const value of values) {
      if (typeof value === 'string' && !/^https?:\/\//.test(value) && !fs.existsSync(path.resolve(value))) { missing.push(`${field}:${value}`) }
    }
  }
  if (missing.length) { console.error(`${currentFile}: 证据 metadata 校验失败: ${missing.join(', ')}`); failed = true }
  else {
    process.stdout.write(`${currentFile}: 证据 metadata 校验通过\n`)
  }
}
if (failed) { process.exitCode = 1 }
