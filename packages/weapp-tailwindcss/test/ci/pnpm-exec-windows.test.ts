import { execaPnpm } from '../../../../scripts/pnpm-exec.mjs'

const state = vi.hoisted(() => ({
  execute: vi.fn().mockResolvedValue({ stdout: 'ok' }),
  access: vi.fn().mockResolvedValue(undefined),
  env: { NPM_EXECPATH: String.raw`C:\selected manager\pnpm.cjs`, Path: 'parent-bin' },
}))
vi.mock('node:process', () => ({
  default: {
    platform: 'win32',
    execPath: String.raw`C:\node\node.exe`,
    get env() {
      return state.env
    },
  },
}))
vi.mock('node:fs/promises', () => ({ access: state.access }))
vi.mock('execa', () => ({ execa: state.execute }))

beforeEach(() => {
  state.execute.mockClear()
  state.access.mockReset().mockResolvedValue(undefined)
})

it('Windows 大写活动入口与 Path 同时传入实际进程，不会从 PATH 重新选择', async () => {
  await execaPnpm(['pack'])
  expect(state.access).toHaveBeenCalledWith(state.env.NPM_EXECPATH)
  expect(state.execute).toHaveBeenCalledWith(String.raw`C:\node\node.exe`, [state.env.NPM_EXECPATH, 'pack'], {
    env: { NPM_EXECPATH: state.env.NPM_EXECPATH, PATH: 'parent-bin' },
    extendEnv: false,
    shell: false,
  })
})

it('Windows 显式删除入口在选择与执行两个边界都生效', async () => {
  await execaPnpm(['--version'], { env: { npm_execpath: undefined, PATH: 'child-bin' } })
  expect(state.access).not.toHaveBeenCalled()
  expect(state.execute).toHaveBeenCalledWith('pnpm.cmd', ['--version'], { env: { PATH: 'child-bin' }, extendEnv: false, shell: false })
})

it('缺失的显式 Windows 原生入口保留 ENOENT，禁止调度 PATH 回退', async () => {
  const failure = Object.assign(new Error('missing explicit entry'), { code: 'ENOENT' })
  state.access.mockRejectedValue(failure)
  await expect(execaPnpm(['--version'], { env: { npm_execpath: String.raw`C:\missing\pnpm-native.exe` } })).rejects.toBe(failure)
  expect(state.execute).not.toHaveBeenCalled()
})
