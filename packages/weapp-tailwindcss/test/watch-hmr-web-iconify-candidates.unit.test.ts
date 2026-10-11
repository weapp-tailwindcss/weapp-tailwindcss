import type { Page } from 'playwright'
import type { CliOptions } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { extractRawCandidatesWithPositions, extractSourceCandidates } from '@weapp-tailwindcss/engine'
import { expect, it, vi } from 'vitest'
import { buildDemoCases } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases/demo'
import { writeWatchedFilePreserveEol } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { runWebIconifyHmr } from '../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/web/iconify'

vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text')>()
  return { ...original, writeWatchedFilePreserveEol: vi.fn() }
})
vi.mock('../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/web/iconify/style-evidence', () => ({
  writeWebIconifyStyleEvidence: vi.fn(async () => 'web-iconify-evidence'),
}))

const repositoryRoot = path.resolve(import.meta.dirname, '../../..')
const cases = buildDemoCases(repositoryRoot)
const before = 'before:content-[\'现在，让我们开始神奇的_tailwindcss_开发之旅吧！_tw-watch-web-iconify-60a63ff8-331a-4c0a-90b6-13e317d7a082-inject\']'
const after = 'before:content-[\'现在，让我们继续神奇的_tailwindcss_HMR_回归之旅吧！_tw-watch-web-iconify-60a63ff8-331a-4c0a-90b6-13e317d7a082-content\']'
const selector = (token: string) => `.${token.replace(/[^\w-]/gu, character => `\\${character}`)}`

it('the failed TSX comment enters raw scanning but is excluded from both incremental source phases', async () => {
  const watchCase = cases.find(item => item.name === 'taro-vite-react-tailwindcss-v4')!
  const original = await readFile(watchCase.webHmr!.sourceFile, 'utf8')
  for (const content of [before, after]) {
    const source = `${original}\n// watch-probe i-[mdi--star] ${content}\n`
    expect((await extractRawCandidatesWithPositions(source, 'tsx')).some(item => item.rawCandidate === content)).toBe(true)
    expect(await extractSourceCandidates(source, 'tsx')).not.toContain(content)
  }
})

it.each(['taro-vite-react-tailwindcss-v4', 'taro-vite-vue3-tailwindcss-v4'])('%s keeps both fresh content phases in the real source candidate boundary', async (name) => {
  const watchCase = cases.find(item => item.name === name)!
  const config = watchCase.webHmr!
  const original = await readFile(config.sourceFile, 'utf8')
  let styleText = ''
  const saved: string[] = []
  const candidatesBySave: string[][] = []
  const page = {
    evaluate: vi.fn(async (_callback: unknown, tokens?: string[]) => tokens ? tokens.map(selector) : styleText),
  } as unknown as Page
  vi.mocked(writeWatchedFilePreserveEol).mockImplementation(async (_file, source) => {
    saved.push(source)
    const candidates = await extractSourceCandidates(source, path.extname(config.sourceFile).slice(1))
    candidatesBySave.push(candidates)
    styleText = candidates.map(token => `${selector(token)} {}`).join('\n')
  })

  const metrics = await runWebIconifyHmr(watchCase, { timeoutMs: 500, pollMs: 1 } as CliOptions, page, config, original, async () => {})

  expect(saved).toHaveLength(2)
  expect(candidatesBySave[0]).toContain(metrics!.beforeContentClass)
  expect(candidatesBySave[0]).not.toContain(metrics!.afterContentClass)
  expect(candidatesBySave[1]).toContain(metrics!.afterContentClass)
  expect(candidatesBySave[1]).not.toContain(metrics!.beforeContentClass)
  for (const candidates of candidatesBySave) {
    expect(candidates).toEqual(expect.arrayContaining(metrics!.iconClassTokens))
  }
  expect(saved.every(source => source.includes(`${metrics!.marker}-template`))).toBe(true)
})

it('requires an explicit mutation when the Web source is a different carrier', async () => {
  const watchCase = cases.find(item => item.name === 'taro-vite-react-tailwindcss-v4')!
  const config = { ...watchCase.webHmr!, sourceFile: path.join(repositoryRoot, 'other-entry.tsx') }

  await expect(runWebIconifyHmr(watchCase, {} as CliOptions, {} as Page, config, 'export default true', async () => {}))
    .rejects
    .toThrow('requires mutate for a separate source file')
})

it('does not fall back to a comment when the framework template carrier is unsupported', async () => {
  const watchCase = cases.find(item => item.name === 'taro-vite-react-tailwindcss-v4')!

  await expect(runWebIconifyHmr(watchCase, {} as CliOptions, {} as Page, watchCase.webHmr!, 'export default true', async () => {}))
    .rejects
    .toThrow('closing tag     </View> not found')
})
