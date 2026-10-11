import type { spawn, SpawnOptions } from 'node:child_process'
import { spawn as spawnNative } from 'node:child_process'
import process from 'node:process'
import { expect, it } from 'vitest'
import { resolveObserverLaunchEnvironment } from '../scripts/demo-e2e-workflow/process-observer/launch-environment'
import { windowsObserverArgs } from '../scripts/demo-e2e-workflow/process-observer/script'
import { createProcessObserverTransport } from '../scripts/demo-e2e-workflow/process-observer/transport'

it('中介进程的 PowerShell 7 模块路径不能进入 Windows PowerShell 采集器真实子进程', async () => {
  const inherited = { ...process.env, PSModulePath: 'fixture-PowerShell-7-only', psmodulepath: 'fixture-case-duplicate', PROBE_OTHER: 'unchanged' }
  const captured: SpawnOptions[] = []
  let fixtureStderr = ''
  const script = `
    if (Object.keys(process.env).some(key => key.toLowerCase() === 'psmodulepath')) {
      console.error('CommandNotFoundException: Microsoft.PowerShell.Utility selected from incompatible inherited module path');
      process.exit(23);
    }
    console.log(JSON.stringify({ event: 'observer-ready', pid: process.pid, version: '5.1.26100.0' }));
    require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
      const request = JSON.parse(line);
      console.log(JSON.stringify({ id: request.id, rows: [] }));
    });
  `
  const createChild = ((command: string, args: string[], options: SpawnOptions) => {
    expect(command).toBe('powershell')
    expect(args).toEqual(windowsObserverArgs)
    captured.push(options)
    const child = spawnNative(process.execPath, ['-e', script], { ...options, env: options.env ?? inherited })
    child.stderr!.on('data', chunk => fixtureStderr += String(chunk))
    return child
  }) as typeof spawn
  const transport = createProcessObserverTransport('powershell', windowsObserverArgs, createChild, { platform: 'win32', env: inherited })
  try {
    expect(await transport.request({ kind: 'identity' }, 5000)).toEqual([])
    expect(captured).toHaveLength(1)
    expect(captured[0]!.env!.PROBE_OTHER).toBe('unchanged')
    expect(Object.keys(captured[0]!.env!).some(key => key.toLowerCase() === 'psmodulepath')).toBe(false)
    expect(inherited.PSModulePath).toBe('fixture-PowerShell-7-only')
    expect(inherited.psmodulepath).toBe('fixture-case-duplicate')
    expect(transport.diagnostics()).toMatchObject({
      launch: { modulePathPolicy: 'windows-powershell-native', inheritedModulePath: true },
      runtimeVersion: '5.1.26100.0',
    })
    expect(JSON.stringify(transport.diagnostics())).not.toContain('fixture-PowerShell-7-only')
  }
  catch (error) {
    // eslint-disable-next-line no-console -- 旧实现对照必须保留真实子进程的环境拒绝错误，而非只记录协议流结束。
    console.log(`兼容夹具实际错误：${fixtureStderr}`)
    throw error
  }
  finally {
    await transport.close()
  }
})

it.each([
  'powershell',
  './powershell',
  '/tools/powershell',
  'PowerShell.EXE',
  'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
  'C:/Windows/System32/WindowsPowerShell/v1.0/POWERSHELL.EXE',
  '\\\\server\\tools\\PowerShell.EXE',
  '.\\tools\\powershell.exe',
  'C:powershell.exe',
  '\\powershell.exe',
])('Windows 目标按 basename 识别，删除大小写重复的模块路径：%s', (command) => {
  const env = { PSModulePath: 'first', psmodulepath: 'second', PsModulePath: 'third', PATH: 'preserved' }
  const launch = resolveObserverLaunchEnvironment(command, { platform: 'win32', env })
  expect(launch.env).toEqual({ PATH: 'preserved' })
  expect(env.PSModulePath).toBe('first')
  expect(launch.diagnostic).toEqual({ modulePathPolicy: 'windows-powershell-native', inheritedModulePath: true })
})

it.each([
  'pwsh',
  'C:\\Program Files\\PowerShell\\7\\pwsh.exe',
  'node.exe',
  'fixture',
  'custom-powershell.exe',
  'powershell.exe.backup',
])('非 Windows PowerShell 命令保留调用方环境：%s', (command) => {
  const env = { PSModulePath: 'custom-user-path', OTHER: 'preserved' }
  const launch = resolveObserverLaunchEnvironment(command, { platform: 'win32', env })
  expect(launch.env).toBe(env)
  expect(launch.diagnostic.modulePathPolicy).toBe('inherit')
})

it.each(['linux', 'darwin'] as const)('POSIX 上同名命令也不重建模块路径：%s', (platform) => {
  const env = { PSModulePath: 'custom-user-path' }
  expect(resolveObserverLaunchEnvironment('powershell', { platform, env }).env).toBe(env)
})

it('没有模块路径时仍保留其它环境，不创造 WinPSModulePath 约定', () => {
  const env = { PATH: 'preserved', WinPSModulePath: 'not-an-implicit-contract' }
  const launch = resolveObserverLaunchEnvironment('powershell', { platform: 'win32', env })
  expect(launch.env).toEqual(env)
  expect(launch.diagnostic.inheritedModulePath).toBe(false)
})

it.each([{}, null, 51, '5.1', '5.1.0"forged', '5.1.0\nforged'])('运行时版本不是有限数字版本字符串时使会话失效：%j', async (version) => {
  const script = `
    process.stdin.once('data', data => {
      const request = JSON.parse(String(data));
      console.log(JSON.stringify({ event: 'observer-ready', pid: process.pid, version: ${JSON.stringify(version)} }));
      console.log(JSON.stringify({ id: request.id, rows: [] }));
    });
    process.stdin.resume();
  `
  const transport = createProcessObserverTransport(process.execPath, ['-e', script])
  let failure: unknown
  try {
    failure = await transport.request({ kind: 'identity' }, 5000).catch(error => error)
    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).toContain('运行时版本格式无效')
    expect(transport.diagnostics().readyAtMs).toBeNull()
    expect(transport.diagnostics().runtimeVersion).toBeNull()
  }
  finally {
    if (failure !== undefined) {
      await expect(transport.close()).rejects.toBe(failure)
    }
    else {
      await transport.close()
    }
  }
})
