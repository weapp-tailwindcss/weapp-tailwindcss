import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { SourceSideCssEntryOptions } from './source-files'

/** 样式处理选项与构建器持有的来源信息；PostCSS 只消费样式选项。 */
export interface GenerationStyleHandlerOptions extends IStyleHandlerOptions {
  sourceOptions?: SourceSideCssEntryOptions & { requestFile?: string | undefined } | undefined
}

export type { GenerationStyleHandlerOptions as BundlerStyleHandlerOptions }
