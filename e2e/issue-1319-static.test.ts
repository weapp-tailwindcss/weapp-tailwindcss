import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { parseSync, traverse } from '@babel/core'
import fg from 'fast-glob'
import postcss from 'postcss'
import { expect, it } from 'vitest'
import { runPnpm } from './hbuilderx-local/process'
import { assertIssue1319BorderEvidence, collectIssue1319BorderDeclarations } from './issue-1319-border-evidence'

const project = 'uni-app-x-vdom-tailwindcss-v4'
const filter = process.env['E2E_PROJECT_FILTER']

it.skipIf(Boolean(filter && !new RegExp(filter).test(project)))('issue #1319 preserves HTML border utilities in production H5 output', async () => {
  const projectRoot = path.resolve(__dirname, '../demo', project)
  await runPnpm(projectRoot, ['exec', 'cross-env', 'UNI_INPUT_DIR=.', 'uni', 'build'], 120_000)
  const files = await fg('**/*.{js,css}', { cwd: path.join(projectRoot, 'dist', 'build', 'h5'), absolute: true })
  const classes = new Map<string, Set<string>>()
  const styles: string[] = []
  for (const file of files.sort()) {
    const source = await readFile(file, 'utf8')
    if (file.endsWith('.css')) {
      styles.push(source)
      continue
    }
    if (!source.includes('issue-1319-original')) {
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
        if (id?.startsWith('issue-1319-') && className) {
          classes.set(id, new Set(className.split(/\s+/)))
        }
      },
    })
  }
  const root = postcss.parse(styles.join('\n'))
  const evidence: Record<string, string[]> = {}
  for (const [id, classNames] of classes) {
    expect(classNames).not.toContain('weapp-tw-border')
    evidence[id] = collectIssue1319BorderDeclarations(root, classNames)
  }
  assertIssue1319BorderEvidence(evidence, false)
  await expect(`${JSON.stringify(evidence, null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1319/borders.json')
}, 150_000)
