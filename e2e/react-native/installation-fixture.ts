import type { NativeRuntimeInstallation } from '../../examples/react-native-expo/src/compatibility/protocol'
import { createHash } from 'node:crypto'

/** 仅供纯回归构造合成输入，不代表设备已安装或运行。 */
export function syntheticRuntimeInstallation(manifestJson = '{"version":1,"rules":{}}', revision = 'synthetic-unit-publication'): NativeRuntimeInstallation {
  return { version: 1, runtimeInstanceId: 'synthetic-unit-runtime-instance', publication: { revision, manifestSha256: createHash('sha256').update(manifestJson).digest('hex') }, manifestJson }
}
