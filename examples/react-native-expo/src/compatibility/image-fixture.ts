/** 固定的无色彩配置 PNG：左红右蓝，不以本轮输出生成 oracle。 */
export const nativeImageFixture = {
  version: 1,
  uri: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAICAYAAADwdn+XAAAALklEQVR4AaXBQQEAIAzEsHJi5gIBCMfFvICDfZqsrnoMzr5MghSkIAUpSEEK0gfgKgOCJP8ROwAAAABJRU5ErkJggg==',
  intrinsic: { width: 16, height: 8 },
  display: { width: 44, height: 44 },
  control: { width: 80, height: 40 },
  resizeMode: 'stretch',
  colors: [[220, 38, 38, 255], [37, 99, 235, 255]],
} as const

export type NativeImageSide = 'probe' | 'reference' | 'control'
export interface NativeImageLoad {
  revision: string
  id: string
  phase: string
  side: NativeImageSide
  event: 'load'
  origin: 'native-source' | 'web-target'
  uri: string
  width: number
  height: number
}
export interface NativeImageEvidence { version: 1, loads: NativeImageLoad[] }
