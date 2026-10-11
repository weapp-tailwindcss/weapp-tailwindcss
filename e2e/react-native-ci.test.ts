import { spawnSync } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import YAML from 'yaml'
import { createExpoNativeEnvironment } from './react-native/native-environment'
import { stopOwnedProcess } from './react-native/process'

const workflowPath = fileURLToPath(new URL('../.github/workflows/react-native-compatibility.yml', import.meta.url))

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const ownedChild = { pid: 12345 } as Parameters<typeof stopOwnedProcess>[0]
const processError = (code: string) => Object.assign(new Error(code), { code })

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
  const env = createExpoNativeEnvironment(host, `http://${host}:4321`)
  vi.stubEnv('REACT_NATIVE_PACKAGER_HOSTNAME', env.REACT_NATIVE_PACKAGER_HOSTNAME)
  for (const hostType of ['localhost', 'lan']) {
    const creator = new UrlCreator({ hostType }, { port: 8081 })
    expect(new URL(creator.constructUrl()).hostname).toBe(host)
  }
  expect(env.EXPO_PUBLIC_RN_REPORT_URL).toBe(`http://${host}:4321`)
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
