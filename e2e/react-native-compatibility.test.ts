import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { compatibilityCases, RN_CATALOG_HASH } from './react-native/catalog'
import { nativeReportConclusion, reportFromStaticEvidence, validateReactNativeReport } from './react-native/reports'
import { collectStaticEvidence } from './react-native/static-evidence'
import { runWebRuntime } from './react-native/web-runtime'

const repoRoot = path.resolve(import.meta.dirname, '..')
const examplePackage = '@weapp-tailwindcss/example-react-native-expo'
const reactNativePackage = '@weapp-tailwindcss/react-native'
const corePackage = 'weapp-tailwindcss'

async function findBundle(root: string, platform: string) {
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'metadata.json'), 'utf8')) as { fileMetadata: Record<string, { bundle?: string }> }
  const reported = metadata.fileMetadata[platform]?.bundle
  if (reported) {
    return path.join(root, reported)
  }
  const pending = [root]
  while (pending.length) {
    const current = pending.pop()!
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name)
      if (entry.isDirectory()) {
        pending.push(target)
        continue
      }
      if (/\.(?:js|bundle)$/.test(entry.name) && !entry.name.endsWith('.map')) {
        return target
      }
    }
  }
  return undefined
}

describe('React Native compatibility catalog', () => {
  it('keeps the shared 118-case catalog stable', () => {
    expect(compatibilityCases).toHaveLength(118)
    expect(RN_CATALOG_HASH).toMatch(/^[a-f0-9]{64}$/)
    expect(new Set(compatibilityCases.map(item => item.id)).size).toBe(118)
  })

  it('generates a complete static manifest and a gated report', async () => {
    const { manifest, results } = await collectStaticEvidence()
    expect(manifest.classSet.length).toBeGreaterThan(0)
    expect(results).toHaveLength(118)
    expect(results.every(result => result.status === 'supported' || result.reason)).toBe(true)
    const report = reportFromStaticEvidence('web', results, {
      deviceName: 'static-export',
      osName: 'Web',
      osVersion: 'node',
      runtimeIdentifier: 'metro-static',
      abi: 'n/a',
      viewport: { width: 1280, height: 900, pixelRatio: 1 },
    })
    expect(validateReactNativeReport(report, 'web')).toBe(report)
    expect(nativeReportConclusion(report).split('|')).toHaveLength(118)
  }, 300_000)

  it('rejects stale or incomplete reports', () => {
    const report = reportFromStaticEvidence('web', compatibilityCases.map(item => ({
      id: item.id,
      status: 'supported' as const,
      checkpoints: [{ name: item.evidence === 'build' ? 'build:bundled' : `${item.probe}:probe`, passed: true }],
    })), {
      deviceName: 'static-export',
      osName: 'Web',
      osVersion: 'node',
      runtimeIdentifier: 'metro-static',
      abi: 'n/a',
      viewport: { width: 1280, height: 900, pixelRatio: 1 },
    })
    expect(() => validateReactNativeReport({ ...report, catalogHash: 'stale' }, 'web')).toThrow(/stale/)
    expect(() => validateReactNativeReport({ ...report, results: report.results.slice(1) }, 'web')).toThrow(/every catalog case/)
    expect(() => validateReactNativeReport({
      ...report,
      results: [{ ...report.results[0]!, status: 'not-tested' }, ...report.results.slice(1)],
    } as never, 'web')).toThrow(/invalid status/)
  })

  it.each(['web', 'android', 'ios'] as const)('validates the committed %s runtime baseline', async (platform) => {
    const report = JSON.parse(await fs.readFile(path.join(import.meta.dirname, 'react-native/reports', `${platform}.json`), 'utf8'))
    expect(validateReactNativeReport(report, platform)).toBe(report)
  })
})

describe('React Native Expo static exports', () => {
  it('exports Web, Android and iOS bundles through Metro', async () => {
    const outputRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tailwindcss-rn-export-'))
    try {
      // Metro 运行时会通过 generator 兼容入口加载根包；先构建根包，避免
      // workspace 的 dist 状态决定测试结果。
      await execa('pnpm', ['--filter', corePackage, 'build'], { cwd: repoRoot })
      await execa('pnpm', ['--filter', reactNativePackage, 'build'], { cwd: repoRoot })
      for (const platform of ['web', 'android', 'ios'] as const) {
        const exportResult = await execa('pnpm', ['--filter', examplePackage, 'exec', 'expo', 'export', '--clear', '--platform', platform, '--output-dir', path.join(outputRoot, platform)], {
          cwd: repoRoot,
          env: { ...process.env, CI: '1', WEAPP_TW_RN_DEBUG: '1' },
          timeout: 300_000,
        })
        if (process.env.CI) {
          await fs.writeFile(path.join(outputRoot, `${platform}-export.log`), `${exportResult.stdout}\n${exportResult.stderr}\n`, 'utf8')
        }
        const metadata = JSON.parse(await fs.readFile(path.join(outputRoot, platform, 'metadata.json'), 'utf8')) as { bundler: string }
        expect(metadata.bundler).toBe('metro')
        const bundlePath = await findBundle(path.join(outputRoot, platform), platform)
        expect(bundlePath, `${platform} bundle`).toBeTruthy()
        const bundle = await fs.readFile(bundlePath!, 'latin1')
        expect(bundle).toContain('Tailwind RN')
        expect(bundle).toMatch(/twStatic|getStaticStyle/)
        if (platform === 'web') {
          const runtime = await runWebRuntime(path.join(outputRoot, platform), path.join(outputRoot, 'web-runtime.png'))
          expect(runtime.box.width).toBeGreaterThan(100)
          expect(runtime.background).toMatch(/rgb\(/)
        }
      }
    }
    catch (error) {
      if (process.env.CI) {
        const childOutput = error as { stdout?: unknown, stderr?: unknown }
        await fs.writeFile(
          path.join(outputRoot, 'export-error.log'),
          `${String(childOutput.stdout ?? '')}\n${String(childOutput.stderr ?? '')}\n${error instanceof Error ? error.stack ?? error.message : String(error)}`,
          'utf8',
        )
        await fs.cp(outputRoot, path.join(repoRoot, 'e2e/.artifacts/react-native-web/static-export-debug'), { recursive: true, force: true })
      }
      throw error
    }
    finally {
      await fs.rm(outputRoot, { recursive: true, force: true })
    }
  }, 900_000)
})
