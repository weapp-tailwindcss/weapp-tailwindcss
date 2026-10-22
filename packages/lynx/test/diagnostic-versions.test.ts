import { diagnosticVersions, installedEncoderVersion } from '../src/diagnostics/versions'

it('缺少项目根目录时保留 unknown 与缺证原因', async () => {
  const encoder = await installedEncoderVersion(undefined, {} as never)
  const report = diagnosticVersions({ targetSdkVersion: '3.9' }, encoder)
  expect(report.versions).toEqual({ encoder: 'unknown', engine: 'unknown', targetSdk: '3.9' })
  expect(report.versionEvidence.encoder).toContain('根目录')
  expect(report.versionEvidence.engine).toContain('宿主')
})

it('绑定模板类身份不符时不把另一副本的版本当作执行证据', async () => {
  const encoder = await installedEncoderVersion(import.meta.dirname, {} as never)
  expect(encoder.version).toBeUndefined()
  expect(encoder.source).toContain('身份不一致')
})

it('解析失败后的显式版本声明同时保留失败原因及声明来源', () => {
  const report = diagnosticVersions({ encoderVersion: 'declared', engineVersion: 'declared-host' }, { source: '模板身份未确认' })
  expect(report.versions.encoder).toBe('declared')
  expect(report.versionEvidence.encoder).toContain('模板身份未确认')
  expect(report.versionEvidence.encoder).toContain('显式声明')
  expect(report.versionEvidence.engine).toContain('仍须设备')
})
