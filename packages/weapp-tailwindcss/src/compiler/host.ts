import type { GenerationArtifact } from './types'

/** 构建器向编译核心提供的最小宿主能力。 */
export interface CompilerHost {
  /** 从当前构建图读取源码；无法提供时应返回 undefined。 */
  readSource: (id: string) => string | undefined | Promise<string | undefined>
  /** 解析模块标识，返回值必须是构建器认可的模块 id。 */
  resolveModule?: (specifier: string, importer: string) => string | undefined | Promise<string | undefined>
  /** 获取构建器中的模块元数据。 */
  getModuleInfo?: (id: string) => unknown | undefined | Promise<unknown | undefined>
  /** 监听源码变化，返回取消监听函数。 */
  watchSource?: (listener: (event: CompilerHostSourceEvent) => void) => (() => void) | void
  /** 将编译产物交还给构建器，由构建器决定具体 emit API。 */
  emitArtifact?: (artifact: GenerationArtifact) => void | Promise<void>
}

export interface CompilerHostSourceEvent {
  id: string
  type: 'added' | 'changed' | 'removed'
  source?: string | undefined
}
