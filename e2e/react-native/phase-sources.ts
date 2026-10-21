import type { NativeRuntimePhase } from './phase-contract'
import type { NativePhaseEntry } from './phase-index'
import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { getManifestPathsForProjectRoot } from '../../packages/react-native/src/metro'
import { virtualModuleCode } from '../../packages/react-native/src/metro/virtual-module'
import { createNativeStyleRuntime } from '../../packages/react-native/src/runtime'

/** 保存本阶段 Metro 输入；它不是设备实际加载的完整 bundle。 */
export async function captureNativePhaseSources(projectRoot: string, phaseDirectory: string) {
  const ready = await readFile(path.join(phaseDirectory, 'encoding', 'manifest.ready'), 'utf8')
  const publication = JSON.parse(ready)
  const input = JSON.parse(await readFile(path.join(phaseDirectory, 'encoding', 'static-evidence.json'), 'utf8'))
  const virtualPath = publication.virtualPath
  if (typeof virtualPath !== 'string' || !path.isAbsolute(virtualPath)) {
    throw new Error('React Native 虚拟模块没有本轮绝对路径')
  }
  const relative = path.relative(path.resolve(projectRoot), virtualPath)
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('React Native 虚拟模块越过当前项目边界')
  }
  const sources = path.join(phaseDirectory, 'sources')
  await mkdir(sources)
  for (const [name, file] of [
    ['global.css', path.resolve(projectRoot, input.generation.runtimeInput.options.input)],
    ['hmr-marker.ts', path.join(projectRoot, 'src', 'hmr-marker.ts')],
    ['virtual.js', virtualPath],
  ]) {
    await writeFile(path.join(sources, name!), await readFile(file!), { flag: 'wx' })
  }
  const currentReady = await readFile(getManifestPathsForProjectRoot(projectRoot).manifestReadyPath, 'utf8')
  if (currentReady !== ready) {
    throw new Error('React Native 阶段源码归档期间 Metro 发布发生变化')
  }
}

/** 只解析归档字节，不执行虚拟 JS，也不重读恢复后的 global.css 或 marker。 */
export async function validateNativePhaseSources(phaseDirectory: string, entry: NativePhaseEntry, phase: NativeRuntimePhase) {
  const publication = JSON.parse(await readFile(path.join(phaseDirectory, 'encoding', 'manifest.ready'), 'utf8'))
  const manifestSource = await readFile(path.join(phaseDirectory, 'encoding', 'manifest.json'), 'utf8')
  const manifest = JSON.parse(manifestSource)
  const identity = { revision: publication.revision, manifestSha256: publication.manifestSha256 }
  const input = JSON.parse(await readFile(path.join(phaseDirectory, 'encoding', 'static-evidence.json'), 'utf8'))
  const css = await readFile(path.join(phaseDirectory, 'sources', 'global.css'), 'utf8')
  const marker = await readFile(path.join(phaseDirectory, 'sources', 'hmr-marker.ts'), 'utf8')
  const virtual = await readFile(path.join(phaseDirectory, 'sources', 'virtual.js'), 'utf8')
  const value = marker.match(/^export const HMR_MARKER\s*=\s*(['"])([^'"]+)\1;?\s*$/m)?.[2]
  const className = marker.match(/^export const HMR_MARKER_CLASS\s*=\s*(['"])([^'"]+)\1;?\s*$/m)?.[2]
  const color = css.match(/@utility\s+rn-css-hmr-probe\s*\{\s*background-color:\s*(#[a-f\d]{6});?\s*\}/i)?.[1]
  const runtime = createNativeStyleRuntime(manifest)
  if (entry.sourceArchive.cssInput !== input.generation.runtimeInput.options.input
    || !isDeepStrictEqual(entry.sourceArchive.markerInput, ['src', 'hmr-marker.ts'])
    || entry.sourceArchive.virtualInput !== publication.virtualPath || entry.sourceArchive.publicationRevision !== publication.revision
    || identity.manifestSha256 !== createHash('sha256').update(manifestSource).digest('hex')
    || virtual !== virtualModuleCode(manifest, identity, manifestSource) || value !== phase.marker || className !== phase.markerClass || color !== phase.cssColor
    || !manifest.rules[phase.markerClass]?.length
    || !isDeepStrictEqual(runtime.tw('rn-css-hmr-probe'), { backgroundColor: phase.cssColor })) {
    throw new Error(`React Native 阶段原始源码、虚拟模块或发布身份不符：${phase.id}`)
  }
}
