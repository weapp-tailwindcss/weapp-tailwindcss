import type { ProbeContext, ProbeOutput } from '../types'
import { access, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { parseHdcTargets, parseIosSimulatorDevices } from '../../../packages/hbuilderx-runner/src/toolchains'
import { assertImage, command, imageCommand } from '../io'
import { parseAdbDevices, requestedIosTarget, requestedTarget, selectTarget } from '../targets'

export { parseAdbDevices, requestedTarget, selectTarget } from '../targets'

async function executable(candidates: Array<string | undefined>, args: string[]) {
  const errors: string[] = []
  for (const candidate of [...new Set(candidates.filter((item): item is string => Boolean(item)))]) {
    try {
      return { file: candidate, version: await command(candidate, args) }
    }
    catch (error) {
      errors.push(String(error))
    }
  }
  throw new Error(errors.join('\n'))
}

export async function android(ctx: ProbeContext): Promise<ProbeOutput> {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT
    ?? (process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Android', 'sdk') : undefined)
  const tool = await executable(ctx.binding
    ? [ctx.binding.command]
    : [
        ...(sdk ? [path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb')] : ['adb']),
      ], ['version'])
  const devices = parseAdbDevices(await command(tool.file, ['devices', '-l']))
  const requested = ctx.binding?.device ?? requestedTarget(['E2E_HBUILDERX_ANDROID_DEVICE_ID', 'E2E_HBUILDERX_ANDROID_SCREENSHOT_DEVICE_ID', 'RN_ANDROID_DEVICE_ID', 'LYNX_ANDROID_DEVICE_ID', 'ANDROID_SERIAL'])
  const unavailable = devices.find(item => item.id === requested && item.state !== 'device')
  if (unavailable) {
    throw new Error(`Android ${unavailable.id}：${unavailable.state}`)
  }
  const device = selectTarget(devices.filter(item => item.state === 'device').map(item => item.id), requested)
  const args = ['-s', device]
  const shell = (...tail: string[]) => command(tool.file, [...args, 'shell', ...tail])
  if (await shell('getprop', 'sys.boot_completed') !== '1') {
    throw new Error(`Android ${device} 尚未完成启动。`)
  }
  const model = await shell('getprop', 'ro.product.model')
  const system = await shell('getprop', 'ro.build.version.release')
  const binding = { command: tool.file, device, version: tool.version, model, system }
  if (ctx.phase === 'live') {
    return { detail: 'Android 在线且 shell 可响应。', binding }
  }
  const remote = `/sdcard/wt-preflight-${ctx.runId}.xml`
  const xml = path.join(ctx.dir, 'android-ui.xml')
  const screenshot = path.join(ctx.dir, 'android.png')
  try {
    await shell('uiautomator', 'dump', remote)
    const layout = await command(tool.file, [...args, 'exec-out', 'cat', remote])
    if (!layout.includes('<node ')) {
      throw new Error('Android 未取得有效 UI 结构。')
    }
    await writeFile(xml, layout)
    await imageCommand(tool.file, [...args, 'exec-out', 'screencap', '-p'], screenshot)
  }
  finally {
    await shell('rm', '-f', remote)
  }
  return { detail: 'Android 启动、shell、UI 结构和截图通过。', binding, evidence: [xml, screenshot] }
}

export async function ios(ctx: ProbeContext): Promise<ProbeOutput> {
  if (process.platform !== 'darwin') {
    throw new Error('当前主机不支持 iOS Simulator；全面测试不能跳过 iOS。')
  }
  await command('xcrun', ['--find', 'simctl'])
  const version = await command('xcodebuild', ['-version'])
  await command('xcodebuild', ['-checkFirstLaunchStatus'])
  const devices = parseIosSimulatorDevices(await command('xcrun', ['simctl', 'list', 'devices', 'available', '--json']))
  const requested = ctx.binding?.device ?? requestedIosTarget(['E2E_HBUILDERX_IOS_DEVICE_ID', 'E2E_HBUILDERX_IOS_SCREENSHOT_TARGET', 'E2E_HBUILDERX_IOS_TARGET', 'RN_IOS_DEVICE_ID', 'LYNX_IOS_DEVICE_ID'])
  const booted = devices.filter(item => item.state === 'Booted')
  const device = selectTarget((requested || !booted.length ? devices : booted).map(item => item.udid), requested)
  if (devices.find(item => item.udid === device)?.state !== 'Booted') {
    if (ctx.phase !== 'prepare') {
      throw new Error(`iOS ${device} 已停止，需重新 prepare。`)
    }
    await command('xcrun', ['simctl', 'boot', device])
    process.stdout.write(`[preflight] 已安全启动 iOS Simulator ${device}\n`)
  }
  await command('xcrun', ['simctl', 'bootstatus', device, '-b'], ctx.phase === 'prepare' ? 90_000 : 15_000)
  const model = await command('xcrun', ['simctl', 'getenv', device, 'SIMULATOR_MODEL_IDENTIFIER'])
  const system = await command('xcrun', ['simctl', 'spawn', device, 'launchctl', 'print', 'system'])
  if (!system.includes('system')) {
    throw new Error('iOS 系统服务不可读取。')
  }
  const binding = { command: 'xcrun', device, version, model }
  if (ctx.phase === 'live') {
    return { detail: 'iOS Simulator 在线且系统服务可响应。', binding }
  }
  const screenshot = path.join(ctx.dir, 'ios.png')
  await command('xcrun', ['simctl', 'io', device, 'screenshot', '--type=png', screenshot])
  await assertImage(screenshot)
  return { detail: 'Xcode、iOS 启动、系统服务和截图通过。', binding, evidence: [screenshot] }
}

export async function harmony(ctx: ProbeContext): Promise<ProbeOutput> {
  const explicit = requestedTarget(['DEMO_VISUAL_HARMONY_HDC_PATH', 'E2E_HBUILDERX_HARMONY_HDC_PATH', 'HDC_PATH'])
  const tool = await executable(ctx.binding
    ? [ctx.binding.command]
    : explicit
      ? [explicit]
      : [
          'hdc',
          process.platform === 'darwin'
            ? path.join(path.parse(os.homedir()).root, 'Applications', 'DevEco-Studio.app', 'Contents', 'sdk', 'default', 'openharmony', 'toolchains', 'hdc')
            : undefined,
        ], ['version'])
  const device = selectTarget(parseHdcTargets(await command(tool.file, ['list', 'targets'])), ctx.binding?.device ?? requestedTarget(['E2E_HBUILDERX_HARMONY_DEVICE_ID', 'DEMO_VISUAL_HARMONY_DEVICE_ID', 'DEMO_VISUAL_HARMONY_SCREENSHOT_DEVICE_ID']))
  const args = ['-t', device]
  const shell = (...tail: string[]) => command(tool.file, [...args, 'shell', ...tail])
  const system = await shell('param', 'get', 'const.ohos.fullname')
  if (!system || /not found|fail|error/i.test(system)) {
    throw new Error(`Harmony 系统查询失败：${system}`)
  }
  const binding = { command: tool.file, version: tool.version, device, system }
  if (ctx.phase === 'live') {
    return { detail: 'Harmony 在线且 shell 可响应。', binding }
  }
  const remote = `/data/local/tmp/wt-preflight-${ctx.runId}`
  const layout = path.join(ctx.dir, 'harmony-ui.json')
  const screenshot = path.join(ctx.dir, 'harmony.png')
  let screenshotEvidence = screenshot
  try {
    await shell('uitest', 'dumpLayout', '-p', `${remote}.json`)
    await command(tool.file, [...args, 'file', 'recv', `${remote}.json`, layout])
    const tree = JSON.parse(await readFile(layout, 'utf8'))
    if (!tree || typeof tree !== 'object' || Object.keys(tree).length === 0) {
      throw new Error('Harmony UI 结构为空。')
    }
    try {
      await shell('uitest', 'screenCap', '-p', `${remote}.png`)
      await command(tool.file, [...args, 'file', 'recv', `${remote}.png`, screenshot])
      await access(screenshot)
      await assertImage(screenshot)
    }
    catch (screenCapError) {
      // 部分 DevEco 模拟器的 uitest screenCap 无法取得 pixelMap，使用系统截图接口保留同等设备证据。
      const fallbackRemote = `${remote}.jpeg`
      const fallbackScreenshot = path.join(ctx.dir, 'harmony.jpeg')
      try {
        await shell('snapshot_display', '-f', fallbackRemote)
        await command(tool.file, [...args, 'file', 'recv', fallbackRemote, fallbackScreenshot])
        await access(fallbackScreenshot)
        await assertImage(fallbackScreenshot)
        screenshotEvidence = fallbackScreenshot
      }
      catch (fallbackError) {
        throw new Error(`Harmony 截图失败：screenCap=${String(screenCapError)}；snapshot_display=${String(fallbackError)}`)
      }
    }
  }
  finally {
    await shell('rm', '-f', `${remote}.json`, `${remote}.png`, `${remote}.jpeg`)
  }
  return { detail: 'Harmony 系统查询、布局读取和截图通过。', binding, evidence: [layout, screenshotEvidence] }
}
