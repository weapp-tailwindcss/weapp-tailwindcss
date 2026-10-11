import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { parseSync, traverse } from '@babel/core'
import fg from 'fast-glob'
import postcss from 'postcss'
import { expect, it } from 'vitest'
import { withIssue1144Setup } from './hbuilderx-local/issue-1144-source'
import { runPnpm } from './hbuilderx-local/process'

const filter = process.env['E2E_PROJECT_FILTER']

async function verifyProduction(projectRoot: string) {
  await runPnpm(projectRoot, ['exec', 'cross-env', 'UNI_INPUT_DIR=.', 'uni', 'build'], 120_000)
  const outputRoot = path.join(projectRoot, 'dist/build/h5')
  const files = await fg('**/*.{js,css}', { cwd: outputRoot, absolute: true })
  const classes: Record<string, string> = {}
  const css: string[] = []
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    if (file.endsWith('.css')) {
      css.push(source)
      continue
    }
    if (!source.includes('issue-1144-important-probe')) {
      continue
    }
    const ast = parseSync(source, { configFile: false, babelrc: false, sourceType: 'module' })
    traverse(ast!, {
      ObjectProperty({ node }) {
        if (node.key.type !== 'Identifier') {
          return
        }
        if (node.key.name === 'class' && node.value.type === 'StringLiteral' && node.value.value.includes('issue-1144-important-probe')) {
          classes.margin = node.value.value.split(/\s+/).find(value => value.startsWith('wtu-'))!
        }
        // UTS setup 编译器用构造调用承载对象字面量；沿实际 pt 值读取相同的 root。
        const value = node.value.type === 'NewExpression'
          && node.value.callee.type === 'Identifier' && node.value.callee.name === 'UTSJSONObject'
          ? node.value.arguments[0]
          : node.value
        if (node.key.name === 'pt' && value?.type === 'ObjectExpression') {
          for (const property of value.properties) {
            if (property.type === 'ObjectProperty' && property.key.type === 'Identifier' && property.key.name === 'root' && property.value.type === 'StringLiteral') {
              classes.padding = property.value.value
            }
          }
        }
      },
    })
  }
  expect(Object.keys(classes).sort()).toEqual(['margin', 'padding'])
  const evidence: Record<string, string[]> = { margin: [], padding: [] }
  const root = postcss.parse(css.join('\n'))
  root.walkAtRules('apply', () => {
    throw new Error('生产 CSS 不应保留 @apply')
  })
  root.walkRules((rule) => {
    const selectors = rule.selector.match(/\.wtu-[\w-]+/g) ?? []
    for (const [probe, className] of Object.entries(classes)) {
      if (selectors.includes(`.${className}`)) {
        rule.walkDecls(decl => evidence[probe]!.push(`${decl.prop}: ${decl.value}${decl.important ? ' !important' : ''}`))
      }
    }
  })
  expect(evidence.margin).toContain('margin-top: 24px !important')
  expect(evidence.padding).toContain('padding: 0 !important')
  await expect(`${JSON.stringify(evidence, null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1144-web/important.json')
}

it.skipIf(Boolean(filter && !new RegExp(filter).test('issue-1144-uni-app-x-web'))).each(['options', 'setup'])('issue #1144 production output keeps %s pt and important CSS connected', async (script) => {
  const projectRoot = path.resolve(__dirname, '../demo/issue-1144-uni-app-x-web')
  if (script === 'setup') {
    await withIssue1144Setup(projectRoot, () => verifyProduction(projectRoot))
  }
  else {
    await verifyProduction(projectRoot)
  }
}, 150_000)
