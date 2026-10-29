const NATIVE_FULL_PAGE_MAX_DIMENSION = 32_767

/** Chromium 保留已验证的原生路径；其它及未知浏览器只在共同安全尺寸内使用原生截图。 */
export function supportsNativeFullPageCapture(browserName: string | undefined, geometry: { width: number, height: number }) {
  const dimensions = [geometry.width, geometry.height]
  return dimensions.every(size => Number.isSafeInteger(size) && size > 0)
    && (browserName === 'chromium' || dimensions.every(size => size <= NATIVE_FULL_PAGE_MAX_DIMENSION))
}
