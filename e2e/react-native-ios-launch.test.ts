import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIosLaunchReconciler, iosLaunchTimeoutApplication } from './react-native/ios-launch'

const directories: string[] = []
const device = '00000000-0000-4000-8000-000000000001'
const url = 'com.weapptailwindcss.rncompat://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081'
const processLine = '12345\t0\tUIKitApplication:com.weapptailwindcss.rncompat[owned][scene]'

function failure(application: string) {
  return [
    '› Build Succeeded',
    `› Installing ${application}`,
    '› Opening on ReactNativeCompatibility (com.weapptailwindcss.rncompat)',
    `Error: xcrun simctl openurl ${device} ${url} exited with non-zero code: 60`,
    'An error was encountered processing the command (domain=NSPOSIXErrorDomain, code=60):',
    'Operation timed out',
  ].join('\n')
}

async function fixture() {
  const artifacts = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-ios-launch-'))
  directories.push(artifacts)
  const application = path.join(artifacts, '本轮 Build App.app')
  const container = path.join(artifacts, 'Installed App.app')
  for (const directory of [application, container]) {
    await fs.mkdir(directory)
    await fs.writeFile(path.join(directory, 'RNApp'), 'same built executable')
    await fs.writeFile(path.join(directory, 'RNApp.debug.dylib'), 'same built application library')
    await fs.writeFile(path.join(directory, 'Info.plist'), 'same application metadata')
  }
  const log = failure(application)
  await fs.writeFile(path.join(artifacts, 'expo-run.log'), log)
  let time = 0
  let processes = processLine
  const execute = vi.fn(async (command: string, args: string[]) => {
    if (command === 'plutil') {
      expect(args.at(-1)).toBe(path.join(application, 'Info.plist'))
      return 'RNApp'
    }
    if (command === 'ps') {
      expect(args).toEqual(['-ww', '-p', '12345', '-o', 'comm='])
      return path.join(container, 'RNApp')
    }
    expect(args[0]).toBe('simctl')
    expect(args[2]).toBe(device)
    if (args[1] === 'get_app_container') {
      expect(args.slice(3)).toEqual(['com.weapptailwindcss.rncompat', 'app'])
      return container
    }
    if (args[1] === 'spawn') {
      expect(args.slice(3)).toEqual(['launchctl', 'list'])
      return processes
    }
    expect(args).toEqual(['simctl', 'openurl', device, url])
    return ''
  })
  const wait = vi.fn(async (ms: number) => {
    time += ms
  })
  const options = { artifacts, device, url, deadline: 30_000 }
  const dependencies = { execute, now: () => time, wait }
  return {
    application,
    container,
    log,
    options,
    dependencies,
    setProcesses: (value: string) => { processes = value },
    setTime: (value: number) => { time = value },
    retries: () => execute.mock.calls.filter(([, args]) => args[1] === 'openurl'),
    evidence: async () => JSON.parse(await fs.readFile(path.join(artifacts, 'ios-launch-reconciliation.json'), 'utf8')),
  }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

describe('iOS launch timeout reconciliation', () => {
  it('仅核对本轮安装二进制与运行进程后补发一次，后续 HMR 共用结果', async () => {
    const current = await fixture()
    const reconcile = createIosLaunchReconciler(current.options, current.dependencies)
    await Promise.all([reconcile(), reconcile()])
    await reconcile()
    expect(current.retries()).toHaveLength(1)
    expect(await current.evidence()).toMatchObject({ outcome: 'reconciled', pid: 12345, device, url })
    expect(await fs.readFile(path.join(current.options.artifacts, 'expo-run.log'), 'utf8')).toBe(current.log)
  })

  it.each([
    ['错误设备', (log: string) => log.replace(device, 'other-device')],
    ['错误 URL', (log: string) => log.replace(url, `${url}-other`)],
    ['非超时退出', (log: string) => log.replace('non-zero code: 60', 'non-zero code: 1')],
    ['退出码前缀相同', (log: string) => log.replace('non-zero code: 60', 'non-zero code: 600')],
    ['错误行额外后缀', (log: string) => log.replace('non-zero code: 60', 'non-zero code: 60 other')],
    ['错误域', (log: string) => log.replace('NSPOSIXErrorDomain', 'OtherErrorDomain')],
    ['构建失败', (log: string) => log.replace('Build Succeeded', 'Build Failed')],
    ['错误应用', (log: string) => log.replace('(com.weapptailwindcss.rncompat)', '(other.app)')],
  ])('%s 不启动核对或补发', async (_name, edit) => {
    const current = await fixture()
    await fs.writeFile(path.join(current.options.artifacts, 'expo-run.log'), edit(current.log))
    await expect(createIosLaunchReconciler(current.options, current.dependencies)()).rejects.toThrow('精确深链超时')
    expect(current.dependencies.execute).not.toHaveBeenCalled()
  })

  it('支持 ANSI 与 CRLF，安装步骤必须在成功构建和打开应用之间', async () => {
    const current = await fixture()
    expect(iosLaunchTimeoutApplication(`\u001B[32m${current.log.replaceAll('\n', '\r\n')}\u001B[0m`, device, url)).toBe(current.application)
    const invalid = current.log.replace(`› Installing ${current.application}\n`, '')
    expect(() => iosLaunchTimeoutApplication(`› Installing ${current.application}\n${invalid}`, device, url)).toThrow('阶段顺序')
  })

  it('安装产物缺失或不唯一时拒绝核对', async () => {
    const current = await fixture()
    expect(() => iosLaunchTimeoutApplication(current.log.replace(`› Installing ${current.application}`, ''), device, url)).toThrow('唯一')
    expect(() => iosLaunchTimeoutApplication(`${current.log}\n› Installing ${current.application}`, device, url)).toThrow('唯一')
  })

  it('超时后晚到的运行 PID 只读收敛，不能先终止或启动应用', async () => {
    const current = await fixture()
    current.setProcesses('-\t0\tUIKitApplication:com.weapptailwindcss.rncompat[owned]')
    current.dependencies.wait.mockImplementation(async (ms) => {
      current.setTime(ms)
      current.setProcesses(processLine)
    })
    await createIosLaunchReconciler(current.options, current.dependencies)()
    expect(current.dependencies.wait).toHaveBeenCalledOnce()
    expect(current.retries()).toHaveLength(1)
  })

  it.each(['', '12345\t0\tUIKitApplication:com.weapptailwindcss.rncompat.other[other]', `${processLine}\n${processLine.replace('12345', '23456')}`])('未运行、其它应用或歧义 PID 都不补发 (%s)', async (processes) => {
    const current = await fixture()
    current.setProcesses(processes)
    await expect(createIosLaunchReconciler(current.options, current.dependencies)()).rejects.toThrow()
    expect(current.retries()).toHaveLength(0)
    expect(current.dependencies.now()).toBeLessThanOrEqual(15_000)
  })

  it('已安装文件与本轮产物不同则停止，不能复用旧应用', async () => {
    const current = await fixture()
    await fs.writeFile(path.join(current.container, 'RNApp'), 'old executable')
    await expect(createIosLaunchReconciler(current.options, current.dependencies)()).rejects.toThrow('不一致')
    expect(current.retries()).toHaveLength(0)
    expect(await current.evidence()).toMatchObject({ outcome: 'failed' })
  })

  it('相同主程序加载壳不能掩盖不同的 Debug dylib', async () => {
    const current = await fixture()
    await fs.writeFile(path.join(current.container, 'RNApp.debug.dylib'), 'old application library')
    await expect(createIosLaunchReconciler(current.options, current.dependencies)()).rejects.toThrow('不一致')
    expect(current.retries()).toHaveLength(0)
  })

  it('相同应用 label 的旧容器进程不能代替本轮进程', async () => {
    const current = await fixture()
    const execute = current.dependencies.execute.getMockImplementation()!
    current.dependencies.execute.mockImplementation(async (command, args) => command === 'ps' ? path.join(current.application, 'RNApp') : execute(command, args))
    await expect(createIosLaunchReconciler(current.options, current.dependencies)()).rejects.toThrow('运行 PID 不属于')
    expect(current.retries()).toHaveLength(0)
  })

  it('启动预算已耗尽时零原生子进程', async () => {
    const current = await fixture()
    current.setTime(current.options.deadline)
    await expect(createIosLaunchReconciler(current.options, current.dependencies)()).rejects.toThrow('预算已耗尽')
    expect(current.dependencies.execute).not.toHaveBeenCalled()
  })

  it('第二次深链失败后不再次尝试，原始错误与失败记录均保留', async () => {
    const current = await fixture()
    const execute = current.dependencies.execute.getMockImplementation()!
    current.dependencies.execute.mockImplementation(async (command, args) => {
      if (args[1] === 'openurl') {
        throw new Error('second openurl failed')
      }
      return execute(command, args)
    })
    const reconcile = createIosLaunchReconciler(current.options, current.dependencies)
    await expect(reconcile()).rejects.toThrow('second openurl failed')
    await expect(reconcile()).rejects.toThrow('second openurl failed')
    expect(current.retries()).toHaveLength(1)
    expect(await current.evidence()).toMatchObject({ outcome: 'failed', error: 'Error: second openurl failed' })
    expect(await fs.readFile(path.join(current.options.artifacts, 'expo-run.log'), 'utf8')).toBe(current.log)
  })
})
