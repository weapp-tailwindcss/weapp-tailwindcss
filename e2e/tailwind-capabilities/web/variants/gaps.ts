const limitations = {
  'any-pointer-none': '当前复用的单个 page 没有移除全部指针设备的原生接口，不能用普通 hover 替代。',
  'pointer-none': '当前 per-page media API 没有无指针设备接口，不能通过隐藏鼠标或移到页面外伪造。',
  'contrast-less': 'Firefox/WebKit 当前缺少可恢复的原生 less 入口；Chromium 单独使用 CDP 夹具，不能推断其他引擎。',
  'inverted-colors': '当前 Playwright 没有 inverted-colors 原生媒体模拟接口。',
  'autofill': '真实自动填充需要受管凭据及浏览器自动填充交互；设置 value 或填表不能产生 :autofill。',
}

export const variantRuntimeGaps: Record<string, string> = Object.fromEntries(Object.entries(limitations).map(([root, reason]) => [`variant/static/${root}`, `尚未提供可受控运行时夹具：${reason}`]))
