import type { Issue1319WebProbe } from './issue-1319-web-preflight'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import fg from 'fast-glob'
import postcss from 'postcss'
import { expect, it } from 'vitest'
import { runPnpm } from './hbuilderx-local/process'
import { assertIssue1319BorderEvidence, collectIssue1319BorderDeclarations } from './issue-1319-border-evidence'
import { collectIssue1319MatchingWebResets, collectIssue1319WebProbes } from './issue-1319-web-preflight'

const project = 'uni-app-x-vdom-tailwindcss-v4'
const filter = process.env['E2E_PROJECT_FILTER']

it.skipIf(Boolean(filter && !new RegExp(filter).test(project)))('issue #1319 preserves HTML border utilities in production H5 output', async () => {
  const projectRoot = path.resolve(__dirname, '../demo', project)
  await runPnpm(projectRoot, ['exec', 'cross-env', 'UNI_INPUT_DIR=.', 'uni', 'build'], 120_000)
  const files = await fg('**/*.{js,css}', { cwd: path.join(projectRoot, 'dist', 'build', 'h5'), absolute: true })
  const probes = new Map<string, Issue1319WebProbe>()
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
    for (const [id, probe] of collectIssue1319WebProbes(source)) {
      probes.set(id, probe)
    }
  }
  const root = postcss.parse(styles.join('\n'))
  const evidence: Record<string, string[]> = {}
  for (const [id, probe] of probes) {
    expect(probe.tag).toBe('div')
    expect(probe.classes).not.toContain('weapp-tw-border')
    if (id !== 'issue-1319-native') {
      expect(collectIssue1319MatchingWebResets(root, probe), `${id} must match an unconditional border-width:0 base rule`).not.toHaveLength(0)
    }
    evidence[id] = collectIssue1319BorderDeclarations(root, probe.classes)
  }
  assertIssue1319BorderEvidence(evidence, false)
  await expect(`${JSON.stringify(evidence, null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1319/borders.json')
}, 150_000)
