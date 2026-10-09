import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const manifest = require('mdn-data/package.json')

assert.equal(manifest.version, '2.37.2')
const properties = require('mdn-data/css/properties.json')

function longhands(name, visiting = new Set()) {
  if (visiting.has(name)) {
    return [name]
  }
  const computed = properties[name]?.computed
  if (!Array.isArray(computed)) {
    return [name]
  }
  return [...new Set(computed.flatMap(child => longhands(child, new Set([...visiting, name]))))].sort()
}
const entries = Object.keys(properties).sort().map(name => [name, longhands(name)])
const data = `${JSON.stringify(Object.fromEntries(entries))}\n`
const target = fileURLToPath(new URL('../src/layers/property-data.json', import.meta.url))
if (process.argv.includes('--check')) {
  const current = JSON.parse(await readFile(target, 'utf8'))
  assert.ok(JSON.stringify(current) === data.trim(), '属性表需要重新生成')
}
else { await writeFile(target, data) }
console.log(`已${process.argv.includes('--check') ? '检查' : '生成'} ${entries.length} 个属性映射`)
