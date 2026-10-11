import type { Plugin } from 'vite'
import path from 'node:path'
import { logger } from '@weapp-tailwindcss/logger'
import { parseTailwindCssDirectiveRequest, postcss } from '@weapp-tailwindcss/postcss/transform'
import { isSourceStyleRequest } from '../../../generation/style-requests'
import { resolveViteModuleIdentity } from '../module-identity'

const WINDOWS_ABSOLUTE_PATH_RE = /^[a-z]:[\\/]/i

interface ConfiguredCssEntryObserverOptions {
  delayMs?: number
  getEntries: () => string[] | undefined
  getRoot: () => string | undefined
  onMissing: (entries: string[]) => void
}

export function createConfiguredCssEntryObserver(options: ConfiguredCssEntryObserverOptions) {
  const observedEntries = new Set<string>()
  let checkRequested = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let warned = false

  const resolveEntry = (entry: string) => resolveViteModuleIdentity(entry, options.getRoot()).key
  const observeImport = (request: string, sourceId: string) => {
    if (!request.startsWith('.') && !path.isAbsolute(request) && !WINDOWS_ABSOLUTE_PATH_RE.test(request)) {
      return
    }
    const sourceFile = resolveViteModuleIdentity(sourceId, options.getRoot()).file
    if (!sourceFile) {
      return
    }
    const pathApi = WINDOWS_ABSOLUTE_PATH_RE.test(sourceFile) ? path.win32 : path
    observedEntries.add(resolveEntry(pathApi.resolve(pathApi.dirname(sourceFile), request)))
  }
  const clearTimer = () => {
    if (timer !== undefined) {
      clearTimeout(timer)
      timer = undefined
    }
  }
  const missingEntries = () => options.getEntries()?.filter(entry => !observedEntries.has(resolveEntry(entry))) ?? []
  const check = () => {
    clearTimer()
    if (!checkRequested || warned) {
      return
    }
    const missing = missingEntries()
    if (missing.length === 0) {
      return
    }
    warned = true
    options.onMissing(missing)
  }

  return {
    dispose() {
      clearTimer()
    },
    flush: check,
    observe(id: string) {
      observedEntries.add(resolveEntry(id))
      if (checkRequested && missingEntries().length === 0) {
        clearTimer()
      }
    },
    observeSourceImports(source: string, sourceId: string) {
      if (!source.includes('@import')) {
        return
      }
      try {
        postcss.parse(source).walkAtRules('import', (rule) => {
          const request = parseTailwindCssDirectiveRequest(rule.params)
          if (request) {
            observeImport(request, sourceId)
          }
        })
      }
      catch {}
    },
    requestCheck() {
      if (warned) {
        return
      }
      checkRequested = true
      clearTimer()
      timer = setTimeout(check, options.delayMs ?? 1000)
    },
  }
}

export function createConfiguredCssEntryDiagnostics(options: {
  getEntries: () => string[] | undefined
  getRoot: () => string | undefined
  isWeb: () => boolean
}) {
  const observer = createConfiguredCssEntryObserver({
    getEntries: options.getEntries,
    getRoot: options.getRoot,
    onMissing(entries) {
      logger.warn(
        '[uni-app-x Web] cssEntries 中的 Tailwind CSS 入口未进入 Web 样式构建链路：%s。componentLocalStyles 已生成 wtu-* 局部类，但入口中的 @theme/CSS 变量不会投递到浏览器。请在 App.uvue 或应用入口中显式 import 这些 CSS 文件。',
        entries.join(', '),
      )
    },
  })
  const plugin: Plugin = {
    name: 'weapp-tailwindcss:configured-css-entry-observer',
    transform(_code, id) {
      if (options.isWeb() && isSourceStyleRequest(id)) {
        observer.observe(id)
      }
    },
  }
  return { observer, plugin }
}
