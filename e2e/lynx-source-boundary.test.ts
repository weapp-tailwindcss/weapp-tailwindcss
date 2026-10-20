import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { compatibilityCases } from '@weapp-tailwindcss/test-catalog'
import postcss from 'postcss'
import { expect, it } from 'vitest'
import { extractProjectCandidatesWithPositions } from '../packages/engine/src/extraction/candidate-extractor/project'

it('Lynx 仅扫描实际页面和兼容性目录，不把独立parity/authoring夹具当作应用候选', async () => {
  const source = fileURLToPath(new URL('../examples/react-lynx/src/', import.meta.url))
  const stylesheet = await readFile(path.join(source, 'global.css'), 'utf8')
  const sources: Array<{ base: string, pattern: string, negated: boolean }> = []
  postcss.parse(stylesheet).walkAtRules('source', (rule) => {
    const match = /^(not\s+)?(['"])(.*?)\2$/.exec(rule.params)
    if (match) {
      sources.push({ base: source, pattern: match[3]!, negated: Boolean(match[1]) })
    }
  })
  const report = await extractProjectCandidatesWithPositions({ cwd: source, sources })
  expect(report.skippedFiles).toEqual([])
  const candidates = new Set(report.entries.map(item => item.rawCandidate))
  for (const item of compatibilityCases) {
    for (const candidate of item.className.split(/\s+/).filter(Boolean)) {
      expect(candidates, `${item.id}: ${candidate} 缺少实际扫描来源`).toContain(candidate)
    }
  }
  // URL 归属于独立 parity 夹具；把它扫入应用会触发 bundler 错误解析 /hero.png。
  expect(candidates).not.toContain('bg-[url("/hero.png")]')
  expect(candidates).not.toContain('h-[789px]')
  const files = [...new Set(report.entries.map(item => item.file))]
  expect(files.some(file => path.basename(file).endsWith('.test.ts'))).toBe(false)
  expect(files.some(file => path.basename(file).endsWith('.d.ts'))).toBe(false)
  const sharedRoot = path.resolve(source, '../../../tools/tailwindcss-test-catalog')
  const sharedFiles = files.filter((file) => {
    const relative = path.relative(sharedRoot, file)
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
  })
  expect(sharedFiles.length).toBeGreaterThan(0)
  for (const file of sharedFiles) {
    expect(file).toBe(path.join(sharedRoot, 'compatibility-candidates.txt'))
  }
})

it('共享扫描文本与真实兼容性候选完全一致，保留引号且不混入其它夹具', async () => {
  const source = await readFile(new URL('../tools/tailwindcss-test-catalog/compatibility-candidates.txt', import.meta.url), 'utf8')
  const actual = source.trim().split(/\r?\n/)
  const expected = [...new Set(compatibilityCases.flatMap(item => item.className.split(/\s+/).filter(Boolean)))]
  expect(actual).toEqual(expected)
  expect(actual).toContain('before:content-[\'lynx\']')
  expect(actual).not.toContain('bg-[url("/hero.png")]')
})
