import type { RunContext } from '../context'
import type { ArtifactReceipt, CapabilityResult, CaseContract } from '../types'
import type { BuildMatrixCase, VerifiedBuild } from './providers'
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { formatWorkflowError, runWithCleanup } from '../../../scripts/e2e-preflight/cleanup'
import { assertOutputOwnership } from '../../hbuilderx-local/output-ownership'
import { findEnvironmentBlock } from '../environment-block'
import { digest } from '../identity'
import { receipt } from '../report'
import { buildMatrixDefinition } from './providers'

export interface MatrixObservation { result: CapabilityResult, artifacts: ArtifactReceipt[], versions?: Record<string, string> }

/** 登记条目没有构建器，不能把空命令和 package.json 当作样式产物。 */
export function documentedOnly(item: BuildMatrixCase) {
  return item.provider ? item.provider.kind === 'documented' : item.command[0] === 'node' && item.command.includes('process.exit(0)')
}

export function buildMatrixContracts(cases: readonly BuildMatrixCase[]): CaseContract[] {
  return cases.map(item => ({
    id: `matrix/${item.framework}/${item.platform}/${digest(buildMatrixDefinition(item)).slice(0, 16)}`,
    features: [`framework/${item.framework}`, `platform/${item.platform}`, 'pipeline/build-output'],
    candidate: item.styleContains.map(String).join(' '),
    fixture: buildMatrixDefinition(item),
    expectation: { support: 'supported', stage: 'encoding' },
    requiredAssertions: ['build-output-contract'],
    expectedValues: { 'build-output-contract': true },
  }))
}

async function outputFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) {
      throw new Error('构建证据不允许符号链接')
    }
    return entry.isDirectory() ? outputFiles(file) : [file]
  }))
  return nested.flat().sort()
}

/** 必须先完成既有的完整样式/模板断言，再保存本轮产物；后续同项目构建不能改写证据。 */
export async function executeBuildMatrixCase(context: RunContext, item: BuildMatrixCase, verify: (item: BuildMatrixCase) => Promise<VerifiedBuild | void>, recordBlocked?: (observed: MatrixObservation) => void): Promise<MatrixObservation> {
  const contract = buildMatrixContracts([item])[0]!
  const base = { id: contract.id, support: 'supported' as const, warnings: [], assertions: [], artifacts: [] }
  if (documentedOnly(item)) {
    return { result: { ...base, status: 'not-run', reason: `已登记但尚无实际构建入口：${item.reason ?? item.name}` }, artifacts: [] }
  }
  const caseDirectory = path.join(context.directory, 'outputs', digest(contract.id).slice(0, 16))
  await mkdir(caseDirectory, { recursive: true })
  const log = path.join(caseDirectory, 'execution.json')
  try {
    const verified = await verify(item)
    if (item.provider && !verified) {
      throw new Error('构建provider没有交付已验证输出根')
    }
    if (verified && !path.isAbsolute(verified.outputRoot)) {
      throw new Error('构建provider必须交付绝对输出根')
    }
    const project = path.resolve(context.root, item.projectDir)
    const output = await assertOutputOwnership(project, verified?.outputRoot ?? path.resolve(project, item.outputDir))
    const files = await outputFiles(output)
    const styles = files.filter(file => /\.(?:css|wxss|acss|jxss|qss|ttss)$/i.test(file))
    if (!styles.length || !(await Promise.all(styles.map(file => stat(file)))).some(value => value.size > 0)) {
      throw new Error('实际构建缺少非空样式产物')
    }
    const artifacts: ArtifactReceipt[] = []
    for (const file of files) {
      const destination = path.join(caseDirectory, 'bundle', path.relative(output, file))
      await mkdir(path.dirname(destination), { recursive: true })
      await copyFile(file, destination)
      // 空文件仍留在原始 bundle 中，但不能作为有效证据回执。
      if ((await stat(destination)).size > 0) {
        artifacts.push(await receipt(destination, context.directory, context.runId, [contract.id], styles.includes(file) ? 'css' : 'bundle'))
      }
    }
    await writeFile(log, `${JSON.stringify({ runId: context.runId, id: contract.id, definition: buildMatrixDefinition(item), verified, outputRoot: output, assertions: '完整构建、样式、模板、分包和指令残留合同已通过', files: files.map(file => path.relative(output, file)) }, null, 2)}\n`)
    artifacts.push(await receipt(log, context.directory, context.runId, [contract.id], 'log'))
    return { result: { ...base, status: 'passed', assertions: [{ name: 'build-output-contract', stage: 'encoding', actual: true, expected: true }], artifacts: artifacts.map(artifact => artifact.path) }, artifacts, ...(verified?.versions ? { versions: verified.versions } : {}) }
  }
  catch (error) {
    const blocker = findEnvironmentBlock(error)
    await runWithCleanup(async () => {
      throw error
    }, async () => {
      await writeFile(log, `${JSON.stringify({ runId: context.runId, id: contract.id, failure: formatWorkflowError(error) }, null, 2)}\n`)
      if (blocker) {
        const artifact = await receipt(log, context.directory, context.runId, [contract.id], 'log')
        recordBlocked?.({ result: { ...base, status: 'blocked', reason: blocker.message, artifacts: [artifact.path] }, artifacts: [artifact] })
      }
    }).catch((failure: unknown) => {
      if (failure !== error || blocker) {
        throw failure
      }
    })
    const artifact = await receipt(log, context.directory, context.runId, [contract.id], 'log')
    return { result: { ...base, status: 'failed', reason: String(error), artifacts: [artifact.path] }, artifacts: [artifact] }
  }
}
