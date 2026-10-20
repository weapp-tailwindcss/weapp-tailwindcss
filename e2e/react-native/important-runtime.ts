import type { NativeStyleManifest } from '../../packages/react-native/src/types'
import { isDeepStrictEqual } from 'node:util'
import { expectedFixtureStyle, fixtureClassValue, fixtureInlineStyle, nativeFixtures } from '../../examples/react-native-expo/src/compatibility/protocol'
import { createNativeStyleRuntime } from '../../packages/react-native/src/runtime'
import { flattenInlineStyle } from '../../packages/react-native/src/runtime/line-height'

/** 在归档的实际 manifest 上回放四阶段竞争，配置污染不能冒充 important 支持。 */
export function validateImportantRuntimeManifest(manifest: NativeStyleManifest) {
  const runtime = createNativeStyleRuntime(manifest)
  for (const phase of nativeFixtures['syntax-important']!.phases!) {
    const value = fixtureClassValue('!bg-[#737373]', 'syntax-important', phase)
    const actual = flattenInlineStyle(runtime.composeStyle(runtime.tw(value), fixtureInlineStyle('syntax-important', phase)))
    if (!isDeepStrictEqual(actual, expectedFixtureStyle('syntax-important', phase))) {
      throw new Error(`React Native 主 manifest 的 important ${phase} 竞争与独立 oracle 不符`)
    }
  }
}
