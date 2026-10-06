import path from 'node:path'
import { createPnpmCommand } from '../../../../scripts/pnpm-command.mjs'

describe('pnpm command', () => {
  it('reuses the active pnpm cli through node when npm_execpath is available', () => {
    expect(createPnpmCommand(['build'], {
      platform: 'win32',
      execPath: 'C:\\node\\node.exe',
      npmExecPath: 'C:\\pnpm\\pnpm.cjs',
    })).toEqual({
      command: 'C:\\node\\node.exe',
      args: ['C:\\pnpm\\pnpm.cjs', 'build'],
      shell: false,
    })
  })

  it('uses a shell for the Windows cmd fallback', () => {
    expect(createPnpmCommand(['build'], {
      platform: 'win32',
      execPath: 'C:\\node\\node.exe',
      npmExecPath: undefined,
    })).toEqual({
      command: 'pnpm.cmd',
      args: ['build'],
      shell: true,
    })
  })

  it('直接复用原生 pnpm CLI，避免从 PATH 重新选择另一版本', () => {
    expect(createPnpmCommand(['exec', 'vite'], {
      platform: 'linux',
      execPath: '/usr/bin/node',
      npmExecPath: '/opt/pnpm/pnpm',
    })).toEqual({
      command: '/opt/pnpm/pnpm',
      args: ['exec', 'vite'],
      shell: false,
    })
  })

  it.each(['pnpm.exe', 'pnpm-native.exe'])('Windows 的 %s 原生入口无需 shell', (name) => {
    const cli = `C:\\active manager\\${name}`
    expect(createPnpmCommand(['--version'], { platform: 'win32', execPath: 'C:\\node.exe', npmExecPath: cli }))
      .toEqual({ command: cli, args: ['--version'], shell: false })
  })

  it.each(['pnpm.cmd', 'PNPM.CMD', 'pnpm.bat', 'pnpm.ps1', 'pnpm-native.cmd', 'pnpm-native.bat', 'pnpm-native.ps1'])('显式 %s 包装入口不能静默改用 PATH', (name) => {
    const cli = path.win32.join('C:\\selected manager', name)
    expect(() => createPnpmCommand(['run', '带 空格', '"quoted" & %PATH%'], { platform: 'win32', npmExecPath: cli }))
      .toThrow(/pnpm\.cjs.*原生可执行文件/)
  })

  it.each(['npm-cli.js', 'yarn.js'])('不会将 %s 当作当前 pnpm CLI', (name) => {
    expect(createPnpmCommand(['build'], {
      platform: 'win32',
      execPath: 'C:\\node\\node.exe',
      npmExecPath: `C:\\other manager\\${name}`,
    })).toEqual({ command: 'pnpm.cmd', args: ['build'], shell: true })
  })

  it.each(['linux', 'win32'] as const)('%s 相对 CLI 在切换子进程 cwd 前固定为绝对路径', (platform) => {
    const paths = platform === 'win32' ? path.win32 : path.posix
    const cli = paths.join('active cli', 'pnpm.cjs')
    expect(createPnpmCommand(['--version'], { platform, execPath: '/node', npmExecPath: cli }))
      .toEqual({ command: '/node', args: [paths.resolve(cli), '--version'], shell: false })
  })
})
