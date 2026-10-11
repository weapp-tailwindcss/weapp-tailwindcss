/**
 * 保留旧的内部导入路径，实际实现位于 Vite 共享层，避免 CSS-only 入口加载 generate-bundle runtime。
 */
export { createCssHandlerOptionsCache, resolveViteCssHandlerExtraOptions } from '../css-handler-options'
export type { CssHandlerOptionsCache } from '../css-handler-options'
