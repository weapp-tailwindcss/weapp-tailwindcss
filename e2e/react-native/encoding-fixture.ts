import type { ReactNativeReport } from './catalog'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { RN_FIXTURE_HASH } from './catalog'
import { RN_ENTRY_SCOPE_VERSION } from './generation-input'
import { collectStaticEvidence } from './static-evidence'

let generatedFixture: ReturnType<typeof collectStaticEvidence> | undefined

/** 单测模拟宿主归档的真实文件形状，错误产物由各反例显式修改。 */
export async function writeEncodingFixture(directory: string, report: ReactNativeReport) {
  const evidence = structuredClone(await (generatedFixture ??= collectStaticEvidence()))
  const manifest = evidence.manifest
  const source = JSON.stringify(manifest)
  const staticInput = JSON.stringify({ schemaVersion: 2, fixtureHash: RN_FIXTURE_HASH, rawCss: evidence.rawCss, manifest, generation: evidence.generation })
  const runtimeInput = evidence.generation.runtimeInput.config.source
  const digest = (value: string) => createHash('sha256').update(value).digest('hex')
  const ready = JSON.stringify({ revision: 'metro-publication', virtualPath: 'virtual.js' })
  const output = path.join(directory, 'encoding')
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, 'manifest.json'), source)
  await writeFile(path.join(output, 'manifest.ready'), ready)
  await writeFile(path.join(output, 'static-evidence.json'), staticInput)
  await writeFile(path.join(output, 'tailwind-input.cjs'), runtimeInput)
  await writeFile(path.join(output, 'run-context.json'), JSON.stringify({ version: RN_ENTRY_SCOPE_VERSION, runId: report.runId, revision: report.revision, manifestSha256: digest(source), staticInputSha256: digest(staticInput), runtimeInputSha256: digest(runtimeInput) }))
  await writeFile(path.join(output, 'snapshot.json'), JSON.stringify({ stablePublication: true, readyBefore: ready, readyAfter: ready, files: { 'manifest.json': { sha256: digest(source) }, 'manifest.ready': { sha256: digest(ready) }, 'static-evidence.json': { sha256: digest(staticInput) }, 'tailwind-input.cjs': { sha256: digest(runtimeInput) } } }))
  return { manifest, source, ready, output }
}
