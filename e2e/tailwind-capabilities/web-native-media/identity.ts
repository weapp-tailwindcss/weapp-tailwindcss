import { digest } from '../identity'

/** 每轮每状态的可见标记，用固定位置的 RGB 字节拒绝旧 PNG。 */
export function identityColors(runId: string, state: string, cssHash: string) {
  const hash = digest({ runId, state, cssHash, fixture: 'native-media-contrast-less' })
  return Array.from({ length: 8 }, (_, i) => [0, 1, 2].map(channel => Number.parseInt(hash.slice(i * 6 + channel * 2, i * 6 + channel * 2 + 2), 16)))
}
