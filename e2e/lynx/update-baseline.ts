import type { CompatibilityBaseline, FailureStage, StaticEvidenceReport } from '../../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import staticEvidenceJson from '../../examples/react-lynx/src/compatibility/static-evidence.json'
import { compatibilityDir, compatibilityVersions, getCatalogHash } from './catalog'
import { defaultReportPath, readNativeReport } from './reports'

async function main() {
  const iosPath = process.env['LYNX_IOS_REPORT'] ?? defaultReportPath('ios')
  const androidPath = process.env['LYNX_ANDROID_REPORT'] ?? defaultReportPath('android')
  const [ios, android] = await Promise.all([
    readNativeReport(iosPath, 'ios'),
    readNativeReport(androidPath, 'android'),
  ])
  if (ios.catalogHash !== android.catalogHash) {
    throw new Error('iOS 与 Android 报告的 catalog hash 不一致。')
  }
  if (ios.versions.lynxEngine !== android.versions.lynxEngine || ios.versions.lynxEngine !== compatibilityVersions.lynxEngine) {
    throw new Error('只有 Lynx Engine 4.0.1 的同版本双端报告可以刷新基线。')
  }
  if (staticEvidenceJson.catalogHash !== getCatalogHash()) {
    throw new Error('静态证据已过期，请先运行 pnpm e2e:lynx:static:update。')
  }

  const iosById = new Map(ios.results.map(result => [result.id, result]))
  const androidById = new Map(android.results.map(result => [result.id, result]))
  const staticById = new Map((staticEvidenceJson as StaticEvidenceReport).results.map(result => [result.id, result]))
  const verifiedAtValues = [ios.verifiedAt, android.verifiedAt].sort()
  const baseline: CompatibilityBaseline = {
    schemaVersion: 1,
    catalogHash: getCatalogHash(),
    verifiedAt: verifiedAtValues[verifiedAtValues.length - 1] ?? null,
    versions: compatibilityVersions,
    environments: {
      ios: ios.environment,
      android: android.environment,
    },
    results: compatibilityCases.map((item) => {
      const staticResult = staticById.get(item.id)
      const iosResult = iosById.get(item.id)
      const androidResult = androidById.get(item.id)
      if (!staticResult || !iosResult || !androidResult) {
        throw new Error(`缺少 ${item.id} 的完整静态或双端证据。`)
      }
      const runtimeFailure = iosResult.status === 'unsupported' || androidResult.status === 'unsupported'
      const failureStage: FailureStage | undefined = staticResult.failureStage
        ?? (runtimeFailure ? iosResult.failureStage ?? androidResult.failureStage ?? 'runtime' : undefined)
      return {
        id: item.id,
        generated: staticResult.generated,
        bundled: staticResult.bundled,
        ...(failureStage ? { failureStage } : {}),
        ios: {
          status: iosResult.status,
          ...(iosResult.reason ? { reason: iosResult.reason } : {}),
        },
        android: {
          status: androidResult.status,
          ...(androidResult.reason ? { reason: androidResult.reason } : {}),
        },
      }
    }),
  }
  const outputPath = path.join(compatibilityDir, 'baseline.json')
  const iosOutputPath = defaultReportPath('ios')
  const androidOutputPath = defaultReportPath('android')
  await Promise.all([
    fs.writeFile(iosOutputPath, `${JSON.stringify(ios, null, 2)}\n`),
    fs.writeFile(androidOutputPath, `${JSON.stringify(android, null, 2)}\n`),
    fs.writeFile(outputPath, `${JSON.stringify(baseline, null, 2)}\n`),
  ])
  process.stdout.write(`已使用同版本双端报告更新 ${[
    iosOutputPath,
    androidOutputPath,
    outputPath,
  ].map(file => path.relative(process.cwd(), file)).join('、')}。\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
