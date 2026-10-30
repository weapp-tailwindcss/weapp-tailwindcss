import type { Plugin } from 'vite'
import type { ViteFrameworkExtraPluginContext } from '../../shared/framework-services'
import { createHash } from 'node:crypto'
import { sourcePathApi } from '@weapp-tailwindcss/source-scan'
import { parseVueRequest } from '../../query'

export const skylineTypographyPluginName = 'weapp-tailwindcss:uni-app-skyline-typography'
const STYLE_ATTRIBUTE = 'weapp-skyline-typography'

interface SourceRecord {
  prefix: string
  originalRevision: string
}

/** 仅处理当前项目实际加载的普通 Vue SFC，不推导源码目录或输出文件名。 */
function resolveLocalVueSource(id: string, root: string | undefined) {
  const { filename } = parseVueRequest(id)
  if (!root || id.search(/[?#]/) >= 0 || !/\.vue$/i.test(filename) || filename.startsWith('\0')) {
    return undefined
  }
  const paths = sourcePathApi(root, filename)
  const file = paths.resolve(root, filename)
  const relative = paths.relative(paths.resolve(root), file)
  if (relative === '..' || relative.startsWith(`..${paths.sep}`) || paths.isAbsolute(relative)) {
    return undefined
  }
  if (relative.split(paths.sep).includes('node_modules')) {
    return undefined
  }
  return file
}

export function createUniAppSkylineTypography(context: Pick<ViteFrameworkExtraPluginContext, 'getResolvedConfig' | 'getSkylineTypographyResetCss' | 'isEnabled'>) {
  const sources = new Map<string, SourceRecord>()
  const normalizeSfcSource = (source: string, id: string) => {
    if (!/\.vue$/i.test(id)) {
      return source
    }
    const resetCss = context.isEnabled() ? context.getSkylineTypographyResetCss() : undefined
    if (!resetCss && sources.size === 0) {
      return source
    }
    const file = resolveLocalVueSource(id, context.getResolvedConfig()?.root)
    if (!file) {
      return source
    }
    const previous = sources.get(file)
    // 轻量归属记录跟随模块生命周期，不随源码缓存淘汰；只撤销已登记的首块与精确 payload。
    const original = previous && source.startsWith(previous.prefix) && createHash('sha256').update(source).digest('hex') !== previous.originalRevision
      ? source.slice(previous.prefix.length)
      : source
    if (!resetCss) {
      sources.delete(file)
      return original
    }
    // 必须放在作者样式之前，让同优先级 setter 保留原有层叠顺序。
    const style = `<style ${STYLE_ATTRIBUTE}>\n${resetCss}\n</style>\n`
    const prepared = `${style}${original}`
    sources.set(file, { prefix: style, originalRevision: createHash('sha256').update(original).digest('hex') })
    return prepared
  }
  const plugin: Plugin = {
    name: skylineTypographyPluginName,
    enforce: 'pre',
    transform: {
      order: 'pre',
      handler(source, id) {
        const code = normalizeSfcSource(source, id)
        return code === source ? undefined : { code, map: null }
      },
    },
    handleHotUpdate: {
      order: 'pre',
      async handler(ctx) {
        if (sources.size === 0 && (!context.isEnabled() || !context.getSkylineTypographyResetCss())) {
          return
        }
        if (!resolveLocalVueSource(ctx.file, context.getResolvedConfig()?.root)) {
          return
        }
        const source = await ctx.read()
        const prepared = normalizeSfcSource(source, ctx.file)
        if (prepared !== source) {
          // Vue 的描述符比较先于 transform；两者必须使用相同的 style 块索引。
          ctx.read = async () => prepared
        }
      },
    },
    watchChange(id, change) {
      if (change.event === 'delete') {
        const file = resolveLocalVueSource(id, context.getResolvedConfig()?.root)
        if (file) {
          sources.delete(file)
        }
      }
    },
    closeWatcher() {
      sources.clear()
    },
    closeBundle() {
      const config = context.getResolvedConfig()
      if (config?.command !== 'build' || config.build.watch !== true) {
        sources.clear()
      }
    },
  }
  return { normalizeSfcSource, plugin }
}
