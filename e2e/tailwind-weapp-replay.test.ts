import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { validateCapabilityReport, verifyReportArtifacts } from './tailwind-capabilities/report'
import { weappProbes } from './tailwind-capabilities/weapp/fixtures'
import { editWeappFixtureImage, resignWeappFixture, weappReplayFixture } from './tailwind-capabilities/weapp/test-fixture'

const directories: string[] = []
afterEach(async () => Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))))
async function fixture(id = 'runtime-color-weight-limit') {
  const directory = await mkdtemp(path.join(tmpdir(), 'weapp-replay-'))
  directories.push(directory)
  const data = await weappReplayFixture(directory, weappProbes.find(probe => probe.id === id)!)
  return { directory, ...data }
}

it('合成正向与负向完整协议可重放，合成图不登记为真实运行', async () => {
  for (const id of ['width-arbitrary', 'alpha-half', 'alpha-dynamic-class', 'runtime-color-weight-limit']) {
    const { directory, report, contract } = await fixture(id)
    validateCapabilityReport(report, [contract], report.identity, report.runId, 'weapp')
    await expect(verifyReportArtifacts(report, directory)).resolves.toBeUndefined()
  }
})

it('非像素案例也必须保留完整目标、参考和标记几何', async () => {
  const { directory, report, sidecar } = await fixture('width-arbitrary')
  Reflect.deleteProperty(sidecar.phases[0]!.rectangles, 'probe')
  await writeFile(path.join(directory, 'width-arbitrary.json'), JSON.stringify(sidecar))
  await resignWeappFixture(report, directory)
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow()
})

it('before 和 restored 颜色相同仍不能交换本轮阶段图', async () => {
  const { directory, report } = await fixture()
  for (const suffix of ['', '.full.png', '.viewport.json']) {
    const prefix = path.join(directory, 'runtime-color-weight-limit-')
    await writeFile(`${prefix}restored.png${suffix}`, await readFile(`${prefix}before.png${suffix}`))
  }
  await resignWeappFixture(report, directory)
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow()
})

it('错误截图重新签名后仍拒绝，不能只看节点和摘要', async () => {
  const { directory, report } = await fixture()
  await editWeappFixtureImage(path.join(directory, 'runtime-color-weight-limit-after.png'), image => image.data.fill(255))
  await resignWeappFixture(report, directory)
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow()
})

it.each(['missing-restored', 'old-run', 'wrong-witness', 'swapped-phases', 'wrong-source'] as const)('拒绝被重新签名的 %s', async (mode) => {
  const { directory, report, sidecar } = await fixture()
  if (mode === 'missing-restored') {
    sidecar.phases.pop()
  }
  if (mode === 'old-run') {
    sidecar.runId = 'old-run'
  }
  if (mode === 'wrong-witness') {
    sidecar.phases[1]!.witness['opacity'] = '0.5'
  }
  if (mode === 'swapped-phases') {
    [sidecar.phases[0], sidecar.phases[1]] = [sidecar.phases[1]!, sidecar.phases[0]!]
  }
  if (mode === 'wrong-source') {
    await writeFile(path.join(directory, 'project', 'pages', 'index', 'index.js'), 'Page({})')
  }
  await writeFile(path.join(directory, 'runtime-color-weight-limit.json'), JSON.stringify(sidecar))
  await resignWeappFixture(report, directory)
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow()
})

it('前后阶段旧图互换并重新签名仍拒绝', async () => {
  const { directory, report } = await fixture()
  for (const suffix of ['', '.full.png', '.viewport.json']) {
    const prefix = path.join(directory, 'runtime-color-weight-limit-')
    await writeFile(`${prefix}after.png${suffix}`, await readFile(`${prefix}before.png${suffix}`))
  }
  await resignWeappFixture(report, directory)
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow()
})

it('双方同错的颜色即使重新裁剪并签名也拒绝', async () => {
  const { directory, report } = await fixture('alpha-half')
  for (const [name, offset] of [['alpha-half-default.png', 0], ['alpha-half-default.png.full.png', 20]] as const) {
    await editWeappFixtureImage(path.join(directory, name), (image) => {
      for (const top of [60, 130]) {
        for (let y = top + offset; y < top + offset + 48; y++) {
          for (let x = 10; x < 90; x++) {
            image.data.set([0, 0, 0, 255], (y * image.width + x) * 4)
          }
        }
      }
    })
  }
  await resignWeappFixture(report, directory)
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow()
})

it('缺少原始 PNG 回执不能用孤立裁剪图通过', async () => {
  const { directory, report } = await fixture('alpha-half')
  report.artifacts = report.artifacts.filter(item => !item.path.endsWith('.full.png'))
  report.results[0]!.artifacts = report.results[0]!.artifacts.filter(name => !name.endsWith('.full.png'))
  await expect(verifyReportArtifacts(report, directory)).rejects.toThrow()
})
