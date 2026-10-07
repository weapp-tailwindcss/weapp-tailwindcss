import type { IJsHandlerOptions } from '../../src/types'
import assert from 'node:assert/strict'
import process from 'node:process'
import { splitCandidateTokens } from '@weapp-tailwindcss/engine'
import { escape, MappingChars2String } from '@weapp-tailwindcss/escape'
import { native } from './transform/binding'
import { classes, sources } from './transform/fixtures'
import { analyzeReference, transformReference } from './transform/reference'

function create(classes: string[], map: Record<string, string> = MappingChars2String) {
  return native.createJsTransformer(classes, Object.entries({ ...MappingChars2String, ...map }).map(([character, replacement]) => ({ character, replacement })))!
}

let count = 0
const maps = [MappingChars2String, { '[': 'LEFT', ']': 'RIGHT', '/': 'SLASH' }, { '[': '$&$`', ']': '$$$\'' }]
for (const map of maps) {
  for (const classNames of [classes, classes.map(value => escape(value, { map }))]) {
    const instance = create(classNames, map)
    for (const lang of ['js', 'jsx', 'ts', 'tsx'] as const) {
      for (const sourceType of ['module', 'script', 'unambiguous'] as const) {
        for (const preserveParens of [false, true]) {
          const config = { lang, sourceType, preserveParens }
          for (const source of sources) {
            for (const alwaysEscape of [false, true]) {
              for (const unescapeUnicode of [false, true]) {
                const options: IJsHandlerOptions = { escapeMap: map, classNameSet: new Set(classNames), alwaysEscape, unescapeUnicode }
                const analysis = analyzeReference(source, config)
                const expected = analysis ? transformReference(source, analysis, options) : undefined
                const actual = instance.transform(source, lang, sourceType, preserveParens, { alwaysEscape, unescapeUnicode })
                assert.equal(actual ?? undefined, expected, JSON.stringify({ source, config, options: { alwaysEscape, unescapeUnicode }, map }))
                count++
              }
            }
          }
        }
      }
    }
  }
}

let seed = 0x4A735274
const alphabet = [...'ab01-_:[]{}()<>/%?.$\\ \'"\t\r\n\u00A0中😀']
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed
}
for (let index = 0; index < 2000; index++) {
  let literal = ''
  const length = random() % 90
  for (let cursor = 0; cursor < length; cursor++) {
    literal += alphabet[random() % alphabet.length]
  }
  const classNames = splitCandidateTokens(literal)
  const source = `const x = ${JSON.stringify(literal)}`
  const instance = create(classNames)
  const config = { lang: 'js', sourceType: 'module', preserveParens: false } as const
  const expected = transformReference(source, analyzeReference(source, config)!, { classNameSet: new Set(classNames) })
  assert.equal(instance.transform(source, 'js', 'module', false, {}) ?? undefined, expected, source)
  count++
}

const atomic = create(['w-[10px]'])
const source = 'const x = "w-[10px] h-[20px]"'
assert.equal(atomic.replaceClassNames(['h-[20px]', '\uD800']), false)
assert.equal(atomic.transform(source, 'js', 'module', false, {}), 'const x = "w-_b10px_B h-[20px]"')
assert.equal(atomic.replaceClassNames(['h-[20px]']), true)
assert.equal(atomic.transform(source, 'js', 'module', false, {}), 'const x = "w-[10px] h-_b20px_B"')
assert.equal(create(['w-[10px]']).transform('const x = "\uD800 w-[10px]"', 'js', 'module', false, {}), null)
assert.equal(create(['w-[10px]']).transform('const x = `\\ud800 w-[10px]`', 'js', 'module', false, { unescapeUnicode: true }), null)
assert.equal(create(classes).transform('import x from "w-[10px]"', 'js', 'module', false, { moduleGraph: true }), null)
assert.equal(create(classes).transform('const x = tw`w-[10px]`', 'js', 'module', false, { ignoreTaggedTemplates: true }), null)
process.stdout.write(`${JSON.stringify({ abiCases: count, lifecycleAndFallbackCases: 7, passed: true })}\n`)
