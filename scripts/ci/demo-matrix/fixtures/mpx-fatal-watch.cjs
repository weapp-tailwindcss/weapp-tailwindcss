const fs = require('node:fs')
const { createRequire } = require('node:module')
const os = require('node:os')
const path = require('node:path')
const process = require('node:process')
const { compileFunction } = require('node:vm')

const repo = path.resolve(__dirname, '../../../..')
const projectRequire = createRequire(path.join(repo, 'demo', 'mpx-tailwindcss-v4', 'package.json'))
const pluginRequire = createRequire(projectRequire.resolve('@mpxjs/vue-cli-plugin-mpx/package.json'))
const webpack = pluginRequire('webpack')
// Windows 临时目录可能是 8.3 别名，必须让 watcher 与文件事件使用同一条真实路径。
const directory = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mpx-fatal-watch-')))
fs.writeFileSync(path.join(directory, 'entry.js'), 'module.exports = 1')
process.on('exit', () => fs.rmSync(directory, { recursive: true, force: true }))

// 使用实际发布的 CLI 实现和真实 MultiCompiler，只隔离目标配置与终端渲染。
function load(file, overrides) {
  const module = { exports: {} }
  const localRequire = createRequire(file)
  compileFunction(fs.readFileSync(file, 'utf8'), ['require', 'module', 'exports'], { filename: file })(
    id => overrides[id] ?? localRequire(id),
    module,
    module.exports,
  )
  return module.exports
}
const helper = load(pluginRequire.resolve('./utils/webpack'), {
  './reporter': {
    getReporter: () => ({
      _renderStates(states, complete) {
        if (states.some(state => state.hasErrors)) {
          process.stdout.write('recoverable-error\n')
        }
        complete()
      },
    }),
    getLogUpdate: () => ({ stopListen() {} }),
  },
  './output': { extractResultFromStats: () => [] },
})
let multi
let compilations = 0
const fatalRound = process.argv[2] === 'initial' ? 1 : 2
const recoverable = process.argv[2] === 'recoverable'
const { serveMp } = load(pluginRequire.resolve('./commands/serve/mp'), {
  'webpack': (configs) => {
    multi = webpack(configs)
    return multi
  },
  '@mpxjs/cli-shared-utils': { getCurrentTarget: () => ({ mode: 'wx' }) },
  '../../utils/symlink': { symlinkTargetConfig() {} },
  '../../utils/webpack': helper,
  '../../config/index': {
    resolveServeWebpackConfigByTarget: async () => [{
      name: 'fatal-watch-regression',
      context: directory,
      mode: 'development',
      entry: './entry.js',
      output: { path: path.join(directory, 'dist') },
      cache: false,
      plugins: [{
        apply(compiler) {
          compiler.hooks.beforeCompile.tapAsync('FatalWatchRegression', (_, callback) => {
            compilations++
            callback(!recoverable && compilations === fatalRound ? new Error('mpx-fatal-watch-regression') : undefined)
          })
          compiler.hooks.make.tap('RecoverableWatchRegression', (compilation) => {
            if (recoverable && compilations === 2) {
              compilation.errors.push(new Error('recoverable-watch-regression'))
            }
          })
          compiler.hooks.afterDone.tap('RecoverableWatchRegression', () => {
            if (recoverable && compilations === 2) {
              setImmediate(() => compiler.watching.invalidate())
            }
            if (recoverable && compilations === 3) {
              process.stdout.write('recovered\n')
              setImmediate(() => multi.close(() => {}))
            }
          })
        },
      }],
    }],
  },
})
serveMp({ runAfterResolveWebpackCallBack: async () => {} }, { disabledDefaultLinkFile: true }, {})
  .then(() => {
    process.stdout.write('initial-ready\n')
    setImmediate(() => multi.compilers[0].watching.invalidate())
  })
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
