import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

const [directory, format, entry] = process.argv.slice(2)
const require = createRequire(path.join(directory, 'package.json'))
async function load(name) {
  if (format === 'cjs') {
    return require(name)
  }
  return import(name)
}
const started = performance.now()
const module = await load(entry)
const loaded = performance.now()
if (entry.endsWith('/vite')) {
  assert.ok(module.WeappTailwindcss())
}
else if (entry.endsWith('/webpack')) {
  assert.ok(new module.WeappTailwindcss())
}
else if (entry.endsWith('/postcss')) {
  assert.ok(module.weappTailwindcssPostcssPlugin())
}
const initialized = performance.now()
const generatorModule = await load('weapp-tailwindcss/generator')
const source = await generatorModule.resolveTailwindV4Source({ css: '@theme default { --spacing: 0.25rem; }\n@tailwind utilities;', base: directory })
const generator = generatorModule.createWeappTailwindcssGenerator(source)
const generated = await generator.generate({ candidates: ['w-[100px]'] })
assert.ok(generated.css.includes('w-_b100px_B'))
const generatedAt = performance.now()
const { createStyleHandler } = await load('@weapp-tailwindcss/postcss/transform')
let visits = 0
const handler = createStyleHandler({ postcssOptions: { plugins: [{ postcssPlugin: 'entry-cost-custom', Declaration() {
  visits++
} }] } })
const result = await handler('.x { width: 10rpx; }', { from: path.join(directory, 'entry.css') })
assert.ok(result.css.includes('10rpx'))
assert.ok(visits > 0, '首次转换必须执行自定义插件')
console.log(JSON.stringify({ entry, format, loadMs: loaded - started, initializeMs: entry === 'weapp-tailwindcss' ? null : initialized - loaded, firstGenerateMs: generatedAt - initialized, firstTransformMs: performance.now() - generatedAt, totalMs: performance.now() - started, maxRssMb: process.resourceUsage().maxRSS / 1024, visits, resolution: format === 'esm' ? import.meta.resolve(entry) : require.resolve(entry) }))
