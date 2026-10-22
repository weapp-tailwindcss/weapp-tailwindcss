import { execa } from 'execa'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { androidExpoDevice } from './react-native/android-device'
import { EnvironmentBlockedError } from './tailwind-capabilities/environment-block'

vi.mock('execa', () => ({ execa: vi.fn() }))

const run = vi.mocked(execa)
beforeEach(() => vi.resetAllMocks())

describe('Expo 与 adb 设备身份一致', () => {
  it('设备消失时保留命令诊断并以结构化环境故障停止', async () => {
    const result = { exitCode: 1, stdout: '', stderr: 'opaque adb diagnostic' }
    run.mockResolvedValue(result as never)
    await expect(androidExpoDevice('selected-serial')).rejects.toMatchObject({ name: 'EnvironmentBlockedError', cause: result })
    const primary = new Error('opaque process failure')
    run.mockRejectedValueOnce(primary)
    await expect(androidExpoDevice('selected-serial')).rejects.toBeInstanceOf(EnvironmentBlockedError)
  })
  it.each(['', 'Selected_AVD', 'selected-serial'])('从绑定设备解析 AVD，兼容相同配置 %s', async (configured) => {
    run.mockResolvedValue({ exitCode: 0, stdout: 'Selected_AVD\r\nOK\r\n' } as never)
    await expect(androidExpoDevice('selected-serial', configured)).resolves.toBe('Selected_AVD')
    expect(run).toHaveBeenCalledWith('adb', ['-s', 'selected-serial', 'emu', 'avd', 'name'], { reject: false, timeout: 30_000 })
  })

  it('旧 AVD 配置不能把 Expo 安装到另一台设备', async () => {
    run.mockResolvedValue({ exitCode: 0, stdout: 'Selected_AVD\nOK' } as never)
    await expect(androidExpoDevice('selected-serial', 'Other_AVD')).rejects.toThrow('存在歧义')
  })

  it.each([{ exitCode: 1, stdout: 'Selected_AVD' }, { exitCode: 0, stdout: 'OK\n' }])('无法验证 AVD 时不使用配置绕过：%j', async (result) => {
    run.mockResolvedValue(result as never)
    await expect(androidExpoDevice('selected-serial', 'Selected_AVD')).rejects.toThrow('无法确认')
  })
})
