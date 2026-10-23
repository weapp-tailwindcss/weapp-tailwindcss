import process from 'node:process'

/** 在选择 pnpm 入口前合并实际子进程环境。 */
export function pnpmEnvironment(parent, overrides = {}, inherit = true, platform = process.platform) {
  const entries = new Map()
  for (const source of [inherit ? parent : {}, overrides]) {
    for (const [name, value] of Object.entries(source)) {
      const key = platform === 'win32' ? name.toUpperCase() : name
      if (value === undefined) {
        entries.delete(key)
      }
      else {
        entries.set(key, value)
      }
    }
  }
  return Object.fromEntries(entries)
}
