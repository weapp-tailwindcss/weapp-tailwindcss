import type { CapabilityIdentity, CaseContract } from './types'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { collectIdentity } from '../../scripts/e2e-preflight/io'

export function digest(value: unknown): string {
  return createHash('sha256').update(typeof value === 'string' || value instanceof Uint8Array ? value : JSON.stringify(value)).digest('hex')
}

export async function capabilityIdentity(root: string, contracts: readonly CaseContract[], fixture: unknown): Promise<CapabilityIdentity> {
  const require = createRequire(path.join(root, 'package.json'))
  const source = await collectIdentity(root)
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
    },
  }
}
