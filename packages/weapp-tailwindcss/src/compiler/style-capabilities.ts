import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'

export type ResolvedGenerationStyleOptions = Partial<IStyleHandlerOptions> & {
  webRpxCompatibility?: boolean | undefined
  /** 框架仍需消费原单位；候选类型纠正保持启用。 */
  deferWebRpxConversion?: boolean | undefined
}

/** 生成内核只读取入口已经解析的样式能力。 */
export function useWebRpxCompatibility(options?: ResolvedGenerationStyleOptions) {
  return options?.webRpxCompatibility === true
}
