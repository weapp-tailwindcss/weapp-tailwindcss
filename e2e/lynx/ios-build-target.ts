import type { IosBuildTarget, IosDevice } from './native-device'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { iosSimulatorDestination, requestedIosTarget } from '../../scripts/e2e-preflight/targets'
import { command } from './native-command'
import { resolveNativeDevice, selectIosBuildTarget } from './native-device'

function ciIdentity(env: NodeJS.ProcessEnv) {
  if (env['GITHUB_ACTIONS'] !== 'true' || env['RUNNER_ENVIRONMENT'] !== 'github-hosted'
    || env['RUNNER_OS'] !== 'macOS'
    || !/^\d+$/.test(env['GITHUB_RUN_ID'] ?? '') || !/^\d+$/.test(env['GITHUB_RUN_ATTEMPT'] ?? '')) {
    throw new Error('启动前构建目标仅允许本轮 GitHub hosted CI 使用。')
  }
  return { runId: env['GITHUB_RUN_ID']!, runAttempt: env['GITHUB_RUN_ATTEMPT']! }
}

async function checkoutSha(cwd: string) {
  const sha = (await command('git', ['rev-parse', 'HEAD'], cwd, 30_000)).trim()
  if (!/^[a-f\d]{40}$/.test(sha)) {
    throw new Error('无法绑定 iOS 构建目标的准确 checkout SHA。')
  }
  return sha
}

/** 保存启动前真实库存和执行身份，文件不能覆盖或跨 run/attempt/checkout 复用。 */
export async function prepareIosBuildTarget(cwd: string, file: string, env: NodeJS.ProcessEnv = process.env) {
  const identity = ciIdentity(env)
  const id = requestedIosTarget(['LYNX_IOS_DEVICE_ID'], env)
  if (!id) {
    throw new Error('iOS 构建目标必须显式指定设备。')
  }
  const sha = await checkoutSha(cwd)
  await fs.mkdir(path.dirname(file), { recursive: true })
  const inventory = await command('xcrun', ['simctl', 'list', 'devices', id, '--json'], cwd, 30_000, {
    file: path.join(path.dirname(file), 'device-discovery-command.json'),
  })
  const target = selectIosBuildTarget(inventory, env)
  await fs.writeFile(file, `${JSON.stringify({ schemaVersion: 1, ...identity, sha, inventory, target }, null, 2)}\n`, { flag: 'wx' })
  return target
}

/** 本地默认仍发现已 Booted 设备；提供了 CI 准备文件时，任何无效证据均直接阻断。 */
export async function readPreparedIosBuildTarget(cwd: string, env: NodeJS.ProcessEnv = process.env): Promise<IosBuildTarget | undefined> {
  const file = env['LYNX_IOS_BUILD_TARGET_FILE']
  if (!file) {
    return undefined
  }
  const identity = ciIdentity(env)
  const manifest = JSON.parse(await fs.readFile(file, 'utf8'))
  if (manifest?.schemaVersion !== 1 || manifest.runId !== identity.runId || manifest.runAttempt !== identity.runAttempt
    || manifest.sha !== await checkoutSha(cwd) || typeof manifest.inventory !== 'string') {
    throw new Error('iOS 构建目标证据不属于本轮 run、attempt 或 checkout。')
  }
  const target = selectIosBuildTarget(manifest.inventory, env)
  if (!manifest.target || Object.entries(target).some(([key, value]) => manifest.target[key] !== value)) {
    throw new Error('iOS 构建目标与启动前记录的身份、runtime 或 destination 不一致。')
  }
  return target
}

/** 构建与运行分别消费构建身份和当前在线身份，不重试或更换设备。 */
export async function withBuiltIosDevice<T>(target: IosBuildTarget, cwd: string, artifactDir: string, build: () => Promise<unknown>, run: (device: IosDevice) => Promise<T>, env: NodeJS.ProcessEnv = process.env, onReadiness: () => void = () => {}) {
  if (target.state === 'Shutdown') {
    ciIdentity(env)
  }
  const requested = requestedIosTarget(['LYNX_IOS_DEVICE_ID'], env)
  if (requested && requested !== target.id) {
    throw new Error('iOS 构建目标与当前请求设备不一致。')
  }
  if (env['LYNX_IOS_DESTINATION'] !== undefined && iosSimulatorDestination(target.id, env['LYNX_IOS_DESTINATION']) !== target.destination) {
    throw new Error('iOS 构建目标与当前请求 destination 不一致。')
  }
  const bound = { ...env, LYNX_IOS_DEVICE_ID: target.id, LYNX_IOS_DESTINATION: target.destination }
  await build()
  onReadiness()
  // 只有 CI 自建目标可等待并启动；本地借用设备不通过 -b 恢复被用户关闭的模拟器。
  const bootArguments = ['simctl', 'bootstatus', target.id, ...(target.state === 'Shutdown' ? ['-b'] : [])]
  await command('xcrun', bootArguments, cwd, 120_000, { file: path.join(artifactDir, 'boot-readiness-command.json') })
  // CI 自建目标已经在启动前以不可覆盖的库存绑定了 ID、runtime 和 destination。
  // `bootstatus -b` 针对同一 UDID 等待启动完成；再次 `simctl list` 会重新连接全局
  // CoreSimulator 服务，在 hosted 高并发 runner 上可能在原 30 秒窗口内卡住，且不会
  // 提供比已绑定身份更多的有效信息。直接消费该受控目标，避免把全局枚举变成安装前
  // 的第二个不稳定门槛。本地借用设备仍保留原有查询，用于确认用户当前设备确实 Booted。
  const device = target.state === 'Shutdown'
    ? { ...target, state: 'Booted' as const }
    : await resolveNativeDevice('ios', cwd, bound, { file: path.join(artifactDir, 'device-readiness-command.json') })
  if (device.platform !== 'ios' || device.id !== target.id || device.runtime !== target.runtime || device.destination !== target.destination) {
    throw new Error('iOS 运行设备与本轮构建目标的身份、runtime 或 destination 不一致。')
  }
  return { device, result: await run(device) }
}
