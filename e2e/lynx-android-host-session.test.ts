import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { withAndroidHostSession } from './lynx/android-host-session'
import { command } from './lynx/native-command'
import { EnvironmentBlockedError, findEnvironmentBlock } from './tailwind-capabilities/environment-block'

vi.mock('execa', () => ({ execa: vi.fn() }))
vi.mock('./lynx/native-command', () => ({ command: vi.fn() }))
const directories: string[] = []
const operations: string[][] = []
beforeEach(() => {
  operations.length = 0
  vi.mocked(command).mockImplementation(async (_name, args) => {
    operations.push(args)
    return args.includes('get') ? 'null' : ''
  })
  vi.mocked(execa).mockImplementation(((_name: string, args: string[]) => {
    operations.push(args)
    return Promise.reject(new Error('logcat export failed'))
  }) as never)
})
afterEach(async () => {
  vi.resetAllMocks()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
async function directory() {
  const value = await mkdtemp(path.join(tmpdir(), 'lynx-session-'))
  directories.push(value)
  return value
}

it('logcat 失败仍恢复设置，并保留原始环境阻塞及收尾错误', async () => {
  const root = await directory()
  const primary = new EnvironmentBlockedError('bridge unavailable')
  const error = await withAndroidHostSession(root, root, { platform: 'android', id: 'owned' }, async () => {
    throw primary
  }).catch(error => error)
  expect(findEnvironmentBlock(error)).toBe(primary)
  expect(error).toBeInstanceOf(AggregateError)
  expect(operations[operations.length - 1]).toEqual(['-s', 'owned', 'shell', 'settings', 'delete', 'global', 'hide_error_dialogs'])
})

it('设置恢复失败即阻断，不能由采集完成放行', async () => {
  const root = await directory()
  vi.mocked(execa).mockResolvedValue({ all: 'logcat', exitCode: 0 } as never)
  const restoreFailure = new Error('restore denied')
  vi.mocked(command).mockImplementation(async (_name, args) => {
    if (args.includes('delete')) {
      throw restoreFailure
    }
    return args.includes('get') ? 'null' : ''
  })
  const error = await withAndroidHostSession(root, root, { platform: 'android', id: 'owned' }, async () => 'complete').catch(error => error)
  expect(findEnvironmentBlock(error)).toMatchObject({ cause: restoreFailure })
})
