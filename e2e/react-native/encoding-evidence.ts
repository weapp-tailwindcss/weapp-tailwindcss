import type { NativeStyleManifest } from '../../packages/react-native/src/types'
import type { ReactNativeReport } from './catalog'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { nativeBuildFixtures, styleContains } from '../../examples/react-native-expo/src/compatibility/protocol'
import { createNativeStyleRuntime } from '../../packages/react-native/src/runtime'
import { RN_FIXTURE_HASH } from './catalog'
import { RN_ENTRY_SCOPE_VERSION } from './generation-input'
import { validateImportantRuntimeManifest } from './important-runtime'
import { captureMetroEvidence } from './metro-evidence'
import { nativeEncodingArtifactNames } from './phase-contract'
import { validateStaticGenerationInput } from './static-input-evidence'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')

/** 在恢复源码前归档 Metro 实际发布的 manifest，绑定本轮宿主运行和页面修订。 */
export async function captureNativeEncoding(projectRoot: string, directory: string, report: ReactNativeReport) {
  const output = path.join(directory, 'encoding')
  await mkdir(output, { recursive: true })
  await captureMetroEvidence(projectRoot, output, {
    'static-evidence.json': path.resolve(projectRoot, 'src/compatibility/static-evidence.json'),
    'tailwind-input.cjs': path.resolve(projectRoot, 'tailwind-input.cjs'),
  })
  const manifest = await readFile(path.join(output, 'manifest.json'), 'utf8')
  const staticInput = await readFile(path.join(output, 'static-evidence.json'), 'utf8')
  const runtimeInput = await readFile(path.join(output, 'tailwind-input.cjs'), 'utf8')
  await writeFile(path.join(output, 'run-context.json'), JSON.stringify({ version: RN_ENTRY_SCOPE_VERSION, runId: report.runId, revision: report.revision, manifestSha256: hash(manifest), staticInputSha256: hash(staticInput), runtimeInputSha256: hash(runtimeInput) }))
  await validateNativeEncodingArtifacts(report, directory)
}

/** 重读实际 manifest 并按独立 oracle 回放，不信任报告中的 encoded 布尔值。 */
export async function validateNativeEncodingArtifacts(report: ReactNativeReport, directory: string) {
  const output = path.join(directory, 'encoding')
  const manifestSource = await readFile(path.join(output, 'manifest.json'), 'utf8')
  const ready = await readFile(path.join(output, 'manifest.ready'), 'utf8')
  const context = JSON.parse(await readFile(path.join(output, 'run-context.json'), 'utf8'))
  const snapshot = JSON.parse(await readFile(path.join(output, 'snapshot.json'), 'utf8'))
  const publication = JSON.parse(ready)
  if (context.version !== RN_ENTRY_SCOPE_VERSION || context.runId !== report.runId || context.revision !== report.revision || context.manifestSha256 !== hash(manifestSource)
    || !snapshot.stablePublication || snapshot.readyBefore !== ready || snapshot.readyAfter !== ready
    || snapshot.files?.['manifest.json']?.sha256 !== hash(manifestSource)
    || snapshot.files?.['manifest.ready']?.sha256 !== hash(ready)
    || publication.error || typeof publication.revision !== 'string' || !publication.revision.trim()
    || publication.manifestSha256 !== hash(manifestSource)
    || typeof publication.virtualPath !== 'string' || !publication.virtualPath) {
    throw new Error('React Native encoding manifest 缺少本轮稳定发布身份或字节不匹配')
  }
  const staticInput = await readFile(path.join(output, 'static-evidence.json'), 'utf8')
  const runtimeInput = await readFile(path.join(output, 'tailwind-input.cjs'), 'utf8')
  const input = JSON.parse(staticInput)
  if (report.fixtureHash !== RN_FIXTURE_HASH || input.fixtureHash !== report.fixtureHash
    || context.staticInputSha256 !== hash(staticInput) || context.runtimeInputSha256 !== hash(runtimeInput)
    || snapshot.files?.['static-evidence.json']?.sha256 !== hash(staticInput)
    || snapshot.files?.['tailwind-input.cjs']?.sha256 !== hash(runtimeInput)
    || input.generation?.runtimeInput?.config?.sha256 !== hash(runtimeInput)) {
    throw new Error('React Native encoding 缺少绑定本轮实际 static 模块与 Metro 入口的归档')
  }
  await validateStaticGenerationInput(input)
  const manifest = JSON.parse(manifestSource) as NativeStyleManifest
  validateImportantRuntimeManifest(manifest)
  const runtime = createNativeStyleRuntime(manifest)
  for (const [id, fixture] of Object.entries(nativeBuildFixtures)) {
    const result = report.results.find(item => item.id === id)
    const actual = runtime.tw(fixture.candidates, { colorScheme: 'dark', platform: report.platform }) as Record<string, unknown>
    if (!result || fixture.candidates.some(candidate => !manifest.rules[candidate]?.length)
      || !styleContains(actual, fixture.style) || !styleContains(result.encodedStyle, fixture.style)
      || !isDeepStrictEqual(result.encodedStyle, actual)) {
      throw new Error(`${id} 的本轮 manifest 编码与独立原生 oracle 或报告不一致`)
    }
  }
  return nativeEncodingArtifactNames.map(name => path.join(output, name))
}
