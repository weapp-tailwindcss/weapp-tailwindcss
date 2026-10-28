import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import fg from 'fast-glob'
import { JSDOM } from 'jsdom'
import postcss from 'postcss'
import { expect, it } from 'vitest'
import { createHBuilderXProjectAlias } from '../scripts/hbuilderx-project-alias.mjs'
import { withHBuilderXProjectCleanup } from '../scripts/hbuilderx-project-lifecycle'
import { createLocalHBuilderXRunner } from './hbuilderx-local/process'
import { assertIssue1319BorderEvidence, collectIssue1319BorderDeclarations } from './issue-1319-border-evidence'

const project = 'uni-app-x-vdom-tailwindcss-v4'
const filter = process.env['E2E_PROJECT_FILTER']
const enabled = process.env['E2E_ISSUE_1319_MINI'] === '1' && (!filter || new RegExp(filter).test(project))

it.skipIf(!enabled)('issue #1319 resets actual mini hosts after HTML tag compilation', async () => {
  const projectRoot = path.resolve(__dirname, '../demo', project)
  const runner = await createLocalHBuilderXRunner(projectRoot)
  const alias = await createHBuilderXProjectAlias(projectRoot)
  await withHBuilderXProjectCleanup(alias, async () => {
    await runner.run({ args: ['project', 'open', '--path', alias.projectPath] })
    await rm(path.join(projectRoot, 'unpackage', 'dist', 'dev', 'mp-weixin'), { recursive: true, force: true })
    await runner.run({ args: ['launch', 'mp-weixin', '--project', alias.projectName, '--compile', 'true'], timeoutMs: 120_000 })
    await verifyOutput(projectRoot)
  }, () => runner.run({ args: ['project', 'close', '--path', alias.projectPath], allowFailure: false, timeoutMs: 30_000 }))
}, 150_000)

async function verifyOutput(projectRoot: string) {
  const output = path.join(projectRoot, 'unpackage', 'dist', 'dev', 'mp-weixin')
  const files = await fg('**/*.wxml', { cwd: output, absolute: true })
  const evidence: Record<string, string[]> = {}
  for (const file of files.sort()) {
    const wxml = await readFile(file, 'utf8')
    if (!wxml.includes('id="issue-1319-original"')) {
      continue
    }
    const css = postcss.parse(await readFile(path.join(path.dirname(file), `${path.parse(file).name}.wxss`), 'utf8'))
    const fragment = JSDOM.fragment(wxml)
    for (const label of fragment.querySelectorAll('#issue-1319-original label')) {
      expect(new Set(label.classList)).not.toContain('weapp-tw-border')
    }
    for (const element of fragment.querySelectorAll('[id^="issue-1319-"]')) {
      expect(element.tagName.toLowerCase()).toBe('view')
      const classes = new Set(element.classList)
      expect(classes).toContain('weapp-tw-border')
      evidence[element.id] = collectIssue1319BorderDeclarations(css, classes)
    }
  }
  assertIssue1319BorderEvidence(evidence, true)
  await expect(`${JSON.stringify(evidence, null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1319/mini-borders.json')
}
