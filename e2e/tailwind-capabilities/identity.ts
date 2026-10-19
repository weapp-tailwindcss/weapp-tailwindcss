import type { CapabilityIdentity, CaseContract } from './types'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { collectIdentity } from '../../scripts/e2e-preflight/io'
import { readInstalledVersion } from '../lynx/versions'

export function digest(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value)).digest('hex')
}

export async function capabilityIdentity(root: string, contracts: readonly CaseContract[], fixture: unknown): Promise<CapabilityIdentity> {
  const require = createRequire(path.join(root, 'package.json'))
  const source = await collectIdentity(root)
  const exampleRequire = createRequire(path.join(root, 'examples', 'react-lynx', 'package.json'))
  const reactRequire = createRequire(exampleRequire.resolve('@lynx-js/react-rsbuild-plugin/package.json'))
  const templateManifest = reactRequire.resolve('@lynx-js/template-webpack-plugin/package.json')
  const e2eManifest = path.join(root, 'e2e', 'package.json')
  return {
    sourceHash: digest({ head: source.head, source: source.source }),
    lockfileHash: digest(await readFile(path.join(root, 'pnpm-lock.yaml'))),
    catalogHash: digest(contracts.map(({ id, features, candidate }) => ({ id, features, candidate }))),
    fixtureHash: digest(fixture),
    expectationsHash: digest(contracts.map(({ id, expectation, requiredAssertions, expectedValues, tolerances, assertionStages }) => ({ id, expectation, requiredAssertions, expectedValues, tolerances, assertionStages }))),
    versions: {
      tailwindcss: require('tailwindcss/package.json').version,
      node: process.version,
      generator: require('./packages/weapp-tailwindcss/package.json').version,
      engine: require('./packages/engine/package.json').version,
      playwright: require('playwright/package.json').version,
      vite: require('vite/package.json').version,
      compatibility: require('./packages/postcss/package.json').version,
      nativeAdapter: require('./packages/react-native/package.json').version,
      lynxAdapter: require('./packages/lynx/package.json').version,
      lynxEncoder: readInstalledVersion(templateManifest, '@lynx-js/tasm'),
      lynxSerializer: readInstalledVersion(templateManifest, '@lynx-js/css-serializer'),
      lynxDecoder: readInstalledVersion(e2eManifest, '@lynx-js/tasm'),
      lynxCssDefines: readInstalledVersion(e2eManifest, '@lynx-js/css-defines'),
    },
  }
}
