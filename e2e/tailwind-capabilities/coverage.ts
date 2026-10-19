import type { CoverageIdentity } from '../coverageIdentity'
import type { CoverageCell, CoverageLayer, CoverageLayerContract } from '../coverageRegistry'
import type { CoverageArtifact, CoverageEvidence } from '../coverageReport'
import type { CapabilityIdentity, CapabilityReport, CaseContract, EvidenceStage, TailwindTarget } from './types'
import path from 'node:path'
import { jsonArray, writeJsonFile } from './json'
import { validateCapabilityReport, verifyReportArtifacts } from './report'

const layerStages: Partial<Record<CoverageLayer, EvidenceStage[]>> = {
  static: ['generation', 'encoding'],
  runtime: ['runtime'],
  hmr: ['hmr'],
  visual: ['visual'],
  negative: ['negative'],
}

function stages(contract: CaseContract) {
  return new Set([contract.expectation.stage, ...contract.requiredAssertions.map(name => contract.assertionStages?.[name] ?? contract.expectation.stage)])
}

function command(target: TailwindTarget) {
  return target.startsWith('web-') ? `pnpm e2e:tailwind:web:ci --engine ${target.slice(4)}` : `pnpm e2e:tailwind --target ${target}`
}

/** 每个案例显式保留能力、浏览器和层级；编译结果不能填充运行时或截图覆盖。 */
function* coverageCells(target: TailwindTarget, contracts: readonly CaseContract[]): Generator<CoverageCell> {
  for (const contract of contracts) {
    const required = stages(contract)
    const layers = Object.fromEntries(['static', 'dev', 'runtime', 'hmr', 'visual', 'negative'].map((name) => {
      const layer = name as CoverageLayer
      const applicable = layerStages[layer]?.some(stage => required.has(stage)) || (layer === 'negative' && contract.expectation.support === 'unsupported')
      return [layer, {
        status: applicable ? target === 'weapp' ? 'local-required' : 'ci-required' : 'not-applicable',
        executor: command(target),
        evidenceSchema: `tailwind-${layer}-v2`,
        ...(!applicable ? { reason: `该案例只声明 ${[...required].join('/')} 证据，没有 ${layer} 契约。` } : {}),
      } satisfies CoverageLayerContract]
    })) as Record<CoverageLayer, CoverageLayerContract>
    const browserEngine = /^(?:web|expo)-(chromium|firefox|webkit)$/.exec(target)?.[1] as CoverageCell['browserEngine']
    yield {
      id: `tailwind/${target}/${contract.id}`,
      source: 'tailwind',
      caseId: contract.id,
      capabilityIds: contract.features,
      ...(browserEngine ? { browserEngine } : {}),
      project: 'tailwind-capabilities',
      framework: target,
      builder: target === 'static' ? 'generator' : target.startsWith('web-') ? 'browser' : 'native-adapter',
      tailwindcss: 'v4',
      platform: target,
      runtime: target,
      renderMode: target.startsWith('web-') ? 'default' : 'native',
      subpackage: false,
      layers,
    }
  }
}

export function createTailwindCoverageCells(target: TailwindTarget, contracts: readonly CaseContract[]): CoverageCell[] {
  return [...coverageCells(target, contracts)]
}

interface CoverageOptions {
  expected: CapabilityIdentity
  runId: string
  target: TailwindTarget
  repositoryRoot: string
  artifactRoot: string
  coverageIdentity?: CoverageIdentity
}

/** 只有本轮语义协议和原始产物均有效时，才把对应层级转成覆盖证据。 */
async function prepareCoverage(report: CapabilityReport, contracts: readonly CaseContract[], options: CoverageOptions) {
  if (report.target !== options.target) {
    throw new Error('能力覆盖报告的目标平台或浏览器与本轮预期不一致')
  }
  validateCapabilityReport(report, contracts, options.expected, options.runId, options.target)
  await verifyReportArtifacts(report, options.artifactRoot)
  const results = new Map(report.results.map(result => [result.id, result]))
  const artifacts = new Map(report.artifacts.map((artifact, index) => [artifact.path, {
    index,
    manifest: {
      path: path.relative(options.repositoryRoot, path.resolve(options.artifactRoot, artifact.path)),
      sha256: artifact.sha256,
      kind: artifact.kind === 'screenshot' ? 'screenshot' : artifact.kind === 'bundle' ? 'bundle' : artifact.kind === 'log' ? 'log' : 'other',
    } satisfies CoverageArtifact,
  }]))
  const manifests = new WeakMap<string[], CoverageArtifact[]>()
  const registry = () => coverageCells(report.target, contracts)
  function* evidence(): Generator<CoverageEvidence> {
    for (const cell of registry()) {
      const result = results.get(cell.caseId!)!
      let manifest = manifests.get(result.artifacts)
      if (!manifest) {
        // 保留原报告中的产物顺序，并维持旧 filter 对重复引用的去重语义。
        manifest = [...new Set(result.artifacts)].flatMap(file => artifacts.get(file) ?? []).sort((left, right) => left.index - right.index).map(item => item.manifest)
        manifests.set(result.artifacts, manifest)
      }
      for (const [name, contract] of Object.entries(cell.layers)) {
        if (contract.status === 'not-applicable') {
          continue
        }
        const layer = name as CoverageLayer
        const assertions = result.assertions.filter(assertion => layerStages[layer]?.includes(assertion.stage)
          || (layer === 'negative' && result.support === 'unsupported'))
        const status = result.status === 'passed' && assertions.length ? result.support === 'unsupported' && layer === 'negative' ? 'unsupported' : 'passed' : result.status === 'passed' ? 'not-run' : result.status
        yield {
          cellId: cell.id,
          layer,
          status,
          executor: contract.executor,
          evidenceSchema: contract.evidenceSchema,
          ...((result.reason || status === 'not-run') ? { reason: result.reason ?? `缺少独立 ${layer} 断言，不能从其它层级推断。` } : {}),
          checkpoints: assertions.map(assertion => assertion.name),
          artifactManifest: manifest,
          environment: report.environment,
          ...(options.coverageIdentity ? { identity: options.coverageIdentity } : {}),
        } satisfies CoverageEvidence
      }
    }
  }
  return { registry, evidence }
}

export async function capabilityCoverageEvidence(report: CapabilityReport, contracts: readonly CaseContract[], options: CoverageOptions): Promise<CoverageEvidence[]> {
  return [...(await prepareCoverage(report, contracts, options)).evidence()]
}

/** 保留 v2 的逐例完整字段，以迭代器写入而不创建整份双重 registry/evidence 副本。 */
export async function writeCapabilityCoverage(file: string, report: CapabilityReport, contracts: readonly CaseContract[], options: CoverageOptions) {
  const prepared = await prepareCoverage(report, contracts, options)
  await writeJsonFile(file, { schemaVersion: 2, runId: report.runId, registry: jsonArray(prepared.registry()), evidence: jsonArray(prepared.evidence()) })
}
