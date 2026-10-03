import type { ProbeContext } from '../scripts/e2e-preflight/types'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runtimeAndroid, runtimeIos } from '../scripts/e2e-preflight/probes/runtime'
import { assertRuntimePath, assertRuntimeSearchPath, executableCandidates, runtimeCommand } from '../scripts/e2e-preflight/probes/runtime-command'
import { gradleJavaArgs } from './lynx/native-command'
import { androidSdkRoot, reactNativeAndroidToolchain } from './react-native/native-toolchain'

vi.mock('../scripts/e2e-preflight/probes/runtime-command', async original => ({ ...await original<object>(), runtimeCommand: vi.fn() }))
vi.mock('./react-native/native-toolchain', async original => ({ ...await original<object>(), reactNativeAndroidToolchain: vi.fn() }))
const run = vi.mocked(runtimeCommand)
const aapt2 = process.platform === 'win32' ? 'aapt2.exe' : 'aapt2'
const java = process.platform === 'win32' ? 'java.exe' : 'java'
let dir: string
let sdk: string
let context: ProbeContext

beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), 'wt-native-tools-'))
  sdk = path.join(dir, 'sdk')
  context = { root: dir, dir, runId: 'unit', url: '', phase: 'prepare' }
  const nativeRoot = path.join(dir, 'examples', 'react-native-expo', 'node_modules', 'react-native')
  const files = [
    [path.join(sdk, 'platforms', 'android-36', 'android.jar'), ''],
    [path.join(sdk, 'build-tools', '35.0.0', aapt2), ''],
    [path.join(sdk, 'build-tools', '36.0.0', aapt2), ''],
    [path.join(sdk, 'ndk', '27.1.12297006', 'source.properties'), ''],
    [path.join(nativeRoot, 'package.json'), '{"name":"react-native"}'],
    [path.join(nativeRoot, 'gradle', 'libs.versions.toml'), 'compileSdk = "36"\nbuildTools = "36.0.0"\nndkVersion = "27.1.12297006"'],
  ]
  for (const [file, content] of files) {
    await mkdir(path.dirname(file!), { recursive: true })
    await writeFile(file!, content!)
  }
  vi.stubEnv('ANDROID_HOME', sdk)
  vi.stubEnv('ANDROID_SDK_ROOT', undefined)
  vi.stubEnv('JAVA_HOME', path.join(dir, 'old-java'))
  vi.stubEnv('LYNX_JAVA_HOME', path.join(dir, 'lynx-java'))
  vi.stubEnv('LYNX_GRADLE', 'selected-gradle')
  vi.stubEnv('LYNX_POD', 'selected-pod')
  vi.mocked(reactNativeAndroidToolchain).mockResolvedValue({ javaHome: path.join(dir, 'rn-java'), sdk })
  run.mockImplementation(async (file, args) => ({
    command: file,
    output: args[0] === '-version'
      ? 'openjdk version "21.0.10"'
      : file === 'selected-gradle'
        ? 'Gradle 8.10.2\nLauncher JVM: 21.0.10\nDaemon JVM: /selected/jdk'
        : file === 'xcodegen' ? 'Version: 2.45.3' : '1.17.0',
  }))
})

afterEach(async () => {
  vi.resetAllMocks()
  vi.unstubAllEnvs()
  await rm(dir, { recursive: true, force: true })
})

describe('原生工具链实际消费边界', () => {
  it('验证两个有效 Java 覆盖及 Gradle 的实际 JAVA_HOME，允许全局旧 Java', async () => {
    const result = await runtimeAndroid(context)
    expect(result.binding?.lynxSdk).toContain('35.0.0')
    expect(result.binding?.rnSdk).toContain('36.0.0')
    expect(run).toHaveBeenCalledWith(path.join(dir, 'lynx-java', 'bin', java), ['-version'], dir)
    expect(run).toHaveBeenCalledWith(path.join(dir, 'rn-java', 'bin', java), ['-version'], dir)
    expect(run).toHaveBeenCalledWith('selected-gradle', [...gradleJavaArgs(), '--version'], dir, expect.objectContaining({ JAVA_HOME: path.join(dir, 'lynx-java') }))
    expect(run.mock.calls.every(([, args]) => args.every(arg => !/assemble|install|build$/.test(arg)))).toBe(true)
  })

  it('Gradle 缺失时保留错误，不安装或换用其他命令', async () => {
    run.mockImplementation(async (file) => {
      if (file === 'selected-gradle') {
        throw new Error('spawn selected-gradle ENOENT')
      }
      return { command: file, output: 'openjdk version "21.0.10"' }
    })
    await expect(runtimeAndroid(context)).rejects.toThrow('ENOENT')
    expect(run.mock.calls.at(-1)?.[0]).toBe('selected-gradle')
  })

  it('有效 Java 8 和无效版本均阻断', async () => {
    run.mockResolvedValue({ command: 'java', output: 'java version "1.8.0_402"' })
    await expect(runtimeAndroid(context)).rejects.toThrow('需要 Java 17')
    run.mockResolvedValue({ command: 'java', output: 'unknown' })
    await expect(runtimeAndroid(context)).rejects.toThrow('需要 Java 17')
  })

  it('Gradle 实际选择旧 Daemon JVM 时阻断', async () => {
    const oldJava = path.join(dir, 'old-java', 'bin', java)
    run.mockImplementation(async file => ({
      command: file,
      output: file === oldJava
        ? 'java version "1.8.0_402"'
        : file === 'selected-gradle' ? `Gradle 8.10.2\nDaemon JVM: '${path.join(dir, 'old-java')}' (configured)` : 'openjdk version "21.0.10"',
    }))
    await expect(runtimeAndroid(context)).rejects.toThrow('Gradle Daemon 需要 Java 17')
  })

  it.each(['8.8', '9.0'])('不接受不兼容的 Gradle %s', async (version) => {
    run.mockImplementation(async file => ({ command: file, output: file === 'selected-gradle' ? `Gradle ${version}` : 'openjdk version "21.0.10"' }))
    await expect(runtimeAndroid(context)).rejects.toThrow('需要 Gradle 8.9')
  })

  it.each([
    ['platforms', 'android-36', 'android.jar'],
    ['build-tools', '35.0.0', aapt2],
    ['build-tools', '36.0.0', aapt2],
    ['ndk', '27.1.12297006', 'source.properties'],
  ])('拒绝已声明目录内缺失组件 %s/%s/%s', async (...segments) => {
    await rm(path.join(sdk, ...segments))
    await expect(runtimeAndroid(context)).rejects.toThrow('SDK 缺少组件')
  })

  it('Lynx 未配置 SDK 时不把设备 adb 路径当成构建 SDK', async () => {
    vi.stubEnv('ANDROID_HOME', undefined)
    await expect(runtimeAndroid(context)).rejects.toThrow('缺少 ANDROID_HOME')
  })

  it('单独的 LYNX_POD 不能代替 RN PATH 中的 CocoaPods', async () => {
    run.mockImplementation(async (file) => {
      if (file === 'pod') {
        throw new Error('pod ENOENT')
      }
      return { command: file, output: '2.45.3' }
    })
    await expect(runtimeIos(context)).rejects.toThrow('pod ENOENT')
  })

  it('两条 CocoaPods 路径与 xcodegen 分别检查并绑定', async () => {
    const result = await runtimeIos(context)
    expect(run.mock.calls.map(([file]) => file)).toEqual(['xcodegen', 'pod', 'selected-pod'])
    expect(result.binding?.lynxPod).toContain('selected-pod')
  })
})

describe('工具链跨平台路径', () => {
  it('拒绝在临时构建目录改变含义的相对或空 PATH 项', () => {
    expect(() => assertRuntimeSearchPath('gradle', { PATH: './tools:/bin' }, 'linux')).toThrow('相对或空目录')
    expect(() => assertRuntimeSearchPath('pod', { PATH: '/bin:' }, 'linux')).toThrow('相对或空目录')
    expect(() => assertRuntimeSearchPath('gradle', { PATH: '.;C:\\bin' }, 'win32')).toThrow('相对或空目录')
    expect(() => assertRuntimeSearchPath('/tools/gradle', { PATH: './tools' }, 'linux')).not.toThrow()
  })

  it('带目录的相对工具路径在预检阶段拒绝，避免临时 host 中解析为另一文件', () => {
    expect(() => assertRuntimePath('./tools/gradle', 'LYNX_GRADLE', 'linux', true)).toThrow('绝对路径')
    expect(() => assertRuntimePath('.\\tools\\pod.cmd', 'LYNX_POD', 'win32', true)).toThrow('绝对路径')
    expect(() => assertRuntimePath('C:tools\\java', 'JAVA_HOME', 'win32')).toThrow('绝对路径')
    expect(() => assertRuntimePath('sdk', 'ANDROID_HOME', 'linux')).toThrow('绝对路径')
    expect(() => assertRuntimePath('gradle', 'LYNX_GRADLE', 'linux', true)).not.toThrow()
    expect(() => assertRuntimePath('C:\\tools\\gradle.bat', 'LYNX_GRADLE', 'win32', true)).not.toThrow()
  })

  it('SDK 冲突明确拒绝，等价 Windows 目录允许', () => {
    expect(() => androidSdkRoot({ ANDROID_HOME: '/sdk-a', ANDROID_SDK_ROOT: '/sdk-b' }, 'linux')).toThrow('不同目录')
    expect(androidSdkRoot({ ANDROID_HOME: 'C:\\SDK', ANDROID_SDK_ROOT: 'c:/SDK' }, 'win32')).toBe('C:\\SDK')
    expect(androidSdkRoot({}, 'darwin', '/Users/test')).toBe('/Users/test/Library/Android/sdk')
    expect(androidSdkRoot({}, 'linux', '/users/test', false)).toBeUndefined()
  })

  it('命令路径保留根、盘符、反斜杠、空格与相对目录，不经过 shell', () => {
    expect(executableCandidates('/tools/gradle', {}, '/repo', 'linux')).toEqual(['/tools/gradle'])
    expect(executableCandidates('./tools/gradle', {}, '/repo', 'linux')).toEqual(['/repo/tools/gradle'])
    expect(executableCandidates('gradle', { PATH: '/a:/b' }, '/repo', 'linux')).toEqual(['/a/gradle', '/b/gradle'])
    expect(executableCandidates('gradle', { PATH: 'C:\\Program Files\\Tools;D:\\tools', PATHEXT: '.EXE;.BAT' }, 'C:\\repo', 'win32')).toEqual(['C:\\Program Files\\Tools\\gradle.EXE', 'C:\\Program Files\\Tools\\gradle.BAT', 'D:\\tools\\gradle.EXE', 'D:\\tools\\gradle.BAT'])
    expect(executableCandidates('D:\\tools\\gradle.bat', {}, 'C:\\repo', 'win32')).toEqual(['D:\\tools\\gradle.bat'])
    expect(executableCandidates('.\\tools\\gradle.bat', {}, 'C:\\repo', 'win32')).toEqual(['C:\\repo\\tools\\gradle.bat'])
  })
})
