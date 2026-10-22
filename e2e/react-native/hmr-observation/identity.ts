import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** 由本轮验收源码独立计算，不能只信归档目录内可同时改写的摘要。 */
export const hmrObserverSourceIdentity = [
  ['observer-wrapper.cjs', new URL('../../../examples/react-native-expo/src/compatibility/hmr-observer-wrapper.cjs', import.meta.url)],
  ['observer-recorder.cjs', new URL('../../../examples/react-native-expo/src/compatibility/hmr-observation.cjs', import.meta.url)],
  ['observer-resolver.cjs', new URL('./config.cjs', import.meta.url)],
  ['observer-metro-config.js', new URL('../../../examples/react-native-expo/metro.config.js', import.meta.url)],
].map(([name, file]) => {
  const bytes = readFileSync(file as URL)
  return { name: name as string, sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.length }
})
