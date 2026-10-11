import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { parseSync, traverse } from '@babel/core'
import fg from 'fast-glob'
import postcss from 'postcss'
import { expect, it } from 'vitest'
import { runPnpm } from './hbuilderx-local/process'

const filter = process.env['E2E_PROJECT_FILTER']
const project = 'uni-app-x-vdom-tailwindcss-v4'
const selectorParser = createRequire(path.resolve(__dirname, '../packages/postcss/package.json'))('postcss-selector-parser')

it.skipIf(Boolean(filter && !new RegExp(filter).test(project)))('issue #1160 keeps border combinations connected to production CSS', async () => {
  const projectRoot = path.resolve(__dirname, '../demo', project)
  await runPnpm(projectRoot, ['exec', 'cross-env', 'UNI_INPUT_DIR=.', 'uni', 'build'], 120_000)
  const files = await fg('**/*.{js,css}', { cwd: path.join(projectRoot, 'dist/build/h5'), absolute: true })
  const classes = new Map<string, Set<string>>()
  const styles: string[] = []
  for (const file of files.sort()) {
    const source = await readFile(file, 'utf8')
    if (file.endsWith('.css')) {
      styles.push(source)
      continue
    }
    if (!source.includes('issue-1160-original')) {
      continue
    }
    const ast = parseSync(source, { configFile: false, babelrc: false, sourceType: 'module' })
    traverse(ast!, {
      ObjectExpression({ node }) {
        let id: string | undefined
        let className: string | undefined
        for (const property of node.properties) {
          if (property.type !== 'ObjectProperty' || property.value.type !== 'StringLiteral') {
            continue
          }
          const key = property.key.type === 'Identifier' ? property.key.name : property.key.type === 'StringLiteral' ? property.key.value : undefined
          if (key === 'id') {
            id = property.value.value
          }
          if (key === 'class') {
            className = property.value.value
          }
        }
        if (id?.startsWith('issue-1160-') && className) {
          classes.set(id, new Set(className.split(/\s+/).map(value => `.${value}`)))
        }
      },
    })
  }
  expect(classes.size).toBe(12)
  const root = postcss.parse(styles.join('\n'))
  const evidence: Record<string, string[]> = {}
  for (const [id, selectors] of classes) {
    expect([...selectors]).not.toContain('.weapp-tw-border')
    const declarations: string[] = []
    root.walkRules((rule) => {
      let matched = false
      selectorParser((selectorsRoot: any) => {
        selectorsRoot.each((selector: any) => {
          const nodes = selector.nodes
          if (nodes[0]?.type === 'class' && selectors.has(`.${nodes[0].value}`)
            && nodes.slice(1).every((node: any) => node.type === 'attribute' && node.attribute.startsWith('data-v-'))) {
            matched = true
          }
        })
      }).processSync(rule.selector)
      if (matched) {
        rule.walkDecls((decl) => {
          if (decl.prop.startsWith('border') || decl.prop === '--tw-border-style') {
            declarations.push(`${decl.prop}:${decl.value}${decl.important ? '!important' : ''}`)
          }
        })
      }
    })
    evidence[id] = declarations
  }
  expect(evidence['issue-1160-original']).toContain('border-top-width:1px')
  expect(evidence['issue-1160-pair']).toContain('border-left-width:2px')
  expect(evidence['issue-1160-override']).toContain('border-top-width:0px')
  const override = evidence['issue-1160-override']
  expect(override).toContain('border-width:2px')
  expect(override.indexOf('border-top-width:0px')).toBeGreaterThan(override.indexOf('border-width:2px'))
  for (const style of ['dashed', 'none']) {
    expect(evidence[`issue-1160-${style}`]).toContain(`--tw-border-style:${style}`)
    expect(evidence[`issue-1160-${style}`]).toContain(`border-style:${style}`)
  }
  expect(evidence['issue-1160-apply']).toContain('border-top-width:1px')
  await expect(`${JSON.stringify(evidence, null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1160/borders.json')
}, 150_000)
