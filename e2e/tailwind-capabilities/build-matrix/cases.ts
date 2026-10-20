import type { BuildOutputCase } from '../../multiplatform-build-output/types'
import type { RunContext } from '../context'
import type { ArtifactReceipt, CapabilityResult, CaseContract } from '../types'
import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { digest } from '../identity'
import { receipt } from '../report'

/** 登记条目没有构建器，不能把空命令和 package.json 当作样式产物。 */
export function documentedOnly(item: BuildOutputCase) {
  return item.command[0] === 'node' && item.command.includes('process.exit(0)')
}

function definition(item: BuildOutputCase) {
  return JSON.stringify(item, (_key, value: unknown) => value instanceof RegExp ? { source: value.source, flags: value.flags } : value)
}

export function buildMatrixContracts(cases: readonly BuildOutputCase[]): CaseContract[] {
  return cases.map(item => ({
    id: `matrix/${item.framework}/${item.platform}/${digest(definition(item)).slice(0, 16)}`,
    features: [`framework/${item.framework}`, `platform/${item.platform}`, 'pipeline/build-output'],
    candidate: item.styleContains.map(String).join(' '),
    fixture: definition(item),
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
export async function executeBuildMatrixCase(context: RunContext, item: BuildOutputCase, verify: (item: BuildOutputCase) => Promise<void>): Promise<{ result: CapabilityResult, artifacts: ArtifactReceipt[] }> {
  const contract = buildMatrixContracts([item])[0]!
  const base = { id: contract.id, support: 'supported' as const, warnings: [], assertions: [], artifacts: [] }
  if (documentedOnly(item)) {
    return { result: { ...base, status: 'not-run', reason: `已登记但尚无实际构建入口：${item.reason ?? item.name}` }, artifacts: [] }
  }
  const caseDirectory = path.join(context.directory, 'outputs', digest(contract.id).slice(0, 16))
  await mkdir(caseDirectory, { recursive: true })
  const log = path.join(caseDirectory, 'execution.json')
  try {
    await verify(item)
    const project = path.resolve(context.root, item.projectDir)
    const output = path.resolve(project, item.outputDir)
    const within = path.relative(project, output)
    if (!within || within === '..' || within.startsWith(`..${path.sep}`) || path.isAbsolute(within)) {
      throw new Error('实际构建输出必须位于项目的独立目录')
    }
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
    await writeFile(log, `${JSON.stringify({ runId: context.runId, id: contract.id, definition: item, assertions: '完整构建、样式、模板、分包和指令残留合同已通过', files: files.map(file => path.relative(output, file)) }, null, 2)}\n`)
    artifacts.push(await receipt(log, context.directory, context.runId, [contract.id], 'log'))
    return { result: { ...base, status: 'passed', assertions: [{ name: 'build-output-contract', stage: 'encoding', actual: true, expected: true }], artifacts: artifacts.map(artifact => artifact.path) }, artifacts }
  }
  catch (error) {
    await writeFile(log, `${JSON.stringify({ runId: context.runId, id: contract.id, failure: String(error) }, null, 2)}\n`)
    const artifact = await receipt(log, context.directory, context.runId, [contract.id], 'log')
    return { result: { ...base, status: 'failed', reason: String(error), artifacts: [artifact.path] }, artifacts: [artifact] }
  }
}
