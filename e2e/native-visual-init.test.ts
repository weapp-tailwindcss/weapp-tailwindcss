import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { runAppCase } from '../scripts/demo-visual-e2e-report/app'
import { assertNativeSessionsAvailable } from '../scripts/hbuilderx-native-registry'
import { prepareNativeFixture } from './hbuilderx-native-fixture'

const state = vi.hoisted(() => ({ host: {}, run: vi.fn(), spawn: vi.fn() }))
vi.mock('./hbuilderx-local/app-target', () => ({ bindAppTarget: (item: unknown) => item }))
vi.mock('./hbuilderx-local/process', async importOriginal => ({
  ...await importOriginal<object>(),
  createLocalHBuilderXRunner: async () => ({ resolution: state.host, run: state.run, spawn: state.spawn }),
  readUtf8: async () => { throw new Error('source read failed after claim') },
}))

const roots: string[] = []
afterEach(async () => {
  vi.clearAllMocks()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

it('视觉入口领取后的初始化读取失败不残留 active 登记，也不启动 IDE', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-visual-init-'))
  roots.push(root)
  const host = await prepareNativeFixture(root)
  state.host = host
  const file = path.join(root, 'App.uvue')
  await fs.writeFile(file, 'original')
  await expect(runAppCase({
    name: 'init-failure',
    platform: 'app-ios',
    projectDir: root,
    sourceFile: 'App.uvue',
    outputDir: 'dist',
    markerAnchor: 'original',
    markerClass: '',
    markerText: 'initial',
    hmrMarkerClass: '',
    hmrMarkerText: 'changed',
    requiredFiles: [],
    transformedContains: [],
    hmrTransformedContains: [],
  }, { repoRoot: root, artifactRoot: path.join(root, 'evidence'), timeoutMs: 1000, viewport: { width: 20, height: 20 } }, [])).rejects.toThrow('source read failed after claim')
  await expect(assertNativeSessionsAvailable(root, host)).resolves.toBeUndefined()
  expect(await fs.readFile(file, 'utf8')).toBe('original')
  expect(state.run).not.toHaveBeenCalled()
  expect(state.spawn).not.toHaveBeenCalled()
})
