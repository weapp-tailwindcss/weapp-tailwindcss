import type { MiniProgramCase } from '../../hbuilderx-local/cases'
import type { BuildOutputCase } from '../../multiplatform-build-output/types'
import path from 'node:path'
import { miniProgramCases } from '../../hbuilderx-local/cases'
import { compileMiniProgramWithHBuilderX } from '../../hbuilderx-local/mini-compile'
import { rawTailwindDirectiveRE } from '../../multiplatform-build-output/helpers'
import { assertBuildOutputCase, verifyBuildOutputCase } from '../../multiplatform-build-output/runner'
import { EnvironmentBlockedError } from '../environment-block'
import { processEnvironmentFailure } from '../stage-receipt'

export type BuildMatrixCase = BuildOutputCase & { provider?: { kind: 'command' | 'documented' } | { kind: 'hbuilderx-mini', fixture: MiniProgramCase } }
export interface VerifiedBuild {
  outputRoot: string
  provider: string
  versions?: Record<string, string>
}

function placeholder(item: BuildOutputCase) {
  return item.command[0] === 'node' && item.command.includes('process.exit(0)')
}

function relocate(file: string, from: string, to: string) {
  const relative = path.relative(path.resolve(from), path.resolve(file))
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`构建断言路径不属于原输出根：${file}`)
  }
  return path.join(to, relative)
}

export function relocateBuildOutput(item: BuildOutputCase, outputDir: string): BuildOutputCase {
  const move = (file: string) => relocate(file, item.outputDir, outputDir)
  return { ...item, outputDir, requiredFiles: item.requiredFiles.map(move), styleFiles: item.styleFiles.map(move), ...(item.textFiles ? { textFiles: item.textFiles.map(move) } : {}), ...(item.fileAssertions ? { fileAssertions: item.fileAssertions.map(entry => ({ ...entry, file: move(entry.file) })) } : {}) }
}

function hbuilderxCase(fixture: MiniProgramCase, framework: BuildOutputCase['framework'], original?: BuildOutputCase): BuildMatrixCase {
  const legacy = original && !placeholder(original) ? relocateBuildOutput(original, fixture.outputDir) : undefined
  return {
    ...legacy,
    name: `${fixture.name} [HBuilderX IDE]`,
    framework,
    projectDir: fixture.projectDir,
    platform: fixture.platform,
    command: [],
    outputDir: fixture.outputDir,
    requiredFiles: [...new Set([...fixture.requiredFiles.map(file => path.join(fixture.outputDir, file)), ...legacy?.requiredFiles ?? []])],
    styleFiles: [fixture.outputDir],
    styleFileExtensions: fixture.cssExtensions,
    styleContains: legacy?.styleContains ?? [],
    notContains: [...legacy?.notContains ?? [], rawTailwindDirectiveRE],
    forbidEmptyBlockAtRules: true,
    verifySourceFixtures: legacy?.verifySourceFixtures ?? false,
    status: 'local',
    reason: '通过已绑定的 HBuilderX IDE 编译，保留 CLI 场景为独立入口；仅证明构建产物。',
    provider: { kind: 'hbuilderx-mini', fixture },
  }
}

/** 占位条目只在唯一匹配真实IDE夹具时接入；现有CLI覆盖保持独立。 */
export function resolveBuildMatrixCases(source: readonly BuildOutputCase[], fixtures: readonly MiniProgramCase[] = miniProgramCases): BuildMatrixCase[] {
  const key = (item: Pick<BuildOutputCase, 'projectDir' | 'platform'>) => JSON.stringify([path.normalize(item.projectDir), item.platform])
  const registered = new Map<string, MiniProgramCase>()
  const names = new Set<string>()
  for (const fixture of fixtures) {
    if (registered.has(key(fixture)) || names.has(fixture.name)) {
      throw new Error(`HBuilderX 夹具身份不唯一：${fixture.name}`)
    }
    registered.set(key(fixture), fixture)
    names.add(fixture.name)
  }
  const consumed = new Set<string>()
  const cases = source.map((item): BuildMatrixCase => {
    const fixture = registered.get(key(item))
    if (placeholder(item) && fixture) {
      if (consumed.has(key(item))) {
        throw new Error(`HBuilderX 原矩阵合同不唯一：${fixture.name}`)
      }
      consumed.add(key(item))
      return hbuilderxCase(fixture, item.framework, item)
    }
    return { ...item, provider: { kind: placeholder(item) ? 'documented' : 'command' } }
  })
  for (const fixture of fixtures) {
    if (!consumed.has(key(fixture))) {
      const originals = source.filter(item => key(item) === key(fixture))
      if (originals.length > 1) {
        throw new Error(`HBuilderX 原矩阵合同不唯一：${fixture.name}`)
      }
      const framework = source.find(item => path.normalize(item.projectDir) === path.normalize(fixture.projectDir))?.framework
      if (!framework) {
        throw new Error(`HBuilderX 项目未登记框架身份：${fixture.name}`)
      }
      cases.push(hbuilderxCase(fixture, framework, originals[0]))
    }
  }
  return cases
}

export function selectBuildMatrixCases(cases: readonly BuildMatrixCase[], filter?: string, status = 'all') {
  const pattern = filter ? new RegExp(filter) : undefined
  return cases.filter(item => (status === 'all' || item.status === status) && (!pattern || [item.name, item.projectDir, item.platform].some(value => pattern.test(value))))
}

/** 归档与补充断言始终使用IDE返回的同一个已验证目录，不执行CLI兜底。 */
export async function verifyMatrixProvider(item: BuildMatrixCase, root: string): Promise<VerifiedBuild> {
  if (item.provider?.kind === 'hbuilderx-mini') {
    if (path.resolve(root, item.provider.fixture.projectDir) !== path.resolve(root, item.projectDir) || item.provider.fixture.platform !== item.platform) {
      throw new Error('HBuilderX provider 与矩阵项目或平台身份不符')
    }
    const verified = await compileMiniProgramWithHBuilderX(item.provider.fixture, root)
    const projectRoot = path.resolve(root, item.projectDir)
    const relocated = relocateBuildOutput(item, path.relative(projectRoot, verified.outputRoot))
    await assertBuildOutputCase(relocated, projectRoot)
    return verified
  }
  if (item.provider?.kind === 'documented') {
    throw new Error('未接入条目不能调用构建器')
  }
  try {
    return await verifyBuildOutputCase(item)
  }
  catch (error) {
    const reason = processEnvironmentFailure(error)
    if (reason) {
      throw new EnvironmentBlockedError(reason, { cause: error })
    }
    throw error
  }
}

/** 合同和报告共用同一序列化，正则、provider及完整IDE夹具均参与fixtureHash。 */
export function buildMatrixDefinition(item: BuildMatrixCase) {
  return JSON.stringify(item, (_key, value: unknown) => value instanceof RegExp ? { source: value.source, flags: value.flags } : value)
}

export function buildMatrixFixtures(cases: readonly BuildMatrixCase[]) {
  return cases.map(buildMatrixDefinition)
}
