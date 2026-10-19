import type { ReactNativeReport } from './catalog'
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nativeBuildFixtures } from '../../examples/react-native-expo/src/compatibility/protocol'
import { finalizeNativeManifest } from '../../packages/react-native/src/compiler'

/** 单测模拟宿主归档的真实文件形状，错误产物由各反例显式修改。 */
export async function writeEncodingFixture(directory: string, report: ReactNativeReport) {
  const rules = Object.fromEntries(Object.values(nativeBuildFixtures).flatMap(fixture => fixture.candidates.map((candidate, index) => [candidate, [{ style: index === 0 ? fixture.style : {} }]])))
  const manifest = finalizeNativeManifest({ version: 1, classSet: Object.keys(rules), rules, variables: {}, warnings: [] })
  const source = JSON.stringify(manifest)
  const digest = (value: string) => createHash('sha256').update(value).digest('hex')
  const ready = JSON.stringify({ revision: 'metro-publication', virtualPath: 'virtual.js' })
  const output = path.join(directory, 'encoding')
  await mkdir(output, { recursive: true })
  await writeFile(path.join(output, 'manifest.json'), source)
  await writeFile(path.join(output, 'manifest.ready'), ready)
  await writeFile(path.join(output, 'run-context.json'), JSON.stringify({ runId: report.runId, revision: report.revision, manifestSha256: digest(source) }))
  await writeFile(path.join(output, 'snapshot.json'), JSON.stringify({ stablePublication: true, readyBefore: ready, readyAfter: ready, files: { 'manifest.json': { sha256: digest(source) }, 'manifest.ready': { sha256: digest(ready) } } }))
  return { manifest, source, ready, output }
}
