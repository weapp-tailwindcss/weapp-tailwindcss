declare module '@weapp-tailwindcss/postcss/html-transform' {
  import type { PluginCreator } from '@weapp-tailwindcss/postcss/transform'

  export interface IOptions {
    /** 当前编译平台 */
    platform?: string
    /** 设置是否去除 cursor 相关样式 (h5默认值：true) */
    removeCursorStyle?: boolean
    /** 是否移除 * 相关样式 */
    removeUniversal?: boolean
  }

  const postcssHtmlTransform: PluginCreator<IOptions>

  export default postcssHtmlTransform
}
