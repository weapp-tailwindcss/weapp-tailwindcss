import fs from 'node:fs/promises'
import path from 'node:path'
import { beforeAll, expect, it } from 'vitest'
import { importantPriorityContract as contract } from '../examples/react-lynx/src/compatibility/important-priority-contract'
import { encodeLynxCss } from './lynx/batch-encode'
import { assertImportantPriorityRules } from './lynx/important-static'
import { parseDecodedRules, parseGeneratedRules } from './lynx/static-evidence'
import { withGeneratorFixture } from './tailwind-capabilities/fixture'

let actual: ReturnType<typeof parseDecodedRules>

beforeAll(async () => {
  const root = path.resolve(import.meta.dirname, '..')
  const fixture = await fs.readFile(path.join(root, 'examples/react-lynx/src/styles/important-fixtures.css'), 'utf8')
  const global = await fs.readFile(path.join(root, 'examples/react-lynx/src/global.css'), 'utf8')
  expect(global).toContain('@import \'./styles/important-fixtures.css\' layer(utilities);')
  const css = '@import \'tailwindcss\' source(none);\n@import \'./priority.css\' layer(utilities);'
  const output = await withGeneratorFixture(root, css, { 'priority.css': fixture }, generator => generator.generate({ target: 'web', candidates: [contract.candidate, contract.normalCandidate], scanSources: false }))
  const encoded = await encodeLynxCss(output.css, { mode: 'wasm' })
  expect(encoded.encodedByteLength).toBeGreaterThan(0)
  assertImportantPriorityRules(parseGeneratedRules(encoded.sourceCss), 'generation')
  actual = parseDecodedRules(encoded.css)
})

it('实际 bundle 同时保留 ID 普通竞争者、普通 utility、important、参考与固定尺寸', () => {
  expect(() => assertImportantPriorityRules(actual, 'encoding')).not.toThrow()
})

it.each(['important', 'probe-competitor', 'control-competitor', 'reference', 'size', 'normal-important'])('%s 编码负控不能使用生成输入补证', (mode) => {
  const changed = structuredClone(actual)
  for (const rule of changed) {
    if (mode === 'probe-competitor' && rule.selector === '#probe-syntax-important') {
      rule.declarations = []
    }
    if (mode === 'control-competitor' && rule.selector === '#control-syntax-important') {
      rule.declarations = []
    }
    if (mode === 'reference' && rule.selector === contract.referenceSelector) {
      rule.declarations = []
    }
    if (mode === 'size' && rule.selector === '.probe-important-body') {
      rule.declarations.pop()
    }
    if (mode === 'important') {
      rule.declarations.forEach(declaration => delete declaration.important)
    }
    if (mode === 'normal-important' && !rule.selector.includes('!')) {
      rule.declarations.forEach(declaration => declaration.important = true)
    }
  }
  expect(() => assertImportantPriorityRules(changed, 'encoding')).toThrow(/important 优先级 encoding/)
})
