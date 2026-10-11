import { logger } from '@weapp-tailwindcss/logger'

export const PATCH_COMMAND_OBSOLETE_NOTICE
  = '提示：weapp-tailwindcss@5 已由构建运行时接管 Tailwind CSS 处理，weapp-tw patch 已无需执行；请移除 package.json 中的 postinstall 钩子。'

export const obsoletePatchCommands = ['extract', 'tokens', 'init', 'migrate', 'restore', 'validate'] as const

export function logPatchCommandObsoleteNotice() {
  logger.warn(PATCH_COMMAND_OBSOLETE_NOTICE)
}

export function logObsoletePatchCommand(command: string) {
  logPatchCommandObsoleteNotice()
  logger.warn(`命令 "${command}" 来自旧版 tailwindcss-patch 工作流，当前版本无需执行。`)
}
