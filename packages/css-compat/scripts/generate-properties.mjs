import assert from 'node:assert/strict'
import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const manifest = require('mdn-data/package.json')

assert.equal(manifest.version, '2.37.2')
const properties = require('mdn-data/css/properties.json')

// computed 描述计算值，不能直接视为完整简写表；固定数据的遗漏在此显式补全。
const corrections = {
  'font-variant': ['font-variant-alternates', 'font-variant-caps', 'font-variant-east-asian', 'font-variant-emoji', 'font-variant-ligatures', 'font-variant-numeric', 'font-variant-position'],
  'font-synthesis': ['font-synthesis-weight', 'font-synthesis-style', 'font-synthesis-small-caps', 'font-synthesis-position'],
  'white-space': ['white-space-collapse', 'text-wrap-mode', 'white-space-trim'],
  'text-box': ['text-box-trim', 'text-box-edge'],
  'marker': ['marker-start', 'marker-mid', 'marker-end'],
  'view-timeline': ['view-timeline-name', 'view-timeline-axis', 'view-timeline-inset'],
  'stroke': ['*'],
  'vertical-align': ['*'],
  'line-clamp': ['*'],
}

function longhands(name, visiting = new Set()) {
  if (visiting.has(name)) {
    return [name]
  }
  const computed = Object.hasOwn(corrections, name) ? corrections[name] : properties[name]?.computed
  if (!Array.isArray(computed)) {
    return [name]
  }
  return [...new Set(computed.flatMap(child => longhands(child, new Set([...visiting, name]))))].sort()
}
const entries = Object.keys(properties).sort().map(name => [name, longhands(name)])
const data = `{ ${entries.map(([name, values]) => `${JSON.stringify(name)}: [${values.map(value => JSON.stringify(value)).join(', ')}]`).join(', ')} }\n`
const target = fileURLToPath(new URL('../src/layers/property-data.json', import.meta.url))
if (process.argv.includes('--check')) {
  const current = JSON.parse(await readFile(target, 'utf8'))
  assert.ok(JSON.stringify(current) === JSON.stringify(Object.fromEntries(entries)), '属性表需要重新生成')
}
else { await writeFile(target, data) }
console.log(`已${process.argv.includes('--check') ? '检查' : '生成'} ${entries.length} 个属性映射`)
