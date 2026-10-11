import process from 'node:process'
import { execa } from 'execa'

/** Expo 使用的 AVD 名称必须来自已经选定的 adb 设备。 */
export async function androidExpoDevice(device: string, configured = process.env['RN_ANDROID_EXPO_DEVICE']) {
  const result = await execa('adb', ['-s', device, 'emu', 'avd', 'name'], { reject: false, timeout: 30_000 })
  const avdName = result.stdout
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => line && line !== 'OK')
  if (result.exitCode !== 0 || !avdName) {
    throw new Error(`无法确认 ${device} 对应的 Expo AVD 名称，不能使用未经验证的 RN_ANDROID_EXPO_DEVICE。`)
  }
  if (configured && configured !== avdName && configured !== device) {
    throw new Error(`RN_ANDROID_EXPO_DEVICE 与选定设备存在歧义：${configured} / ${device} (${avdName})`)
  }
  return avdName
}
