// 将通用 HTML 结构转换为小程序平台可识别的选择器与声明
import type { PluginCreator, Rule } from 'postcss'
import process from 'node:process'
import { defu } from '@weapp-tailwindcss/shared'

const htmlTags = ['html', 'body', 'a', 'audio', 'button', 'canvas', 'form', 'iframe', 'img', 'input', 'label', 'progress', 'select', 'slot', 'textarea', 'video', 'abbr', 'area', 'b', 'bdi', 'big', 'br', 'cite', 'code', 'data', 'datalist', 'del', 'dfn', 'em', 'i', 'ins', 'kbd', 'map', 'mark', 'meter', 'output', 'picture', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'td', 'template', 'th', 'time', 'tt', 'u', 'var', 'wbr', 'address', 'article', 'aside', 'blockquote', 'caption', 'dd', 'details', 'dialog', 'div', 'dl', 'dt', 'fieldset', 'figcaption', 'figure', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hgroup', 'hr', 'legend', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'summary', 'table', 'tbody', 'tfoot', 'thead', 'tr', 'ul', 'svg']
const miniAppTags = ['cover-image', 'cover-view', 'match-media', 'movable-area', 'movable-view', 'page-container', 'scroll-view', 'share-element', 'swiper', 'swiper-item', 'view', 'icon', 'progress', 'rich-text', 'text', 'button', 'checkbox', 'checkbox-group', 'editor', 'form', 'input', 'keyboard-accessory', 'label', 'picker', 'picker-view', 'picker-view-column', 'radio', 'radio-group', 'slider', 'switch', 'textarea', 'functional-page-navigator', 'navigator', 'audio', 'camera', 'image', 'live-player', 'live-pusher', 'video', 'voip-room', 'map', 'canvas', 'web-view', 'ad', 'ad-custom', 'official-account', 'open-data', 'navigation-bar', 'page-meta']
// tags2Rgx 将标签列表转换为选择器过滤的正则表达式
const tags2Rgx = (tags: string[] = []) => new RegExp(`(^| |\\+|,|~|>|\\n)(${tags.join('|')})\\b(?=$| |\\.|\\+|,|~|:|\\[)`, 'g')

// 匹配通配符选择器
const UNIVERSAL_SELECTOR_RE = /(?:^| )\*(?![=/*])/

export interface IOptions {
  /** 当前编译平台 */
  platform?: string
  /** 设置是否去除 cursor 相关样式 (h5默认值：true) */
  removeCursorStyle?: boolean
  /** 是否移除 * 相关样式 */
  removeUniversal?: boolean
}

// postcssHtmlTransform 是按平台定制的选择器重写插件
const postcssHtmlTransform: PluginCreator<IOptions> = (opts: IOptions = {}) => {
  // 参考：https://docs.taro.zone/docs/envs#processenvtaro_env
  const options = defu(opts, {
    platform: process.env['TARO_ENV'],
  })
  let selectorFilter: RegExp
  let walkRules: (rule: Rule) => void
  switch (options.platform) {
    case 'h5': {
      selectorFilter = tags2Rgx(miniAppTags)
      walkRules = (rule: Rule) => {
        rule.selector = rule.selector.replace(selectorFilter, '$1taro-$2-core')
      }
      break
    }
    case 'rn': {
      break
    }
    case 'quickapp': {
      break
    }
    default: {
      // 小程序平台默认处理
      const selector = tags2Rgx(htmlTags)
      walkRules = (rule: Rule) => {
        if (options.removeUniversal && UNIVERSAL_SELECTOR_RE.test(rule.selector)) {
          rule.remove()
          return
        }
        rule.selector = rule.selector.replace(selector, '$1.h5-$2')
      }
    }
  }
  return {
    postcssPlugin: 'postcss-html-transform',
    Rule(rule) {
      if (typeof walkRules === 'function') {
        if (selectorFilter && selectorFilter.test(rule.selector)) {
          walkRules(rule)
        }
        else {
          walkRules(rule)
        }
      }
    },
    Declaration(decl) {
      if (options?.removeCursorStyle) {
        if (decl.prop === 'cursor') {
          decl.remove()
        }
      }
    },
  }
}

postcssHtmlTransform.postcss = true

export default postcssHtmlTransform
