import type { HmrContext } from 'vite'
import type { ViteHmrCssModuleVersionTracker } from '@/bundlers/vite/shared/framework-hmr-module-version'
import { normalizeUniAppXImportantApplyForSass } from '@weapp-tailwindcss/postcss/transform'
import { hasUniAppXImportantApply } from './style-source'

interface WebSfcHmrOptions {
  isEnabled: () => boolean
  transform: (source: string, id: string) => Promise<{ code: string } | undefined | null>
  hmrCssModuleVersions: ViteHmrCssModuleVersionTracker | undefined
}

export function createUniAppXWebSfcHmr(options: WebSfcHmrOptions) {
  const sources = new WeakMap<HmrContext, string>()
  function enabled(ctx: HmrContext) {
    return options.isEnabled() && /\.(?:uvue|nvue)$/.test(ctx.file) && typeof ctx.read === 'function'
  }
  return {
    async prepare(ctx: HmrContext) {
      if (!enabled(ctx)) {
        return
      }
      // 在框架 scoped/preprocess 和 Vue 描述符比较之前转换完整 SFC，
      // 使 HMR 描述符与首次 transform 拥有相同的生成 style 块。
      const source = await ctx.read()
      sources.set(ctx, source)
      const result = await options.transform(source, ctx.file)
      ctx.read = async () => result?.code ?? source
    },
    async finish(ctx: HmrContext) {
      if (!enabled(ctx)) {
        return false
      }
      // 完整 SFC 事务取代已排队的 CSS 事务，防止过滤器丢弃当前样式模块。
      options.hmrCssModuleVersions?.clear()
      const source = sources.get(ctx) ?? await ctx.read()
      if (hasUniAppXImportantApply(source, normalizeUniAppXImportantApplyForSass)) {
        ctx.server.ws.send({ type: 'full-reload', path: ctx.file })
        return true
      }
      if (!sources.has(ctx)) {
        await options.transform(source, ctx.file)
      }
      return false
    },
  }
}
