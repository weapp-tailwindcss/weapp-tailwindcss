import type { ReactNativeReport } from './react-native/catalog'
import type { NativeRuntimePhase } from './react-native/phase-contract'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { getManifestPathsForProjectRoot } from '../packages/react-native/src/metro'
import { nativeRuntimePhases } from './react-native/phase-contract'
import { captureNativePhase, validateNativeRuntimePhases } from './react-native/phase-evidence'
import { writeNativePhaseFixture } from './react-native/phase-fixture'
import { nativePhaseDirectory, phaseArtifactDefinitions } from './react-native/phase-index'
import { writeRuntimeFixture } from './react-native/runtime-fixture'

const directories: string[] = []
const publicationFiles: string[] = []
afterEach(async () => {
  await Promise.all(publicationFiles.splice(0).map(file => rm(file, { force: true })))
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

async function fixture() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rn-phase-capture-'))
  directories.push(directory)
  const original = path.join(directory, 'original')
  const destination = path.join(directory, 'captured')
  const projectRoot = path.join(directory, 'project')
  const report = await writeRuntimeFixture(original, 'web', 'capture-current-run', new Date().toISOString())
  await writeNativePhaseFixture(original, report)
  await mkdir(destination)
  await mkdir(path.join(projectRoot, 'src', 'compatibility'), { recursive: true })
  const publication = getManifestPathsForProjectRoot(projectRoot)
  publicationFiles.push(publication.manifestPath, publication.manifestReadyPath)
  await mkdir(path.dirname(publication.manifestPath), { recursive: true })
  const publish = async (phase: NativeRuntimePhase) => {
    const source = nativePhaseDirectory(original, phase)
    const raw = JSON.parse(await readFile(path.join(source, 'report.json'), 'utf8')) as ReactNativeReport
    for (const saved of raw.receipts) {
      for (const name of [saved.artifact.name, `${saved.artifact.name}.json`]) {
        await copyFile(path.join(original, name), path.join(destination, name))
      }
    }
    for (const [from, to] of [
      [path.join(source, 'sources', 'global.css'), path.join(projectRoot, 'global.css')],
      [path.join(source, 'sources', 'hmr-marker.ts'), path.join(projectRoot, 'src', 'hmr-marker.ts')],
      [path.join(source, 'sources', 'virtual.js'), path.join(projectRoot, 'virtual.js')],
      [path.join(source, 'encoding', 'tailwind-input.cjs'), path.join(projectRoot, 'tailwind-input.cjs')],
      [path.join(source, 'encoding', 'static-evidence.json'), path.join(projectRoot, 'src', 'compatibility', 'static-evidence.json')],
      [path.join(source, 'encoding', 'manifest.json'), publication.manifestPath],
    ] as const) {
      await copyFile(from, to)
    }
    await writeFile(publication.manifestReadyPath, JSON.stringify({ revision: `synthetic-publication-${phase.id}`, virtualPath: path.join(projectRoot, 'virtual.js') }))
    return raw
  }
  return { original, destination, projectRoot, report, publish, publication }
}

it('真实文件捕获为三阶段独立归档，重复捕获被拒绝且前阶段字节保持不变', async () => {
  const { destination, projectRoot, report, publish } = await fixture()
  const first = await publish(nativeRuntimePhases[0])
  await captureNativePhase(projectRoot, destination, first)
  const firstRoot = nativePhaseDirectory(destination, nativeRuntimePhases[0])
  const before = await Promise.all(phaseArtifactDefinitions.map(item => readFile(path.join(firstRoot, ...item.segments))))
  await expect(captureNativePhase(projectRoot, destination, first)).rejects.toThrow('阶段重复')
  for (const phase of nativeRuntimePhases.slice(1)) {
    await captureNativePhase(projectRoot, destination, await publish(phase))
  }
  const after = await Promise.all(phaseArtifactDefinitions.map(item => readFile(path.join(firstRoot, ...item.segments))))
  expect(after).toEqual(before)
  await expect(validateNativeRuntimePhases(report, destination)).resolves.toMatchObject({ phases: [{ report: { revision: nativeRuntimePhases[0].revision } }, { report: { revision: nativeRuntimePhases[1].revision } }, { report: { revision: nativeRuntimePhases[2].revision } }] })
})

it('不能从 TSX 或 CSS HMR 跳过 baseline 开始，也不能以任意 revision 构造归档路径', async () => {
  const { destination, projectRoot, report } = await fixture()
  await expect(captureNativePhase(projectRoot, destination, report)).rejects.toThrow('阶段重复或顺序错误')
  await expect(captureNativePhase(projectRoot, destination, { ...report, revision: '../../escape' })).rejects.toThrow('未登记')
})

it('ready 指向项目边界外的虚拟 JS 时停止捕获，不读取无关文件', async () => {
  const { destination, projectRoot, publish, publication } = await fixture()
  const report = await publish(nativeRuntimePhases[0])
  await writeFile(publication.manifestReadyPath, JSON.stringify({ revision: 'synthetic-publication', virtualPath: path.resolve(projectRoot, '..', 'unrelated.js') }))
  await expect(captureNativePhase(projectRoot, destination, report)).rejects.toThrow('项目边界')
})

it.each(['../outside.js', '..\\outside.js', 'C:\\outside\\virtual.js', 'C:relative\\virtual.js', '/outside.js'])('拒绝相对路径、根目录或其它盘符的虚拟模块来源 %s', async (virtualPath) => {
  const { destination, projectRoot, publish, publication } = await fixture()
  const report = await publish(nativeRuntimePhases[0])
  await writeFile(publication.manifestReadyPath, JSON.stringify({ revision: 'synthetic-publication', virtualPath }))
  await expect(captureNativePhase(projectRoot, destination, report)).rejects.toThrow(/绝对路径|项目边界/)
})
