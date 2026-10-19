const limitations = {
  'any-pointer-coarse': '当前复用的单个 page 没有切换 any-pointer 的跨浏览器原生接口，需要独立设备 context。',
  'any-pointer-fine': '当前复用的单个 page 没有切换 any-pointer 的跨浏览器原生接口，需要独立设备 context。',
  'any-pointer-none': '当前复用的单个 page 没有移除全部指针设备的原生接口，不能用普通 hover 替代。',
  'pointer-coarse': '需要独立的触摸设备 context；当前 per-page media API 不支持 pointer 模拟。',
  'pointer-fine': '当前 per-page media API 不支持 pointer 模拟，不能由默认鼠标环境推断状态切换。',
  'pointer-none': '当前 per-page media API 没有无指针设备接口，不能通过隐藏鼠标或移到页面外伪造。',
  'contrast-less': '当前 Playwright 原生 contrast 选项只提供 more/no-preference，没有 less 入口。',
  'inverted-colors': '当前 Playwright 没有 inverted-colors 原生媒体模拟接口。',
  'autofill': '真实自动填充需要受管凭据及浏览器自动填充交互；设置 value 或填表不能产生 :autofill。',
  'visited': '浏览器隐私保护会掩蔽 :visited 的 computed style，需要独立历史与像素 oracle。',
  'starting': '@starting-style 需要进入文档时的过渡帧及像素时间线，稳定态 computed style 不能证明起始样式。',
  'noscript': '需要 JavaScript 禁用的独立 browser context；当前交互式 page 不能切换 scripting 媒体。',
  'details-content': '::details-content 在旧引擎缺少统一可观测接口，需要逐引擎功能探针和实际内容像素 oracle。',
  'user-invalid': '必须证明原生用户编辑、提交与失焦后的有效性状态，脚本填值不能直接替代用户有效性生命周期。',
  'user-valid': '必须证明原生用户编辑、提交与失焦后的有效性状态，脚本填值不能直接替代用户有效性生命周期。',
}

export const variantRuntimeGaps: Record<string, string> = Object.fromEntries(Object.entries(limitations).map(([root, reason]) => [`variant/static/${root}`, `尚未提供可受控运行时夹具：${reason}`]))
