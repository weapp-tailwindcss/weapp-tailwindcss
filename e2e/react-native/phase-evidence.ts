import type { ReactNativeReport } from './catalog'
import type { NativePhaseIndex } from './phase-index'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { captureNativeEncoding, validateNativeEncodingArtifacts } from './encoding-evidence'
import { validateNativeArtifacts } from './pair-evidence'
import { nativeEncodingArtifactNames, nativePhaseForRevision, nativeRuntimePhases } from './phase-contract'
import { createNativePhaseIndex, nativePhaseDirectory, phaseArtifactDefinitions, phaseIndexName, snapshotNativePhase, validateNativePhaseIndex } from './phase-index'
import { captureNativePhaseSources, validateNativePhaseSources } from './phase-sources'
import { validateReactNativeReport } from './reports'

/** 每阶段只写一次固定目录；根目录的兼容入口允许跟随最新阶段更新。 */
export async function captureNativePhase(projectRoot: string, directory: string, report: ReactNativeReport) {
  const phase = nativePhaseForRevision(report.revision)
  const indexFile = path.join(directory, phaseIndexName)
  const index = await readFile(indexFile, 'utf8').then(source => JSON.parse(source) as NativePhaseIndex).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }
    return createNativePhaseIndex(report)
  })
  validateNativePhaseIndex(index, report, false)
  if (nativeRuntimePhases[index.phases.length]?.id !== phase.id) {
    throw new Error(`React Native 阶段重复或顺序错误：${phase.id}`)
  }
  validateReactNativeReport(report, report.platform, { runId: index.runId, revision: phase.revision })
  await validateNativeArtifacts(report, directory)
  await mkdir(path.join(directory, 'phases'), { recursive: true })
  const destination = nativePhaseDirectory(directory, phase)
  await mkdir(destination)
  await writeFile(path.join(destination, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' })
  await captureNativeEncoding(projectRoot, destination, report)
  await captureNativePhaseSources(projectRoot, destination)
  const entry = await snapshotNativePhase(directory, phase)
  await validateNativePhaseSources(destination, entry, phase)
  index.phases.push(entry)
  await writeFile(indexFile, `${JSON.stringify(index, null, 2)}\n`)
  await mkdir(path.join(directory, 'encoding'), { recursive: true })
  for (const name of nativeEncodingArtifactNames) {
    await copyFile(path.join(destination, 'encoding', name), path.join(directory, 'encoding', name))
  }
  await copyFile(path.join(destination, 'report.json'), path.join(directory, 'report.json'))
}

/** 逐阶段离线回放报告、原始截图、编码与源码，后续报告不能代替前两阶段。 */
export async function validateNativeRuntimePhases(finalReport: ReactNativeReport, directory: string) {
  const indexFile = path.join(directory, phaseIndexName)
  const index = validateNativePhaseIndex(JSON.parse(await readFile(indexFile, 'utf8')), finalReport)
  const phases: Array<{ report: ReactNativeReport, reportFile: string, encodingFiles: string[], sourceFiles: string[] }> = []
  for (const [position, phase] of nativeRuntimePhases.entries()) {
    const root = nativePhaseDirectory(directory, phase)
    const entry = index.phases[position]!
    if (!isDeepStrictEqual(await snapshotNativePhase(directory, phase), entry)) {
      throw new Error(`React Native 阶段原始产物摘要或来源不符：${phase.id}`)
    }
    const reportFile = path.join(root, 'report.json')
    const report = JSON.parse(await readFile(reportFile, 'utf8')) as ReactNativeReport
    validateReactNativeReport(report, finalReport.platform, { runId: finalReport.runId, revision: phase.revision })
    if (report.environment.browser?.name !== finalReport.environment.browser?.name) {
      throw new Error(`React Native 阶段浏览器身份不符：${phase.id}`)
    }
    await validateNativeArtifacts(report, directory)
    const encodingFiles = await validateNativeEncodingArtifacts(report, root)
    await validateNativePhaseSources(root, entry, phase)
    phases.push({ report, reportFile, encodingFiles, sourceFiles: phaseArtifactDefinitions.filter(item => item.name.startsWith('source:')).map(item => path.join(root, ...item.segments)) })
  }
  const final = phases[phases.length - 1]!
  if (!isDeepStrictEqual(final.report, finalReport)) {
    throw new Error('React Native 最后阶段归档原始 JSON 与本轮最终报告不一致')
  }
  const compatibilityFiles = await validateNativeEncodingArtifacts(finalReport, directory)
  for (const [position, file] of compatibilityFiles.entries()) {
    if (!(await readFile(file)).equals(await readFile(final.encodingFiles[position]!))) {
      throw new Error('React Native 最终 encoding 兼容入口与最后阶段归档不一致')
    }
  }
  return { indexFile, phases, compatibilityFiles }
}
