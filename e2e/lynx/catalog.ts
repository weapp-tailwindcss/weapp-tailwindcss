import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { compatibilityCases } from '../../examples/react-lynx/src/compatibility/catalog'
import { officialFeatureManifest } from '../../examples/react-lynx/src/compatibility/manifest'

export const repoRoot = path.resolve(import.meta.dirname, '../..')
export const exampleDir = path.join(repoRoot, 'examples', 'react-lynx')
export const compatibilityDir = path.join(exampleDir, 'src', 'compatibility')
export const lynxIntermediateDir = path.join(exampleDir, 'dist', '.lynx', 'main')
export const compatibilityVersions = {
  tailwindcss: '4.3.3',
  lynxEngine: '4.0.1',
  engineVersion: '3.9',
  cssDefines: '0.0.16',
} as const

export function getCatalogHash() {
  const canonical = {
    cases: compatibilityCases.map(item => ({
      id: item.id,
      family: item.family,
      page: item.page,
      className: item.className,
      evidence: item.evidence,
      probe: item.probe,
      declarations: item.declarations,
    })),
    features: officialFeatureManifest,
    versions: compatibilityVersions,
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

export async function readCssDefinesProperties() {
  const require = createRequire(path.join(repoRoot, 'e2e', 'package.json'))
  const indexPath = require.resolve('@lynx-js/css-defines/property_index.json')
  const entries = JSON.parse(await fs.readFile(indexPath, 'utf8')) as Array<{ name?: string }>
  return new Set(entries.flatMap(entry => entry.name ? [entry.name] : []))
}
