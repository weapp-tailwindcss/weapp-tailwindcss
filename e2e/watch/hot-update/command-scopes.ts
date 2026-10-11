interface CommandScopeOptions {
  splitSubPackageWatchSessions: boolean
  requestedScope: string | undefined
  webOnly: boolean
  mainStyleOnly: boolean
}

/** 独立 watch 会话使用各自命令预算，单次热更新的性能断言保持不变。 */
export function resolveWatchCommandScopes(options: CommandScopeOptions): Array<string | undefined> {
  if (options.splitSubPackageWatchSessions && !options.requestedScope && !options.webOnly && !options.mainStyleOnly) {
    return ['main-package', 'subpackages']
  }
  return [options.requestedScope]
}
