import { execa } from 'execa'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { command } from './lynx/native-command'

vi.mock('execa', () => ({ execa: vi.fn(async () => ({ all: 'ok' })) }))
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('Lynx Gradle 的 Java 选择', () => {
  it('显式 JDK 同时约束 launcher 与 daemon，不受旧 Gradle 用户配置覆盖', async () => {
    vi.stubEnv('LYNX_GRADLE', 'selected-gradle')
    vi.stubEnv('LYNX_JAVA_HOME', '/selected/java')
    vi.stubEnv('JAVA_HOME', '/old/java')
    await command('selected-gradle', [':app:assembleDebug'], '/host')
    expect(execa).toHaveBeenCalledWith('selected-gradle', ['-Dorg.gradle.java.home=/selected/java', ':app:assembleDebug'], expect.objectContaining({ env: { JAVA_HOME: '/selected/java' }, cwd: '/host' }))
  })

  it('使用普通 JAVA_HOME 时也约束 Gradle daemon', async () => {
    vi.stubEnv('LYNX_GRADLE', undefined)
    vi.stubEnv('LYNX_JAVA_HOME', undefined)
    vi.stubEnv('JAVA_HOME', '/selected/java')
    await command('gradle', [':app:assembleDebug'], '/host')
    expect(execa).toHaveBeenCalledWith('gradle', ['-Dorg.gradle.java.home=/selected/java', ':app:assembleDebug'], expect.not.objectContaining({ env: expect.anything() }))
  })

  it('非 Gradle 命令不接收 Java 参数或环境覆盖', async () => {
    vi.stubEnv('LYNX_JAVA_HOME', '/selected/java')
    await command('pod', ['--version'], '/host')
    expect(execa).toHaveBeenCalledWith('pod', ['--version'], expect.not.objectContaining({ env: expect.anything() }))
  })
})
