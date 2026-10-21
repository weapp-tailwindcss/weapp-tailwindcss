import { mediaGateArtifactNames } from '../../examples/react-lynx/src/compatibility/media-gate-contract'
import { themeOverrideArtifactNames } from '../../examples/react-lynx/src/compatibility/theme-overrides-contract'

/** 失败采集与设备读取共用固定文件清单，不接受路径或运行时回执扩展。 */
export const nativeFailureArtifactNames: readonly string[] = Object.freeze([
  ...mediaGateArtifactNames(),
  ...themeOverrideArtifactNames(),
])
