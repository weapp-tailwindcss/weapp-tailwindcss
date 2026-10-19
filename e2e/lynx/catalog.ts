import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { catalogIdentityPayload } from '../../examples/react-lynx/src/compatibility/catalog'
import { colorSchemeContract } from '../../examples/react-lynx/src/compatibility/color-scheme-contract'
import { responsiveContract } from '../../examples/react-lynx/src/compatibility/responsive-contract'
import { reviewedLynxContract } from './expectations'
import { readCompatibilityVersions } from './versions'

export const repoRoot = path.resolve(import.meta.dirname, '../..')
export const exampleDir = path.join(repoRoot, 'examples', 'react-lynx')
export const compatibilityDir = path.join(exampleDir, 'src', 'compatibility')
export const lynxIntermediateDir = path.join(exampleDir, 'dist', '.lynx', 'main')
export const compatibilityVersions = readCompatibilityVersions(repoRoot)

export function getCatalogHash() {
  return createHash('sha256').update(catalogIdentityPayload).update(JSON.stringify(compatibilityVersions)).update(JSON.stringify(reviewedLynxContract)).update(JSON.stringify(colorSchemeContract)).update(JSON.stringify(responsiveContract)).digest('hex')
}

export async function readCssDefinesProperties() {
  const require = createRequire(path.join(repoRoot, 'e2e', 'package.json'))
  const indexPath = require.resolve('@lynx-js/css-defines/property_index.json')
  const entries = JSON.parse(await fs.readFile(indexPath, 'utf8')) as Array<{ name?: string }>
  return new Set(entries.flatMap(entry => entry.name ? [entry.name] : []))
}
