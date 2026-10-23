import type { FrameworkBuildFacts } from '@/bundlers/vite/shared/framework-services'
import { isUniAppXNativeAppOutDir } from '@/uni-app-x/harmony'
import { resolveUniUtsPlatform } from '@/utils'

export function createUniAppXNativeBuildTargetResolver(
  getResolvedConfig: () => FrameworkBuildFacts | undefined,
  platform = resolveUniUtsPlatform(),
) {
  let observedNativeAppBuildTarget = false

  return (id?: string) => {
    const config = getResolvedConfig()
    const detected = platform.isApp
      || isUniAppXNativeAppOutDir(config?.build?.outDir)
      || isUniAppXNativeAppOutDir(config?.root)
      || isUniAppXNativeAppOutDir(id)
    observedNativeAppBuildTarget ||= detected
    return observedNativeAppBuildTarget
  }
}
