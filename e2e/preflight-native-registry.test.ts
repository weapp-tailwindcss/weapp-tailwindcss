import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { hbuilderx } from '../scripts/e2e-preflight/probes/desktop'
import { claimNativeSession } from '../scripts/hbuilderx-native-registry'
import { prepareNativeFixture } from './hbuilderx-native-fixture'

const state = vi.hoisted(() => ({ command: vi.fn(), tools: vi.fn(), run: vi.fn(), resolution: {} }))
vi.mock('../scripts/e2e-preflight/io', async importOriginal => ({ ...await importOriginal<object>(), command: state.command }))
vi.mock('../scripts/e2e-preflight/probes/hbuilderx-tools', () => ({ hbuilderxTools: state.tools }))
vi.mock('../packages/hbuilderx-runner/src/hbuilderx/runner', () => ({ createHBuilderXRunner: async () => ({ resolution: state.resolution, run: state.run }) }))
const roots: string[] = []
afterEach(async () => {
  vi.resetAllMocks()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

it.each(['prepare', 'live'] as const)('%s 在项目查询及平台工具探针之前读取持久阻塞', async (phase) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'preflight-native-'))
  roots.push(root)
  const host = await prepareNativeFixture(root)
  state.resolution = host
  state.command.mockResolvedValue(host.version)
  await claimNativeSession({ projectRoot: root, host, sessionId: 'frozen', directory: path.join(root, 'evidence') })
  const before = await fs.readdir(path.join(root, '.git'))
  await expect(hbuilderx({ root, dir: root, runId: 'new', url: 'http://localhost', phase, ...(phase === 'live' ? { binding: { command: host.path, host: host.host, version: host.version } } : {}) })).rejects.toThrow('未解除')
  expect(state.run).not.toHaveBeenCalled()
  expect(state.tools).not.toHaveBeenCalled()
  expect(state.command.mock.calls.map(call => call[1])).toEqual(phase === 'live' ? [['version', '--host', host.host]] : [])
  expect(await fs.readdir(path.join(root, '.git'))).toEqual(before)
})
