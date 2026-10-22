/** 相邻 binary32 数值的间距；布局端点超过原生有限范围时拒绝。 */
function float32Ulp(value: number) {
  const absolute = Math.abs(value)
  return absolute < 2 ** -126 ? 2 ** -149 : 2 ** (Math.floor(Math.log2(absolute)) - 23)
}

/**
 * 当前夹具禁止外层滚动，起点限于 viewport，端点以 viewport + 配置高度包络。
 * 两端点各半 ULP、相减结果半 ULP；预算不依赖待验证高度或 Android inset。
 * 这只是受控夹具的表示比较合同；调用方还必须核验 PNG 与起点包络。
 */
export function nativeLayoutSizeMatches(actual: number, expected: number, viewportHeight: number, pixelRatio: number) {
  if (![actual, expected, viewportHeight, pixelRatio].every(Number.isFinite) || actual <= 0 || expected <= 0 || viewportHeight <= 0 || pixelRatio <= 0
    || ![viewportHeight + expected, expected].every(value => Number.isFinite(Math.fround(value)))) {
    return false
  }
  const representationError = float32Ulp(viewportHeight + expected) + float32Ulp(expected) / 2
  const actualPixels = Math.round(actual * pixelRatio)
  const expectedPixels = Math.round(expected * pixelRatio)
  return Math.abs(actual - expected) <= representationError
    && Number.isSafeInteger(actualPixels) && Number.isSafeInteger(expectedPixels) && expectedPixels > 0 && actualPixels === expectedPixels
}
