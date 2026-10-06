import { runWithCleanup } from './e2e-preflight/cleanup'

interface ProjectAlias {
  projectPath: string
  cleanup: () => Promise<void>
}

/** 确认 IDE 关闭本轮项目后再删除别名，失败时保留恢复入口。 */
export async function closeHBuilderXProjectAlias(alias: ProjectAlias, close: () => Promise<unknown>): Promise<void> {
  try {
    await close()
  }
  catch (error) {
    throw new Error(`HBuilderX 项目关闭失败，保留别名供恢复：${alias.projectPath}`, { cause: error })
  }
  try {
    await alias.cleanup()
  }
  catch (error) {
    throw new Error(`HBuilderX 项目已关闭，但删除别名失败：${alias.projectPath}`, { cause: error })
  }
}

/** 构建与关闭均失败时保留首个异常及清理异常。 */
export function withHBuilderXProjectCleanup<T>(alias: ProjectAlias, action: () => Promise<T>, close: () => Promise<unknown>): Promise<T> {
  return runWithCleanup(action, () => closeHBuilderXProjectAlias(alias, close))
}
