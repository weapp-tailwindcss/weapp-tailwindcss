import type { TailwindGenerationSessionPool } from '@/compiler/tailwind-generation-session-pool'
import type { TailwindResolvedSource } from '@/generator/index'
import { compileTailwindAuthorFunctions, createTailwindAuthorFunctionProbe } from '@weapp-tailwindcss/postcss/transform'
import { md5Hash } from '@/cache/md5'

export function createAuthorCssFunctionCompiler(sources: TailwindResolvedSource[], session: TailwindGenerationSessionPool) {
  const cache = new Map<string, string>()
  return (css: string) => {
    return compileTailwindAuthorFunctions(css, async (values) => {
      const missing = [...new Set(values.filter(value => !cache.has(value)))]
      if (missing.length > 0) {
        let selector = `.weapp-author-functions-${md5Hash(missing.join('\0'))}`
        while (sources.some(source => source.css.includes(selector))) {
          selector += '-probe'
        }
        const probe = createTailwindAuthorFunctionProbe(missing, selector)
        let resolved: string[] | undefined
        for (const source of sources) {
          const result = await session.generate({ ...source, css: `${source.css}\n${probe.css}` }, {
            candidates: [],
            scanSources: false,
            incrementalCache: false,
            target: 'web',
          })
          const current = probe.read(result.rawCss)
          if (resolved && current.some((value, index) => value !== resolved![index])) {
            throw new Error('作者样式函数匹配到多个不同的 Tailwind 配置上下文，无法安全回填。')
          }
          resolved = current
        }
        if (!resolved) {
          throw new Error('作者样式函数缺少 Tailwind 编译上下文。')
        }
        missing.forEach((value, index) => cache.set(value, resolved![index]!))
      }
      return values.map(value => cache.get(value)!)
    })
  }
}
