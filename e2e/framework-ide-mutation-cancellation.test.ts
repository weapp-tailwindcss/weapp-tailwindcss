import type { WatchSession } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/types'
import type { IdeWatchCase } from './frameworkIdeHotUpdateArtifacts'
import { afterEach, expect, it, vi } from 'vitest'
import { waitFor } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'
import { runIdeClassHotUpdate } from './frameworkIdeClassHotUpdate'
import { runIdeStyleHotUpdate } from './frameworkIdeStyleHotUpdate'

const { artifacts, write, live } = vi.hoisted(() => ({ artifacts: vi.fn(), write: vi.fn(), live: vi.fn() }))
vi.mock('../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  writeFilePreserveEol: write,
}))
vi.mock('./frameworkIdeHotUpdateArtifacts', async importOriginal => ({
  ...await importOriginal<Record<string, unknown>>(),
  collectArtifactMtimes: artifacts,
}))
vi.mock('./frameworkIdeLivePage', () => ({ readCurrentPageLiveContent: live }))
vi.mock('../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations', () => ({
  createClassMutationScenario: () => ({ mutatedSource: 'mutated' }),
  createStyleMutationPayload: () => ({}),
}))

afterEach(() => vi.resetAllMocks())

it.each(['template', 'script', 'style'] as const)('%s 收集基线时取消，迟到读取完成后不得修改源码', async (kind) => {
  const controller = new AbortController()
  let release!: (value: unknown) => void
  artifacts.mockImplementation(() => new Promise((resolve) => {
    release = resolve
  }))
  live.mockResolvedValue({ content: '', page: {} })
  const watchCase = {
    label: 'fixture',
    templateMutation: { sourceFile: 'template.vue', roundConfigs: [{}] },
    scriptMutation: { sourceFile: 'script.ts' },
    styleMutation: { sourceFile: 'style.css', mutate: () => 'mutated' },
  } as unknown as IdeWatchCase
  const session = { ensureRunning: vi.fn() } as unknown as WatchSession
  const options = { timeoutMs: 100, pollMs: 1 } as Parameters<typeof runIdeStyleHotUpdate>[0]
  const result = (kind === 'style'
    ? runIdeStyleHotUpdate(options, watchCase, session, 'original', controller.signal)
    : runIdeClassHotUpdate(options, watchCase, session, kind, 'original', {}, {}, '/page', 'project', controller.signal))
    .catch(error => error)
  controller.abort(new Error('cancelled'))
  release({ artifacts: [], mtimes: new Map() })
  await expect(result).resolves.toMatchObject({ message: 'cancelled' })
  expect(write).not.toHaveBeenCalled()
})

it('取消能立即结束长轮询间隔，并保留原取消原因', async () => {
  const controller = new AbortController()
  const predicate = vi.fn(() => false)
  const result = waitFor(predicate, {
    timeoutMs: 120_000,
    pollMs: 60_000,
    message: 'poll failed',
    signal: controller.signal,
  }).catch(error => error)
  await Promise.resolve()
  controller.abort(new Error('deadline'))
  await expect(result).resolves.toMatchObject({ message: 'deadline' })
  expect(predicate).toHaveBeenCalledOnce()
}, 1000)
