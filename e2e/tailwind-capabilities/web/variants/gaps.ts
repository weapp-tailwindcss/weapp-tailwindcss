const limitations = {
  'any-pointer-none': '当前复用的单个 page 没有移除全部指针设备的原生接口，不能用普通 hover 替代。',
  'pointer-none': '当前 per-page media API 没有无指针设备接口，不能通过隐藏鼠标或移到页面外伪造。',
  'contrast-less': '当前 Playwright 原生 contrast 选项只提供 more/no-preference，没有 less 入口。',
  'inverted-colors': '当前 Playwright 没有 inverted-colors 原生媒体模拟接口。',
  'autofill': '真实自动填充需要受管凭据及浏览器自动填充交互；设置 value 或填表不能产生 :autofill。',
  'visited': '浏览器隐私保护会掩蔽 :visited 的 computed style，需要独立历史与像素 oracle。',
}

export const variantRuntimeGaps: Record<string, string> = Object.fromEntries(Object.entries(limitations).map(([root, reason]) => [`variant/static/${root}`, `尚未提供可受控运行时夹具：${reason}`]))
