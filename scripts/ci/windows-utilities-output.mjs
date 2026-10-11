import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import postcss from 'postcss'

export const standardClasses = ['h-8', 'h-20', 'h-50', 'mt-2', 'flex', 'text-slate-500']
const specialClasses = ['h-_b64rpx_B', 'h-_b400rpx_B', 'bg-emerald-50_f80']

async function collectFiles(dir) {
  const result = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...await collectFiles(file))
    }
    else {
      result.push(file)
    }
  }
  return result
}

export async function inspectOutput(outputDir) {
  const files = await collectFiles(outputDir)
  const rules = new Map()
  let spacing
  let js = ''
  for (const file of files) {
    if (file.endsWith('.js')) {
      js += await readFile(file, 'utf8')
    }
    if (!file.endsWith('.wxss')) {
      continue
    }
    const root = postcss.parse(await readFile(file, 'utf8'), { from: file })
    root.walkDecls('--spacing', (decl) => {
      spacing = decl.value.replace(/\s+/g, '')
    })
    root.walkRules((rule) => {
      for (const selector of rule.selectors) {
        if (![...standardClasses, ...specialClasses].some(name => selector === `.${name}`)) {
          continue
        }
        const declarations = {}
        rule.walkDecls((decl) => {
          declarations[decl.prop] = decl.value.replace(/\s+/g, '')
        })
        rules.set(selector.slice(1), declarations)
      }
    })
  }
  const classNames = [...js.matchAll(/className\s*:\s*["']([^"']*)["']/g)]
    .flatMap(match => match[1].split(/\s+/))
  return {
    spacing: spacing ?? null,
    standard: Object.fromEntries(standardClasses.map(name => [name, rules.get(name) ?? null])),
    special: Object.fromEntries(specialClasses.map(name => [name, rules.get(name) ?? null])),
    jsClasses: [...new Set(classNames)].sort(),
  }
}

export function verifyOutput(result, expectRegression) {
  for (const name of specialClasses) {
    assert.ok(result.special[name], `Missing special utility ${name}`)
    assert.ok(result.jsClasses.includes(name), `JS/CSS class mismatch: ${name}`)
  }
  assert.equal(result.special['h-_b64rpx_B'].height, '64rpx')
  assert.equal(result.special['h-_b400rpx_B'].height, '400rpx')
  for (const name of standardClasses) {
    assert.ok(result.jsClasses.includes(name), `Missing JS class ${name}`)
    if (expectRegression) {
      assert.equal(result.standard[name], null, `Published version unexpectedly generates ${name}`)
    }
    else {
      assert.ok(result.standard[name], `Missing standard utility ${name}`)
    }
  }
  if (expectRegression) {
    assert.equal(result.spacing, null)
    return
  }
  assert.equal(result.spacing, '8rpx')
  for (const height of [8, 20, 50]) {
    assert.equal(result.standard[`h-${height}`].height, `calc(var(--spacing)*${height})`)
  }
  assert.equal(result.standard['mt-2']['margin-top'], 'calc(var(--spacing)*2)')
  assert.equal(result.standard.flex.display, 'flex')
  assert.ok(result.standard['text-slate-500'].color)
}
