import { execa } from 'execa'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { command } from './lynx/native-command'

vi.mock('execa', () => ({ execa: vi.fn(async () => ({ all: 'ok' })) }))
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})

describe('Lynx Gradle 的 Java 选择', () => {
  const javaHomes = ['/selected/java', '/Library/Java/虚拟机/Temurin 17/Contents/Home', String.raw`C:\Program Files\Java\Temurin 17 中文`]

  it.each(javaHomes)('显式 JDK %s 同时约束 launcher 与 daemon，不受旧 Gradle 用户配置覆盖', async (javaHome) => {
    vi.stubEnv('LYNX_GRADLE', 'selected-gradle')
    vi.stubEnv('LYNX_JAVA_HOME', javaHome)
    vi.stubEnv('JAVA_HOME', '/old/java')
    await command('selected-gradle', [':app:assembleDebug'], '/host')
    expect(execa).toHaveBeenCalledWith('selected-gradle', [`-Dorg.gradle.java.home=${javaHome}`, ':app:assembleDebug'], expect.objectContaining({ env: { JAVA_HOME: javaHome }, cwd: '/host' }))
  })

  it.each(javaHomes)('使用普通 JAVA_HOME %s 时也约束 Gradle daemon', async (javaHome) => {
    vi.stubEnv('LYNX_GRADLE', undefined)
    vi.stubEnv('LYNX_JAVA_HOME', undefined)
    vi.stubEnv('JAVA_HOME', javaHome)
    await command('gradle', [':app:assembleDebug'], '/host')
    expect(execa).toHaveBeenCalledWith('gradle', [`-Dorg.gradle.java.home=${javaHome}`, ':app:assembleDebug'], expect.not.objectContaining({ env: expect.anything() }))
  })

  it('非 Gradle 命令不接收 Java 参数或环境覆盖', async () => {
    vi.stubEnv('LYNX_JAVA_HOME', '/selected/java')
    await command('pod', ['--version'], '/host')
    expect(execa).toHaveBeenCalledWith('pod', ['--version'], expect.not.objectContaining({ env: expect.anything() }))
  })
})
