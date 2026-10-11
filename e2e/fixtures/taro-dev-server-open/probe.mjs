import Module, { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'

async function main() {
  const project = path.resolve(process.argv[2])
  const projectRequire = createRequire(path.join(project, 'package.json'))
  const cliRequire = createRequire(projectRequire.resolve('@tarojs/cli/package.json'))
  const defineConfig = cliRequire('./dist/util/defineConfig.js')
  const originalLoad = Module._load

  // 只隔离配置加载不消费的 doctor；defineConfig、Config 和项目依赖均使用真实实现。
  Module._load = function (request, parent, isMain) {
    return request === '@tarojs/cli' ? defineConfig : originalLoad.call(this, request, parent, isMain)
  }
  process.argv.push('--watch')

  try {
    const { Config } = cliRequire('@tarojs/service')
    const config = new Config({ appPath: project, disableGlobalConfig: true })
    await config.init({ command: 'build', mode: 'development' })
    if (!config.isInitSuccess) {
      throw new Error('真实 Taro 配置加载失败。')
    }
    const h5 = config.getConfigWithNamed('h5', 'h5')
    const runnerRequire = createRequire(projectRequire.resolve('@tarojs/webpack5-runner/package.json'))
    const webpack = runnerRequire('webpack')
    const DevServer = runnerRequire('webpack-dev-server')
    const compiler = webpack({ mode: 'development', entry: {} })
    try {
      // Taro 的 H5 runner 在 open 未配置或为 true 时填入服务 URL。
      const options = { ...(h5.devServer ?? {}) }
      if (options.open === undefined || options.open === true) {
        options.open = 'http://127.0.0.1:10086/'
      }
      const server = new DevServer(options, compiler)
      // 不启动服务器或浏览器；校验实际 WDS 消费后的自动打开列表。
      await server.normalizeOptions()
      process.stdout.write(`${JSON.stringify({
        project: path.basename(project),
        browser: process.env.BROWSER ?? null,
        configuredOpen: h5.devServer?.open ?? null,
        normalizedOpen: server.options.open,
      })}\n`)
    }
    finally {
      await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    }
  }
  finally {
    Module._load = originalLoad
  }
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`)
  process.exitCode = 1
})
