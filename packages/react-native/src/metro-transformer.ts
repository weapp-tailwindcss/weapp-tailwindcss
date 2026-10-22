/* eslint-disable no-console */

import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import process from 'node:process'
import { transformSync } from '@babel/core'
import babelPlugin from './babel'
import { getManifestPathsForProjectRoot, getRegisteredSnapshot, getRegisteredSnapshotByPath, getRegisteredSnapshotByProjectRoot, getRegisteredVirtualModule } from './metro'
import { readPublishedSnapshot } from './metro/manifest-store'
import { readRegisteredSnapshot } from './metro/registry'
import { virtualModuleCode } from './metro/virtual-module'

const require = createRequire(import.meta.url)

export async function transform(config: Record<string, unknown>, projectRoot: string, filename: string, data: Buffer, options: Record<string, unknown>) {
  const registeredVirtual = getRegisteredVirtualModule(filename)
  const metroId = config.weappTailwindcssMetroId as string | undefined
  const manifestPath = config.weappTailwindcssManifestPath as string | undefined
  const manifestReadyPath = config.weappTailwindcssManifestReadyPath as string | undefined
  const virtualModulePath = config.weappTailwindcssVirtualModulePath as string | undefined
  const projectManifestPaths = getManifestPathsForProjectRoot(projectRoot)
  const snapshot = await readRegisteredSnapshot(registeredVirtual) ?? (metroId ? await getRegisteredSnapshot(metroId) : undefined)
    ?? (manifestPath ? await getRegisteredSnapshotByPath(manifestPath) : undefined)
    ?? await getRegisteredSnapshotByProjectRoot(projectRoot)
    ?? await readPublishedSnapshot(
      manifestPath ?? projectManifestPaths.manifestPath,
      manifestReadyPath ?? projectManifestPaths.manifestReadyPath,
    )
  const manifest = snapshot?.manifest
  const publishedVirtualPath = snapshot?.virtualPath ?? virtualModulePath
  const virtualCode = manifest && publishedVirtualPath === filename ? virtualModuleCode(manifest, snapshot.publication, snapshot.manifestJson) : undefined
  if (process.env.WEAPP_TW_RN_DEBUG === '1' && !filename.replaceAll('\\', '/').includes('/node_modules/')) {
    console.error(`[react-native-debug] ${JSON.stringify({
      filename,
      projectRoot,
      configKeys: Object.keys(config).filter(key => key.startsWith('weappTailwindcss')),
      manifestPath,
      manifestReadyPath,
      virtualModulePath,
      virtualCode: Boolean(virtualCode),
      manifestClasses: manifest?.classSet.length ?? null,
      manifestReady: manifestReadyPath ? fs.existsSync(manifestReadyPath) : null,
      inputBytes: data.byteLength,
    })}`)
  }
  let source = virtualCode ? Buffer.from(virtualCode) : data
  if (!virtualCode && manifest && /\.(?:[cm]?[jt]sx?|flow)$/i.test(filename) && !filename.replaceAll('\\', '/').includes('/node_modules/')) {
    const transformed = transformSync(data.toString(), {
      filename,
      configFile: false,
      babelrc: false,
      sourceType: 'unambiguous',
      parserOpts: { plugins: ['jsx', 'typescript'] },
      plugins: [[babelPlugin, {
        classNameSet: manifest.classSet,
        staticStyleMap: manifest.staticLookup,
      }]],
    })
    if (transformed?.code) {
      source = Buffer.from(transformed.code)
    }
  }
  const originalPath = config.weappTailwindcssOriginalTransformerPath as string | undefined
  const transformer = originalPath
    ? require(originalPath)
    : require('metro-react-native-babel-transformer')
  return transformer.transform(config, projectRoot, filename, source, options)
}
