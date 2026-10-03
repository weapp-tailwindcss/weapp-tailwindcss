import process from 'node:process'

export function createSpawnEnv(
  base: NodeJS.ProcessEnv,
  extra: Record<string, string> = {},
): NodeJS.ProcessEnv {
  const merged: NodeJS.ProcessEnv = {
    ...base,
    ...extra,
  }
  const sanitized: NodeJS.ProcessEnv = {}

  for (const [key, value] of Object.entries(merged)) {
    if (typeof value !== 'string') {
      continue
    }
    // Windows 内部盘符环境项（如 =C:）会导致 spawn 报 EINVAL。
    if (process.platform === 'win32' && key.includes('=')) {
      continue
    }
    sanitized[key] = value
  }

  return sanitized
}

export function createWatchProcessEnv(base: NodeJS.ProcessEnv, extra: Record<string, string> = {}) {
  const env = createSpawnEnv(base, extra)
  // 子构建应自行选择开发/生产模式，不能继承测试运行器的专用环境。
  for (const key of Object.keys(env)) {
    if (key === 'TEST' || key === 'VITEST' || key.startsWith('VITEST_')) {
      delete env[key]
    }
  }
  for (const key of ['NODE_ENV', 'BABEL_ENV']) {
    if (env[key] === 'test') {
      delete env[key]
    }
  }
  return env
}
