import type { CaptureAsset } from './capture-assets'

/** 原生图片需完成真实解码，缺少组件或只有空白占位不能作为录制成功。 */
export function validateAndroidCaptureImages(logcat: string, assets: CaptureAsset[]) {
  if (/No BehaviorController defined for class image|Local capture image failed/.test(logcat)) {
    throw new Error('Android 原生图片组件或本地图片加载失败，请检查本轮 logcat。')
  }
  const names = new Set(assets.map(asset => asset.name))
  const images = [...logcat.matchAll(/LYNX_CAPTURE_IMAGE (\{[^\r\n]*\})/g)].map((match) => {
    const image = JSON.parse(match[1]!) as { name: string, width: number, height: number }
    if (!names.has(image.name) || !Number.isInteger(image.width) || image.width <= 0
      || !Number.isInteger(image.height) || image.height <= 0) {
      throw new Error('Android 原生图片解码证据不属于本轮有效的本地资产。')
    }
    return image
  })
  if (images.length === 0) {
    throw new Error('Android 录制缺少本轮本地图片的原生解码证据。')
  }
  return { version: 1, images }
}
