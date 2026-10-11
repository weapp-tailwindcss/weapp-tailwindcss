const path = require('node:path')
const { createRequire } = require('node:module')

module.exports = async function createTaroMetroConfig(projectRoot) {
  const requireFromDemo = createRequire(path.join(projectRoot, 'package.json'))
  const { getDefaultConfig, mergeConfig } = requireFromDemo('@react-native/metro-config')
  const { getMetroConfig } = requireFromDemo('@tarojs/rn-supporter')
  const config = mergeConfig(getDefaultConfig(projectRoot), await getMetroConfig({}, {
    projectRoot,
    // Taro 会按当前项目配置改写共享入口，转换缓存不能跨 demo 复用。
    cacheVersion: projectRoot,
    watchFolders: [path.resolve(projectRoot, '../..')],
    resolver: {
      resolveRequest(context, moduleName, platform) {
        // pnpm 的传递依赖可带有不同 RN peer；整个应用使用当前 demo 的原生运行时。
        const singleton = /^(?:react|react-native)(?:\/|$)/.test(moduleName)
        try {
          return context.resolveRequest(context, singleton ? requireFromDemo.resolve(moduleName) : moduleName, platform)
        }
        catch (error) {
          throw new Error(`Metro resolution failed: ${context.originModulePath} -> ${moduleName}`, { cause: error })
        }
      },
      extraNodeModules: new Proxy({}, {
        get: (_target, name) => path.join(projectRoot, 'node_modules', name),
      }),
    },
  }))
  // Taro 返回的空数组会被 Metro 编译为匹配所有文件的空正则。
  if (Array.isArray(config.resolver.blockList) && config.resolver.blockList.length === 0) {
    config.resolver.blockList = undefined
  }
  return config
}
