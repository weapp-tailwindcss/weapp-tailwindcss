import type { CompatibilityCase } from '@weapp-tailwindcss/test-catalog'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { catalogIdentityPayload, compatibilityCases } from '@weapp-tailwindcss/test-catalog'
import { nativeImageFixture } from '../../examples/react-native-expo/src/compatibility/image-fixture'
import { nativeBuildFixtures, nativeFixtures, rejectedNativeCases } from '../../examples/react-native-expo/src/compatibility/protocol'
import { nativeScrollFixture } from '../../examples/react-native-expo/src/compatibility/scroll-fixture'
import { authoringCaseScopes, authoringScopes, RN_ENTRY_SCOPE_VERSION } from './entry-scope-contract'
import { hmrObserverSourceIdentity } from './hmr-observation/identity'
import { nativeRuntimePhases, RN_PHASE_EVIDENCE_VERSION } from './phase-contract'

export type { ReactNativeCaseResult, ReactNativePlatform, ReactNativeReport } from '../../examples/react-native-expo/src/compatibility/protocol'
export { compatibilityCases }
export type { CompatibilityCase }

export const RN_CATALOG_HASH = createHash('sha256').update(catalogIdentityPayload).digest('hex')
export const RN_FIXTURE_HASH = createHash('sha256').update(JSON.stringify({ nativeFixtures, image: nativeImageFixture, scroll: nativeScrollFixture, rejected: [...rejectedNativeCases], build: nativeBuildFixtures, observableControl: 1, entryScopes: { version: RN_ENTRY_SCOPE_VERSION, scopes: authoringScopes, cases: authoringCaseScopes }, runtimePhases: { version: RN_PHASE_EVIDENCE_VERSION, phases: nativeRuntimePhases }, hmrObserverSourceIdentity })).digest('hex')

const exampleRequire = createRequire(new URL('../../examples/react-native-expo/package.json', import.meta.url))
const compilerRequire = createRequire(new URL('../../packages/react-native/package.json', import.meta.url))

export function reactNativeVersions() {
  return {
    tailwindcss: exampleRequire('tailwindcss/package.json').version as string,
    expo: exampleRequire('expo/package.json').version as string,
    reactNative: exampleRequire('react-native/package.json').version as string,
    compiler: compilerRequire('./package.json').version as string,
  }
}
