import type { CompatibilityCase } from '@weapp-tailwindcss/test-catalog'
import type { DemoCoverageStatus, DemoPlatformCoverage } from './demoCoverageMatrix'
import { officialFeatureManifest } from '@weapp-tailwindcss/test-catalog'
import { compatibilityCases as lynxCases } from '../examples/react-lynx/src/compatibility/catalog'
import { evidenceSequence } from '../examples/react-lynx/src/compatibility/evidence'
import { DEMO_COVERAGE_MATRIX } from './demoCoverageMatrix'
import { compatibilityCases as reactNativeCases } from './react-native/catalog'

export const COVERAGE_LAYERS = ['static', 'dev', 'runtime', 'hmr', 'visual', 'negative'] as const
export type CoverageLayer = typeof COVERAGE_LAYERS[number]

export const COVERAGE_STATUSES = [
  'ci-required',
  'ci-nightly',
  'local-required',
  'unsupported-verified',
  'not-applicable',
  'blocked',
] as const
export type CoverageStatus = typeof COVERAGE_STATUSES[number]

export interface CoverageLayerContract {
  status: CoverageStatus
  executor: string
  evidenceSchema: string
  reason?: string
}

export interface CoverageCell {
  id: string
  source: 'demo' | 'react-native' | 'lynx' | 'tailwind'
  caseId?: string
  capabilityIds?: string[]
  browserEngine?: 'chromium' | 'firefox' | 'webkit'
  project: string
  framework: string
  builder: string
  tailwindcss: 'v3' | 'v4'
  platform: string
  runtime: string
  renderMode: 'default' | 'vdom' | 'vapor' | 'native'
  subpackage: boolean
  layers: Record<CoverageLayer, CoverageLayerContract>
}

function explicitStatus(status: DemoCoverageStatus, local: boolean): CoverageStatus {
  if (status === 'automated') {
    return 'ci-required'
  }
  if (status === 'local') {
    return 'local-required'
  }
  return local ? 'local-required' : 'not-applicable'
}

function reasonForLegacy(status: DemoCoverageStatus, platform: DemoPlatformCoverage) {
  if (status !== 'exempt') {
    return undefined
  }
  return platform.reason ?? '该层不适用于当前平台，原因需要在覆盖矩阵中显式维护。'
}

function layer(
  status: CoverageStatus,
  executor: string,
  evidenceSchema: string,
  reason?: string,
): CoverageLayerContract {
  return {
    status,
    executor,
    evidenceSchema,
    ...(reason ? { reason } : {}),
  }
}

function demoCell(project: string, entry: typeof DEMO_COVERAGE_MATRIX[number], platform: DemoPlatformCoverage): CoverageCell {
  const local = entry.hbuilderxLocal || platform.staticCoverage === 'local' || platform.devCoverage === 'local' || platform.hmrCoverage === 'local'
  const staticStatus = explicitStatus(platform.staticCoverage, local)
  const devStatus = explicitStatus(platform.devCoverage, local)
  const runtimeStatus = explicitStatus(platform.hmrCoverage, local)
  const hmrStatus = explicitStatus(platform.hmrCoverage, local)
  const visualStatus = platform.hmrCoverage === 'automated'
    ? 'ci-required'
    : local
      ? 'local-required'
      : 'not-applicable'
  const subpackage = project.startsWith('subpackage-')
  const base = `${project}:${platform.platform}`
  const legacyReason = reasonForLegacy(platform.hmrCoverage, platform)
  return {
    id: `demo/${base}`,
    source: 'demo',
    project,
    framework: entry.framework,
    builder: entry.builder,
    tailwindcss: entry.tailwindcss,
    platform: platform.platform,
    runtime: platform.platform === 'h5:ssr' ? 'ssr' : platform.platform,
    renderMode: entry.builder === 'hbuilderx-vapor' ? 'vapor' : entry.builder === 'hbuilderx' ? 'vdom' : 'default',
    subpackage,
    layers: {
      static: layer(staticStatus, platform.command, 'demo-static-v1', reasonForLegacy(platform.staticCoverage, platform)),
      dev: layer(devStatus, platform.command, 'demo-dev-v1', reasonForLegacy(platform.devCoverage, platform)),
      runtime: layer(runtimeStatus, platform.command, 'demo-runtime-v1', legacyReason),
      hmr: layer(hmrStatus, platform.command, 'demo-hmr-v1', legacyReason),
      visual: layer(visualStatus, platform.command, 'demo-visual-v1', legacyReason),
      negative: layer('not-applicable', 'catalog:unsupported', 'negative-catalog-v1', 'demo 负向能力由框架兼容性 catalog 单独覆盖。'),
    },
  }
}

function compatibilityCell(source: 'react-native' | 'lynx', project: string, framework: string, platform: string, item: CompatibilityCase, executor: string): CoverageCell {
  const isNative = platform === 'android' || platform === 'ios'
  const buildOnly = item.evidence === 'build'
  const visual = !buildOnly && (source === 'react-native' || Boolean(evidenceSequence(item, { generated: true, bundled: true })))
  return {
    id: `${source}/${platform}/${item.id}`,
    source,
    caseId: item.id,
    project,
    framework,
    builder: source === 'react-native' ? 'metro' : 'rspeedy',
    tailwindcss: 'v4',
    platform,
    runtime: isNative ? `${source}-${platform}` : platform,
    renderMode: 'native',
    subpackage: false,
    layers: {
      static: layer(source === 'lynx' && isNative ? 'ci-nightly' : 'ci-required', executor, `${source}-static-v1`),
      dev: layer('not-applicable', executor, `${source}-dev-v1`, '兼容性 reporter 验证独立案例，不提供开发服务生命周期证据。'),
      runtime: layer(buildOnly ? 'not-applicable' : isNative ? 'ci-nightly' : 'ci-required', executor, `${source}-runtime-v1`, buildOnly ? '该案例只验证构建指令，没有运行时语义。' : undefined),
      hmr: layer('not-applicable', 'catalog:no-hmr', `${source}-hmr-v1`, '该原生兼容性 catalog 当前验证静态/运行时，不提供 HMR 语义。'),
      visual: layer(visual ? isNative ? 'ci-nightly' : 'ci-required' : 'not-applicable', executor, `${source}-visual-v1`, visual ? undefined : '该案例的证据契约没有原生截图。'),
      negative: layer('ci-required', executor, `${source}-negative-v1`, '兼容性 case 的 unsupported 结果必须带 reason 与失败 checkpoint。'),
    },
  }
}

export const DEMO_COVERAGE_CELLS: CoverageCell[] = DEMO_COVERAGE_MATRIX.flatMap(entry => entry.platforms.map(platform => demoCell(entry.name, entry, platform)))

export const REACT_NATIVE_COVERAGE_CELLS: CoverageCell[] = ['web', 'android', 'ios'].flatMap(platform => reactNativeCases.map(item => compatibilityCell('react-native', '@weapp-tailwindcss/react-native', 'react-native', platform, item, `pnpm e2e:react-native:${platform}`)))

export const LYNX_COVERAGE_CELLS: CoverageCell[] = ['android', 'ios'].flatMap(platform => lynxCases.map(item => compatibilityCell('lynx', '@weapp-tailwindcss/lynx', 'lynx', platform, item, `pnpm e2e:lynx:${platform}`)))

/** 父案例记录待覆盖范围；具体 v2 语义案例通过 coverage adapter 单独登记，不由编译成功推断。 */
function tailwindParentCell(target: string, item: CompatibilityCase): CoverageCell {
  const browserEngine = target === 'weapp' ? undefined : target.slice(4) as CoverageCell['browserEngine']
  const executor = browserEngine ? `pnpm e2e:tailwind:web:ci --engine ${browserEngine}` : 'pnpm e2e:tailwind --target weapp'
  const required = target === 'weapp' ? 'local-required' : 'ci-required'
  return {
    id: `tailwind/${target}/${item.id}`,
    source: 'tailwind',
    caseId: item.id,
    capabilityIds: officialFeatureManifest.filter(feature => feature.caseId === item.id).map(feature => feature.id),
    ...(browserEngine ? { browserEngine } : {}),
    project: 'tailwind-capabilities',
    framework: target === 'weapp' ? 'weapp' : 'web',
    builder: target === 'weapp' ? 'weapp-vite' : 'browser',
    tailwindcss: 'v4',
    platform: target,
    runtime: target,
    renderMode: 'default',
    subpackage: false,
    layers: {
      static: layer(required, executor, 'tailwind-static-v2'),
      dev: layer('not-applicable', executor, 'tailwind-dev-v2', '语义探针没有开发服务生命周期契约。'),
      runtime: layer(item.evidence === 'build' ? 'not-applicable' : required, executor, 'tailwind-runtime-v2', item.evidence === 'build' ? '构建指令没有运行时语义。' : undefined),
      hmr: layer('not-applicable', executor, 'tailwind-hmr-v2', '语义探针没有 HMR 契约。'),
      visual: layer(item.evidence === 'build' ? 'not-applicable' : required, executor, 'tailwind-visual-v2', item.evidence === 'build' ? '构建指令没有截图契约。' : undefined),
      negative: layer(required, executor, 'tailwind-negative-v2', '平台限制必须由独立负向断言验证。'),
    },
  }
}

export const WEB_COVERAGE_CELLS: CoverageCell[] = ['chromium', 'firefox', 'webkit'].flatMap(engine => lynxCases.map(item => tailwindParentCell(`web-${engine}`, item)))
export const WEAPP_COVERAGE_CELLS: CoverageCell[] = lynxCases.map(item => tailwindParentCell('weapp', item))

export const COVERAGE_REGISTRY: CoverageCell[] = [
  ...DEMO_COVERAGE_CELLS,
  ...REACT_NATIVE_COVERAGE_CELLS,
  ...LYNX_COVERAGE_CELLS,
  ...WEB_COVERAGE_CELLS,
  ...WEAPP_COVERAGE_CELLS,
]

export function validateCoverageRegistry(registry: readonly CoverageCell[] = COVERAGE_REGISTRY) {
  const ids = new Set<string>()
  for (const cell of registry) {
    if (ids.has(cell.id)) {
      throw new Error(`duplicate coverage cell: ${cell.id}`)
    }
    ids.add(cell.id)
    if (!cell.project || !cell.platform || !cell.runtime) {
      throw new Error(`incomplete coverage identity: ${cell.id}`)
    }
    if (cell.source !== 'demo' && !cell.caseId) {
      throw new Error(`compatibility coverage is missing its case dimension: ${cell.id}`)
    }
    for (const coverageLayer of COVERAGE_LAYERS) {
      const contract = cell.layers[coverageLayer]
      if (!contract.executor || !contract.evidenceSchema) {
        throw new Error(`${cell.id} ${coverageLayer} is missing executor/evidenceSchema`)
      }
      if ((contract.status === 'not-applicable' || contract.status === 'unsupported-verified') && !contract.reason) {
        throw new Error(`${cell.id} ${coverageLayer} ${contract.status} requires a reason`)
      }
    }
  }
  return registry
}

validateCoverageRegistry()
