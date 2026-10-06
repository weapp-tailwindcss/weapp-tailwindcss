import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { posix } from 'node:path'
import process from 'node:process'

/** 每次采集独占一个 Android 设备文件，任何取证或清理失败都不能返回证据。 */
export async function readAndroidUiDump(adb: string, deviceArgs: string[], env: Record<string, string | undefined>) {
  // 这里是 Android shell 路径，与运行测试的 Windows/macOS/Linux 文件系统无关。
  const remoteFile = posix.join('/sdcard', `weapp-tailwindcss-ui-${randomUUID()}.xml`)
  const run = (args: string[]) => {
    const result = spawnSync(adb, [...deviceArgs, 'shell', ...args, remoteFile], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      killSignal: 'SIGTERM',
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    })
    if (result.error || result.status !== 0 || result.signal) {
      throw new Error([
        `Android UI ${args.join(' ')} 失败：${remoteFile}`,
        `device=${deviceArgs.join(' ') || 'default'} exit=${result.status} signal=${result.signal ?? 'none'}`,
        `stdout=${result.stdout ?? ''}`,
        `stderr=${result.stderr ?? ''}`,
        ...(result.error ? [`error=${result.error.message}`] : []),
      ].join('\n'), { cause: result.error })
    }
    return result.stdout
  }

  let capture: { value: string } | { error: unknown }
  try {
    run(['uiautomator', 'dump'])
    const xml = run(['cat'])
    if (!/^\s*(?:<\?xml[^?]*\?>\s*)?<hierarchy\b[^>]*>[\s\S]*<\/hierarchy>\s*$/.test(xml) || !/<node\b/.test(xml)) {
      throw new Error(`Android UI 层级为空或缺少完整 hierarchy/node：${remoteFile}\nstdout=${xml}`)
    }
    capture = { value: xml }
  }
  catch (error) {
    capture = { error }
  }
  try {
    run(['rm', '-f'])
  }
  catch (error) {
    if ('error' in capture) {
      throw new AggregateError([capture.error, error], `Android UI 采集与文件清理均失败：${remoteFile}`, { cause: capture.error })
    }
    throw error
  }
  if ('error' in capture) {
    throw capture.error
  }
  return capture.value
}
