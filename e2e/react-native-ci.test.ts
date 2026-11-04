import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import YAML from 'yaml'
import { NATIVE_CAPTURE_DRAIN_TIMEOUT, NATIVE_CAPTURE_TIMEOUT } from './react-native/capture-budget'
import { createExpoNativeEnvironment } from './react-native/native-environment'
import { stopOwnedProcess } from './react-native/process'

const workflowPath = fileURLToPath(new URL('../.github/workflows/react-native-compatibility.yml', import.meta.url))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const ownedChild = { pid: 12345 } as Parameters<typeof stopOwnedProcess>[0]
const processError = (code: string) => Object.assign(new Error(code), { code })

it('Expo Web 三个引擎分别执行语义验收并保存独立证据', async () => {
  const workflow = YAML.parse(await readFile(workflowPath, 'utf8'))
  const web = workflow.jobs.web
  const matrixBrowser = `${'$'}{{ matrix.browser }}`
  expect(web.strategy['fail-fast']).toBe(false)
  expect(web.strategy.matrix.browser).toEqual(['chromium', 'firefox', 'webkit'])
  expect(web.env.RN_WEB_BROWSER).toBe(matrixBrowser)
  expect(web.name).toContain(matrixBrowser)
  const browser = web.steps.find((step: { name?: string }) => step.name === 'Verify preinstalled Playwright browser')
  expect(browser?.run).toBe(`node scripts/ci/verify-playwright-image.mjs ${matrixBrowser}`)
  const run = web.steps.find((step: { run?: string }) => step.run === 'pnpm e2e:react-native:web')
  expect(run).toBeDefined()
  const artifact = web.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/upload-artifact@'))
  expect(artifact.with.name).toContain(matrixBrowser)
  expect(artifact.with.path).toBe(`e2e/.artifacts/react-native-web-${matrixBrowser}/**`)
  expect(artifact.with['if-no-files-found']).toBe('error')
  expect(artifact.if).toBe('always()')
  expect(web.steps.every((step: Record<string, unknown>) => !step['continue-on-error'])).toBe(true)
  const exports = await readFile(new URL('./react-native-compatibility.test.ts', import.meta.url), 'utf8')
  expect(exports).toContain('reactNativeWebBrowser(process.env.RN_WEB_BROWSER)')
  expect(exports).toMatch(/`react-native-web-\$\{selectedBrowser\.name\}`/)
  expect(exports).toContain('\'static-export-debug\'')
  expect(workflow.jobs.android.needs).toEqual(['scope', 'web', 'android-build'])
  expect(workflow.jobs.android.if).toContain('always() && !cancelled()')
  expect(workflow.jobs.ios.needs).toBe('scope')
})

it('iOS 固定标准 Intel 主机和 Xcode，保留 18.5 模拟器与完整采集门禁', async () => {
  const workflow = YAML.parse(await readFile(workflowPath, 'utf8'))
  const ios = workflow.jobs.ios
  expect(ios['runs-on']).toBe('macos-15-intel')
  expect(ios.env.DEVELOPER_DIR).toBe('/Applications/Xcode_16.4.app/Contents/Developer')
  expect(ios.needs).toBe('scope')
  expect(ios.if).toBe('needs.scope.outputs.core == \'true\'')
  expect(ios.steps.some((step: { run?: string }) => step.run === 'xcodebuild -version')).toBe(true)
  expect(ios.steps.some((step: { run?: string }) => step.run === 'pod --version')).toBe(true)
  expect(ios.steps.some((step: { run?: string }) => /brew install cocoapods/.test(step.run ?? ''))).toBe(false)
  const boot = ios.steps.find((step: { name?: string }) => step.name === 'Boot iOS simulator')
  expect(boot.run).toContain('\'iPhone 16 Pro\' \'com.apple.CoreSimulator.SimRuntime.iOS-18-5\'')
  expect(ios.steps.some((step: { run?: string }) => step.run === 'pnpm e2e:react-native:ios')).toBe(true)
  expect(ios.steps.every((step: Record<string, unknown>) => !step['continue-on-error'])).toBe(true)
  expect(NATIVE_CAPTURE_TIMEOUT).toBe(10_000)
  expect(NATIVE_CAPTURE_DRAIN_TIMEOUT).toBe(5_000)
})

it.skipIf(process.platform === 'win32')('终止后进程组已无可发送信号的成员时结束清理', async () => {
  const kill = vi.spyOn(process, 'kill')
    .mockReturnValueOnce(true)
    .mockImplementation(() => { throw processError('EPERM') })
  await expect(stopOwnedProcess(ownedChild)).resolves.toBeUndefined()
  expect(kill.mock.calls[0]).toEqual([-12345, 'SIGTERM'])
  expect(kill.mock.calls.slice(1).every(([, signal]) => signal === 0)).toBe(true)
})

it.skipIf(process.platform === 'win32')('首次终止的权限错误仍然传播', async () => {
  vi.spyOn(process, 'kill').mockImplementation(() => {
    throw processError('EPERM')
  })
  await expect(stopOwnedProcess(ownedChild)).rejects.toMatchObject({ code: 'EPERM' })
})

it.skipIf(process.platform === 'win32')('进程组不存在时不再发送信号', async () => {
  const kill = vi.spyOn(process, 'kill').mockImplementation(() => {
    throw processError('ESRCH')
  })
  await expect(stopOwnedProcess(ownedChild)).resolves.toBeUndefined()
  expect(kill).toHaveBeenCalledTimes(1)
})

it.skipIf(process.platform === 'win32')('探测阶段的未知错误仍然传播', async () => {
  vi.spyOn(process, 'kill')
    .mockReturnValueOnce(true)
    .mockImplementation(() => { throw processError('EINVAL') })
  await expect(stopOwnedProcess(ownedChild)).rejects.toMatchObject({ code: 'EINVAL' })
})

it.skipIf(process.platform === 'win32')('宽限期结束后仍存活的本轮进程组必须强制结束', async () => {
  const kill = vi.spyOn(process, 'kill').mockReturnValue(true)
  vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValue(6000)
  await stopOwnedProcess(ownedChild)
  expect(kill.mock.calls).toEqual([
    [-12345, 'SIGTERM'],
    [-12345, 0],
    [-12345, 0],
    [-12345, 'SIGKILL'],
  ])
})

it.each(['127.0.0.1', '192.168.1.20'])('Expo 独立启动进程沿用显式宿主地址 %s', (host) => {
  const exampleRequire = createRequire(new URL('../examples/react-native-expo/package.json', import.meta.url))
  const expoRequire = createRequire(exampleRequire.resolve('expo/package.json'))
  const { UrlCreator } = expoRequire('@expo/cli/build/src/start/server/UrlCreator.js')
  vi.stubEnv('REACT_NATIVE_PACKAGER_HOSTNAME', '192.168.64.4')
  const env = createExpoNativeEnvironment(host, `http://${host}:4321`, 'owned-client')
  vi.stubEnv('REACT_NATIVE_PACKAGER_HOSTNAME', env.REACT_NATIVE_PACKAGER_HOSTNAME)
  for (const hostType of ['localhost', 'lan']) {
    const creator = new UrlCreator({ hostType }, { port: 8081 })
    expect(new URL(creator.constructUrl()).hostname).toBe(host)
  }
  expect(env.EXPO_PUBLIC_RN_REPORT_URL).toBe(`http://${host}:4321`)
  expect(env.EXPO_PUBLIC_RN_REPORT_CLIENT).toBe('owned-client')
})

it('模拟器二进制检查必须在 action 安装工具链之后执行', async () => {
  const workflow = YAML.parse(await readFile(workflowPath, 'utf8'))
  const steps = workflow.jobs.android.steps
  const index = steps.findIndex((step: { uses?: string }) => step.uses?.startsWith('reactivecircus/android-emulator-runner@'))
  expect(index).toBeGreaterThan(0)
  for (const step of steps.slice(0, index)) {
    expect(step.run ?? '').not.toMatch(/emulator["']?\s+-accel-check/)
  }
  expect(steps[index].with['disable-linux-hw-accel']).toBe(false)
  expect(steps[index].with['pre-emulator-launch-script']).toContain('-accel-check')
})

it('Android 编译与模拟器使用独立主机，只消费同轮准确提交的不可变 APK', async () => {
  const workflow = YAML.parse(await readFile(workflowPath, 'utf8'))
  const build = workflow.jobs['android-build']
  const android = workflow.jobs.android
  const artifactDirectory = `${'$'}{{ runner.temp }}/react-native-android-apk`
  expect(build).toBeDefined()
  expect(build.needs).toBe('scope')
  expect(build.if).toBe('needs.scope.outputs.core == \'true\'')
  expect(android.if).toContain('needs.android-build.result == \'success\'')
  const checkout = (job: typeof android) => job.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/checkout@'))
  expect(checkout(build).with.ref).toBe(checkout(android).with.ref)
  expect(build.steps.some((step: { run?: string }) => step.run?.includes('./gradlew app:assembleDebug'))).toBe(true)
  expect(android.steps.every((step: { run?: string }) => !step.run?.includes('gradlew'))).toBe(true)
  const upload = build.steps.find((step: { uses?: string }) => step.uses?.startsWith('actions/upload-artifact@'))
  expect(upload.id).toBe('apk')
  expect(upload.if).toBeUndefined()
  expect(upload.with['if-no-files-found']).toBe('error')
  expect(upload.with.name).toBe(`react-native-android-apk-${'$'}{{ github.run_id }}-${'$'}{{ github.run_attempt }}`)
  expect(upload.with.path).toContain('app-debug.apk.sha256')
  expect(upload.with.path).toContain('source-head.txt')
  expect(build.outputs.apk_id).toBe(`${'$'}{{ steps.apk.outputs.artifact-id }}`)
  const downloadIndex = android.steps.findIndex((step: { uses?: string }) => step.uses?.startsWith('actions/download-artifact@'))
  const prebuildIndex = android.steps.findIndex((step: { run?: string }) => step.run === 'pnpm --filter @weapp-tailwindcss/example-react-native-expo exec expo prebuild --platform android --no-install')
  expect(prebuildIndex).toBeGreaterThan(0)
  expect(downloadIndex).toBeGreaterThan(prebuildIndex)
  const download = android.steps[downloadIndex]
  expect(download.with['artifact-ids']).toBe(`${'$'}{{ needs.android-build.outputs.apk_id }}`)
  expect(download.with['merge-multiple']).toBe(true)
  expect(download.with.path).toBe(artifactDirectory)
  expect(download.with['run-id']).toBeUndefined()
  const verify = android.steps[downloadIndex + 1]
  expect(verify['working-directory']).toBe(download.with.path)
  expect(verify.run).toContain('sha256sum --check app-debug.apk.sha256')
  expect(verify.run).toContain('git -C "$GITHUB_WORKSPACE" rev-parse HEAD')
  const step = android.steps.find((step: { uses?: string }) => step.uses?.startsWith('reactivecircus/android-emulator-runner@'))
  expect(step.with['disk-size']).toBe('6G')
  expect(step.with['api-level']).toBe(30)
  expect(step.with.arch).toBe('x86_64')
  expect(step.with.profile).toBe('pixel_2')
  expect(step.with['ram-size']).toBe('4096M')
  expect(step.with['heap-size']).toBe('512M')
  expect(step.with.script).toContain('pnpm e2e:react-native:android')
  expect(step.with.script).toContain(`RN_ANDROID_BINARY="${artifactDirectory}/app-debug.apk"`)
  expect(step.with.script).toContain('adb -s emulator-5554 shell df -h /data')
  expect(step.with['emulator-boot-timeout']).toBeUndefined()
  expect(android.steps.every((entry: Record<string, unknown>) => !entry['continue-on-error'])).toBe(true)
})

it.skipIf(process.platform === 'win32')('启动钩子使用已安装的 SDK 路径，并如实传播加速检查失败', async () => {
  const workflow = YAML.parse(await readFile(workflowPath, 'utf8'))
  const step = workflow.jobs.android.steps.find((step: { uses?: string }) => step.uses?.startsWith('reactivecircus/android-emulator-runner@'))
  const script = step.with['pre-emulator-launch-script']
  const root = await mkdtemp(path.join(tmpdir(), 'SDK 中文 & space-'))
  try {
    const executable = path.join(root, 'emulator', 'emulator')
    await mkdir(path.dirname(executable))
    await writeFile(executable, '#!/bin/sh\n[ "$1" = "-accel-check" ] || exit 8\nexit "$ACCEL_EXIT"\n')
    await chmod(executable, 0o755)
    for (const code of [0, 7]) {
      const result = spawnSync('sh', ['-c', script], {
        env: { ...process.env, ANDROID_HOME: root, ACCEL_EXIT: String(code) },
        encoding: 'utf8',
        timeout: 5000,
      })
      expect(result.stderr).toBe('')
      expect(result.status).toBe(code)
    }
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
