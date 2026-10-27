/**
 * 让 Node 脚本的回归测试按实际 CLI 条件解析依赖。
 * @returns {import('vite').Plugin} 仅调整 Node 测试环境的解析插件。
 */
export function createNativeNodeConditionsPlugin() {
  return {
    name: 'native-node-package-conditions',
    enforce: 'post',
    configEnvironment: {
      order: 'post',
      handler(name, config) {
        // Vitest 5 会合并默认条件；合并后再覆盖，避免选中依赖内未编译的 TS。
        if (name === 'ssr' || name === '__vitest__') {
          config.resolve ??= {}
          config.resolve.conditions = ['node']
        }
      },
    },
  }
}
