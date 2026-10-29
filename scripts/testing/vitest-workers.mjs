import { availableParallelism } from 'node:os'

// Vitest 的文件项目独立解析配置，根与各项目共同采用此默认并发上限。
export const workspaceMaxWorkers = Math.min(4, availableParallelism())
