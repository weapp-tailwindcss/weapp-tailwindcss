import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { archiveRuntimeDiagnostics, createRuntimeArtifacts, runtimeArtifactIdentity } from './react-native/runtime-artifacts'
import { stageBindingVariable } from './tailwind-capabilities/stage-receipt'

const directories: string[] = []
afterEach(async () => {
  vi.unstubAllEnvs()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'runtime-diagnostic-archive-'))
  directories.push(root)
  const identity = { version: 1 as const, runId: 'startup-failed', target: 'react-native-ios', producer: 'react-native' as const, invocationId: 'a'.repeat(36) }
  const source = path.join(root, 'published')
  const destination = path.join(root, 'run', 'native')
  const session = await createRuntimeArtifacts(source, identity)
  directories.push(session.directory)
  await writeFile(path.join(session.directory, 'expo-run.log'), 'pod install failed before runtime')
  await session.publish()
  return { identity, source, destination }
}
it('没有运行时报告仍归档当次启动失败诊断，发布后临时目录已移除', async () => {
  const { identity, source, destination } = await fixture()
  await archiveRuntimeDiagnostics(source, destination, identity)
  expect(await readFile(path.join(destination, 'expo-run.log'), 'utf8')).toBe('pod install failed before runtime')
  await expect(access(path.join(destination, 'report.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(archiveRuntimeDiagnostics(source, destination, identity)).rejects.toMatchObject({ code: 'ERR_FS_CP_EEXIST' })
})
it.each(['runId', 'target', 'producer', 'invocationId', 'version', 'missing'] as const)('拒绝%s不符的旧诊断，不创建本轮归档', async (field) => {
  const { identity, source, destination } = await fixture()
  const file = path.join(source, 'runtime-session.json')
  if (field === 'missing') {
    await rm(file)
  }
  else {
    await writeFile(file, JSON.stringify({ ...identity, [field]: field === 'version' ? 0 : 'old' }))
  }
  await expect(archiveRuntimeDiagnostics(source, destination, identity)).rejects.toThrow()
  await expect(access(destination)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('生产入口必须消费父进程指定的同次调用，独立执行拥有新身份', () => {
  vi.stubEnv(stageBindingVariable, '')
  const local = runtimeArtifactIdentity('react-native', 'react-native-ios', 'fresh')
  expect(runtimeArtifactIdentity('react-native', 'react-native-ios', 'fresh').invocationId).not.toBe(local.invocationId)
  const binding = { ...local, file: path.resolve('stage-receipt.json') }
  vi.stubEnv(stageBindingVariable, JSON.stringify(binding))
  expect(runtimeArtifactIdentity('react-native', 'react-native-ios', 'fresh')).toEqual(local)
  expect(() => runtimeArtifactIdentity('expo-web', 'expo-webkit', 'fresh')).toThrow('生产者')
  expect(() => runtimeArtifactIdentity('react-native', 'react-native-android', 'fresh')).toThrow('身份')
  expect(() => runtimeArtifactIdentity('react-native', 'react-native-ios', 'stale')).toThrow('身份')
})
