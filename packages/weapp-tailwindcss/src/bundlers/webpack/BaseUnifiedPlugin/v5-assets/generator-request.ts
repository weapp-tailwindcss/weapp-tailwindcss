import type { WebpackCssHandlerOptions } from './pipeline-helpers/preflight-runtime'
import type { GenerationStyleHandlerOptions } from '@/generation/style-options'
import type { InternalUserDefinedOptions } from '@/types'
import { sourcePathApi } from '@weapp-tailwindcss/source-scan'
import { normalizeWebpackGeneratorCssSources } from './pipeline-helpers/sources'

type WebpackGeneratorSourceOptions = Partial<Pick<InternalUserDefinedOptions, 'cssEntries' | 'tailwindcss'>>
type WebpackGeneratorStyleHandlerOptions = GenerationStyleHandlerOptions & Pick<WebpackCssHandlerOptions, 'sourceOptions'>

function selectCssEntries(
  compilerOptions: WebpackGeneratorSourceOptions,
  sourceFile: string | undefined,
  disableUnmatchedCssEntries: boolean,
) {
  const entryGroups = [compilerOptions.cssEntries, compilerOptions.tailwindcss?.v4?.cssEntries]
  if (sourceFile) {
    for (const entries of entryGroups) {
      const matches = entries?.filter((entry) => {
        const pathApi = sourcePathApi(sourceFile, entry)
        return pathApi.resolve(entry) === pathApi.resolve(sourceFile)
      })
      if (matches?.length) {
        return matches
      }
    }
  }
  return disableUnmatchedCssEntries && entryGroups.some(entries => entries?.length) ? [] : undefined
}

/** CSS 来源筛选属于当前请求，不能改变共享编译会话的配置版本。 */
export function createWebpackGeneratorRequestOptions<T extends WebpackGeneratorSourceOptions>(
  compilerOptions: T,
  cssHandlerOptions: WebpackGeneratorStyleHandlerOptions,
  sourceFile: string | undefined,
  options: { disableUnmatchedCssEntries?: boolean | undefined } = {},
) {
  const cssEntries = cssHandlerOptions.sourceOptions?.cssEntries?.slice()
    ?? selectCssEntries(compilerOptions, sourceFile, options.disableUnmatchedCssEntries === true)
  const cssSources = normalizeWebpackGeneratorCssSources(cssHandlerOptions.sourceOptions?.cssSources)
  return {
    opts: compilerOptions,
    cssHandlerOptions: cssEntries === undefined && cssSources === undefined
      ? cssHandlerOptions
      : {
          ...cssHandlerOptions,
          sourceOptions: {
            ...cssHandlerOptions.sourceOptions,
            ...(cssEntries === undefined ? {} : { cssEntries }),
            ...(cssSources === undefined ? {} : { cssSources }),
          },
        },
    ...(cssSources === undefined ? {} : { cssSources }),
  }
}
