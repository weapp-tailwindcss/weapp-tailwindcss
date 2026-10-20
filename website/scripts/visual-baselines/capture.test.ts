import { afterEach, expect, it, vi } from 'vitest'
import { runLocalCommand } from '../local-worker/command'
import { buildCandidateSource } from './capture'
import { captureIdentity, captureSource } from './identity'

vi.mock('../local-worker/command', () => ({ runLocalCommand: vi.fn() }))
vi.mock('./identity', () => ({ captureSource: vi.fn(), captureIdentity: vi.fn(), renderEnvironment: vi.fn() }))
afterEach(() => vi.resetAllMocks())

const source = { head: 'a'.repeat(40), lock: 'b'.repeat(64), contract: 'c'.repeat(64), node: 'v24.18.0' }

it('已有旧 build 也必须先成功生产构建，再读取本轮产物身份', async () => {
  vi.mocked(captureSource).mockResolvedValue(source)
  vi.mocked(captureIdentity).mockImplementation(async () => {
    expect(runLocalCommand).toHaveBeenCalledWith(expect.objectContaining({ command: 'pnpm', args: ['run', 'build'], cwd: 'website', env: { CI: '1' } }), expect.any(AbortSignal))
    return { ...source, build: 'd'.repeat(64) }
  })
  await expect(buildCandidateSource('website')).resolves.toHaveProperty('build', 'd'.repeat(64))
  expect(vi.mocked(runLocalCommand).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(captureIdentity).mock.invocationCallOrder[0]!)
})

it('构建失败或源码身份变化不能继续读取并登记旧产物', async () => {
  vi.mocked(captureSource).mockResolvedValue(source)
  vi.mocked(runLocalCommand).mockRejectedValueOnce(new Error('production-build-failed'))
  await expect(buildCandidateSource('website')).rejects.toThrow('production-build-failed')
  expect(captureIdentity).not.toHaveBeenCalled()
  vi.mocked(captureSource).mockResolvedValueOnce(source).mockResolvedValueOnce({ ...source, lock: 'e'.repeat(64) })
  await expect(buildCandidateSource('website')).rejects.toThrow('构建期间')
  expect(captureIdentity).not.toHaveBeenCalled()
})

it('工作树不干净时不启动生产构建', async () => {
  vi.mocked(captureSource).mockRejectedValue(new Error('dirty-worktree'))
  await expect(buildCandidateSource('website')).rejects.toThrow('dirty-worktree')
  expect(runLocalCommand).not.toHaveBeenCalled()
})
