import { pnpmEnvironment } from '../../../../scripts/pnpm-environment.mjs'
import { execaPnpm } from '../../../../scripts/pnpm-exec.mjs'

const { execute } = vi.hoisted(() => ({ execute: vi.fn().mockResolvedValue({ stdout: 'ok' }) }))
vi.mock('execa', () => ({ execa: execute }))
vi.mock('node:fs/promises', () => ({ access: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../../../../scripts/pnpm-command.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../scripts/pnpm-command.mjs')>()
  return {
    ...actual,
    createPnpmCommand: (args: string[], options: { npmExecPath?: string }) => actual.createPnpmCommand(args, { ...options, platform: 'win32' }),
  }
})

beforeEach(() => execute.mockClear())

describe('Execa 的 Windows pnpm 参数边界', () => {
  it('cmd 回退交给 Execa 自动转义，特殊路径保持一个参数', async () => {
    const args = ['pack', '--pack-destination', String.raw`C:\临时目录\css compat ~ #% 中文\packed`]
    const options = { cwd: String.raw`C:\项目 目录`, extendEnv: false, env: { CI: '1' } }
    await execaPnpm(args, options)
    expect(execute).toHaveBeenCalledWith('pnpm.cmd', args, { ...options, shell: false })
  })

  it('原生 pnpm 入口保留显式选择，参数不经 shell 重解释', async () => {
    const cli = String.raw`C:\selected manager\pnpm.exe`
    const args = ['run', '带 空格', '"quoted" & %PATH%']
    const options = { extendEnv: false, env: { npm_execpath: cli } }
    await execaPnpm(args, options)
    expect(execute).toHaveBeenCalledWith(cli, args, { ...options, env: pnpmEnvironment({}, options.env, false), shell: false })
  })
})
