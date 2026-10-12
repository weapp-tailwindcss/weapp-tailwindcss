import type { CssOptions, CssPreflightOptions, CssSelectorReplacement } from '../../types'

export interface FinalizeMiniProgramCssOptions {
  cssPreflight?: CssPreflightOptions | undefined
  cssSelectorReplacement?: CssSelectorReplacement | undefined
  isTailwindcssV4?: boolean | undefined
  /** 增补小程序 WebKit 属性保留名单，不改变关键词值、transition 项或 keyframes 的清理。 */
  preserveWebkitProperties?: CssOptions['preserveWebkitProperties']
  /**
   * 是否递归移除子规则被清理而变空的父级条件规则。
   *
   * 增量生成的 CSS 可能只包含条件规则中的新片段，父级容器由已缓存产物提供，
   * 此时应保留占位容器，避免后续追加 CSS 时丢失层级。
   */
  removeEmptyAtRuleAncestors?: boolean | undefined
  /**
   * 是否为 Tailwind CSS v4 渐变工具类生成小程序字面量兜底。
   */
  tailwindcssV4GradientFallback?: boolean | undefined
}
