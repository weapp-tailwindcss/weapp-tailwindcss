import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { parseSync, traverse } from '@babel/core'
import fg from 'fast-glob'
import { JSDOM } from 'jsdom'
import postcss from 'postcss'
import { expect, it } from 'vitest'
import { runWithCleanup } from '../scripts/e2e-preflight/cleanup'
import { createHBuilderXAppProject } from '../scripts/hbuilderx-app-project'
import { createHBuilderXProjectAlias } from '../scripts/hbuilderx-project-alias.mjs'
import { withHBuilderXProjectCleanup } from '../scripts/hbuilderx-project-lifecycle'
import { createLocalHBuilderXRunner, runPnpm } from './hbuilderx-local/process'

const project = 'uni-app-x-vdom-tailwindcss-v4'
const projectRoot = path.resolve(__dirname, '../demo', project)
const filter = process.env['E2E_PROJECT_FILTER']
const included = !filter || new RegExp(filter).test(project)
const selectorParser = createRequire(path.resolve(__dirname, '../packages/postcss/package.json'))('postcss-selector-parser')
const probes = ['empty', 'line', 'block', 'author']

function readProbeClasses(source: string) {
  const classes = new Map<string, string[]>()
  const ast = parseSync(source, { configFile: false, babelrc: false, sourceType: 'module' })!
  traverse(ast, {
    ObjectExpression({ node }) {
      const values: Record<string, string> = {}
      for (const property of node.properties) {
        if (property.type !== 'ObjectProperty' || property.value.type !== 'StringLiteral') {
          continue
        }
        const key = property.key.type === 'Identifier' ? property.key.name : property.key.type === 'StringLiteral' ? property.key.value : undefined
        if (key) {
          values[key] = property.value.value
        }
      }
      if (values.id?.startsWith('issue-1164-') && values.class) {
        classes.set(values.id, values.class.split(/\s+/))
      }
    },
  })
  return { ast, classes }
}

it.skipIf(!included)('issue #1164 connects all SCSS comment variants to production H5 CSS', async () => {
  await runPnpm(projectRoot, ['exec', 'cross-env', 'UNI_INPUT_DIR=.', 'uni', 'build'], 120_000)
  const files = await fg('**/*.{js,css}', { cwd: path.join(projectRoot, 'dist/build/h5'), absolute: true })
  const classes = new Map<string, string[]>()
  const styles: string[] = []
  for (const file of files.sort()) {
    const source = await readFile(file, 'utf8')
    if (file.endsWith('.css')) {
      styles.push(source)
    }
    else if (source.includes('issue-1164-')) {
      for (const [id, tokens] of readProbeClasses(source).classes) {
        classes.set(id, tokens)
      }
    }
  }
  expect(classes.size).toBe(9)
  const css = postcss.parse(styles.join('\n'))
  const evidence: Record<string, Record<string, string>> = {}
  for (const [id, tokens] of [...classes].sort(([a], [b]) => a.localeCompare(b))) {
    const declarations: Record<string, string> = {}
    css.walkRules((rule) => {
      let matched = false
      selectorParser((root: any) => {
        root.each((selector: any) => {
          const nodes = selector.nodes
          if (nodes[0]?.type === 'class' && tokens.includes(nodes[0].value)
            && nodes.slice(1).every((node: any) => node.type === 'attribute' && node.attribute.startsWith('data-v-'))) {
            matched = true
          }
        })
      }).processSync(rule.selector)
      if (matched) {
        rule.walkDecls((decl) => {
          if (['background-color', 'height', 'width', 'border-radius', 'padding-left'].includes(decl.prop)) {
            declarations[decl.prop] = decl.value
          }
        })
      }
    })
    evidence[id] = declarations
  }
  for (const probe of probes) {
    expect(evidence[`issue-1164-${probe}`]).toMatchObject({ 'background-color': '#ff7a00', 'height': '100px', 'width': '100%' })
    expect(evidence[`issue-1164-${probe}-circle`]).toMatchObject({ 'background-color': '#f21903', 'height': '48px', 'width': '48px' })
    expect(evidence[`issue-1164-${probe}-circle`]['border-radius']).toBeDefined()
  }
  await expect(`${JSON.stringify(evidence, null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1164/h5.json')
}, 150_000)

it.skipIf(!included || process.env['E2E_ISSUE_1164_HARMONY'] !== '1')('issue #1164 preserves scoped utilities in real HBuilderX Harmony style objects', async () => {
  const runner = await createLocalHBuilderXRunner(projectRoot)
  const session = await createHBuilderXAppProject({ projectRoot, platform: 'app-harmony', runner, timeoutMs: 30_000 })
  await runWithCleanup(async () => {
    await session.open()
    await runner.run({ args: ['launch', 'app-harmony', '--project', session.launchProject, '--compile', 'true'], cwd: session.projectRoot, timeoutMs: 180_000 })
    const files = await fg('**/www/assets/components/issue-1164/*.js', {
      cwd: path.join(projectRoot, 'unpackage/dist/dev/app-harmony'),
      absolute: true,
    })
    expect(files.length).toBeGreaterThanOrEqual(4)
    const evidence: Record<string, Record<string, unknown>> = {}
    for (const file of files.sort()) {
      const source = await readFile(file, 'utf8')
      const { ast, classes } = readProbeClasses(source)
      const styles: Record<string, Record<string, Record<string, unknown>>> = {}
      traverse(ast, {
        VariableDeclarator(nodePath) {
          if (nodePath.node.id.type === 'Identifier' && /^_style_\d+$/.test(nodePath.node.id.name)) {
            const result = nodePath.get('init').evaluate()
            expect(result.confident).toBe(true)
            Object.assign(styles, result.value)
          }
        },
      })
      for (const [id, tokens] of classes) {
        evidence[id] = Object.assign({}, ...tokens.map(token => styles[token]?.['']))
      }
    }
    expect(Object.keys(evidence)).toHaveLength(8)
    for (const probe of probes) {
      expect(evidence[`issue-1164-${probe}`]).toMatchObject({ backgroundColor: '#ff7a00', height: 100, width: '100%' })
      expect(evidence[`issue-1164-${probe}-circle`]).toMatchObject({
        backgroundColor: '#f21903',
        height: 48,
        width: 48,
        borderTopLeftRadius: 9999,
        borderTopRightRadius: 9999,
        borderBottomLeftRadius: 9999,
        borderBottomRightRadius: 9999,
      })
    }
    const sorted = Object.fromEntries(Object.entries(evidence).sort(([a], [b]) => a.localeCompare(b)))
    await expect(`${JSON.stringify(sorted, null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1164/harmony.json')
  }, () => session.cleanup())
}, 240_000)

it.skipIf(!included || process.env['E2E_ISSUE_1164_MINI'] !== '1')('issue #1164 keeps local utilities reachable in HBuilderX mini output', async () => {
  const alias = await createHBuilderXProjectAlias(projectRoot)
  const repository = path.resolve(__dirname, '..')
  await withHBuilderXProjectCleanup(alias, async () => {
    await runPnpm(repository, ['exec', 'hbuilderx', 'project', 'open', '--path', alias.projectPath], 30_000)
    await runPnpm(repository, ['exec', 'hbuilderx', 'launch', 'mp-weixin', '--project', alias.projectName, '--compile', 'true'], 120_000)
    const output = path.join(projectRoot, 'unpackage/dist/dev/mp-weixin')
    const files = await fg('components/issue-1164/*.wxml', { cwd: output, absolute: true })
    expect(files).toHaveLength(4)
    const evidence: Record<string, Record<string, string>> = {}
    for (const file of files.sort()) {
      const fragment = JSDOM.fragment(await readFile(file, 'utf8'))
      const css = postcss.parse(await readFile(path.join(path.dirname(file), `${path.parse(file).name}.wxss`), 'utf8'))
      const bindings = new Map<string, string>()
      const script = await readFile(path.join(path.dirname(file), `${path.parse(file).name}.js`), 'utf8')
      traverse(parseSync(script, { configFile: false, babelrc: false })!, {
        ObjectProperty(propertyPath) {
          const key = propertyPath.node.key
          if (key.type !== 'Identifier') {
            return
          }
          propertyPath.get('value').traverse({
            StringLiteral({ node }) {
              if (node.value.startsWith('issue-1164-')) {
                bindings.set(key.name, node.value)
              }
            },
          })
        },
      })
      for (const element of fragment.querySelectorAll('[id]')) {
        const boundId = element.id.match(/^\{\{\s*(\w+)\s*\}\}$/)
        const id = boundId ? bindings.get(boundId[1]) : element.id
        if (!id?.startsWith('issue-1164-')) {
          continue
        }
        const classValue = element.getAttribute('class') ?? ''
        const tokens = new Set(classValue.split(/\s+/))
        if (classValue.startsWith('{{') && classValue.endsWith('}}')) {
          tokens.clear()
          traverse(parseSync(`(${classValue.slice(2, -2)})`, { configFile: false, babelrc: false })!, {
            ArrayExpression({ node }) {
              for (const item of node.elements) {
                if (item?.type === 'StringLiteral') {
                  tokens.add(item.value)
                }
              }
            },
          })
        }
        const declarations: Record<string, string> = {}
        css.walkRules((rule) => {
          let matched = false
          selectorParser((root: any) => {
            root.each((selector: any) => {
              if (selector.nodes.every((node: any) => node.type === 'class' && tokens.has(node.value))) {
                matched = true
              }
            })
          }).processSync(rule.selector)
          if (matched) {
            rule.walkDecls((decl) => {
              if (['background-color', 'height', 'width', 'border-radius'].includes(decl.prop)) {
                declarations[decl.prop] = decl.value
              }
            })
          }
        })
        evidence[id] = declarations
      }
    }
    expect(Object.keys(evidence)).toHaveLength(8)
    for (const probe of probes) {
      expect(evidence[`issue-1164-${probe}`]).toMatchObject({ 'background-color': '#ff7a00', 'height': '100px', 'width': '100%' })
      expect(evidence[`issue-1164-${probe}-circle`]).toMatchObject({ 'background-color': '#f21903', 'height': '48px', 'width': '48px' })
      expect(evidence[`issue-1164-${probe}-circle`]['border-radius']).toBeDefined()
    }
    await expect(`${JSON.stringify(evidence, null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1164/mini.json')
  }, () => runPnpm(repository, ['exec', 'hbuilderx', 'project', 'close', '--path', alias.projectPath], 30_000))
}, 180_000)
