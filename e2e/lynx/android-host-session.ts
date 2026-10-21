import type { AndroidDevice } from './native-device'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execa } from 'execa'
import { runWithCleanup } from '../../scripts/e2e-preflight/cleanup'
import { EnvironmentBlockedError } from '../tailwind-capabilities/environment-block'
import { command } from './native-command'
import { adbArgs } from './native-device'

/** 只修改并恢复本轮设备的临时错误弹窗设置，不重置设备或应用数据。 */
export async function withAndroidHostSession<T>(hostDir: string, artifactDir: string, device: AndroidDevice, run: () => Promise<T>): Promise<T> {
  const hiddenErrorDialogs = (await command('adb', adbArgs(device, ['shell', 'settings', 'get', 'global', 'hide_error_dialogs']), hostDir, 30_000)).trim()
  return runWithCleanup(async () => {
    await command('adb', adbArgs(device, ['shell', 'settings', 'put', 'global', 'hide_error_dialogs', '1']), hostDir, 30_000)
    return await run()
  }, () => runWithCleanup(async () => {
    const result = await execa('adb', adbArgs(device, ['logcat', '-d', '-t', '2500']), { all: true, encoding: 'utf8', reject: false })
    await fs.writeFile(path.join(artifactDir, 'logcat.txt'), result.all ?? result.stdout ?? result.stderr ?? '')
    if (result.exitCode !== 0) {
      throw new Error('本轮 Android logcat 导出失败，保留命令输出')
    }
  }, async () => {
    const restoreArguments = hiddenErrorDialogs === 'null'
      ? ['shell', 'settings', 'delete', 'global', 'hide_error_dialogs']
      : ['shell', 'settings', 'put', 'global', 'hide_error_dialogs', hiddenErrorDialogs]
    try {
      await command('adb', adbArgs(device, restoreArguments), hostDir, 30_000)
    }
    catch (error) {
      throw new EnvironmentBlockedError('本轮 Android 错误弹窗设置恢复未确认', { cause: error })
    }
  }))
}
