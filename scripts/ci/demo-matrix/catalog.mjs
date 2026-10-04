import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fg from 'fast-glob'

export const repo = fileURLToPath(new URL('../../../', import.meta.url))
const taroTargets = ['weapp', 'swan', 'alipay', 'tt', 'h5', 'qq', 'jd', 'harmony-hybrid', 'rn']
const uniTargets = ['mp-weixin', 'mp-alipay', 'mp-baidu', 'mp-jd', 'mp-kuaishou', 'mp-lark', 'mp-qq', 'mp-toutiao', 'mp-xhs', 'h5', 'h5:ssr', 'quickapp-webview', 'quickapp-webview-huawei', 'quickapp-webview-union', 'app']
const mini = ['mp-weixin', 'mp-alipay', 'mp-toutiao', 'h5', 'h5:ssr', 'app']

function demo(name, family, targets, source, extra = {}) {
  return { name, family, targets, source, ...extra }
}

export const demos = [
  ...['vite', 'webpack'].flatMap(bundler => ['react', 'vue3'].map(framework =>
    demo(`taro-${bundler}-${framework}-tailwindcss-v4`, 'taro', taroTargets, `src/pages/index/index.${framework === 'react' ? 'tsx' : 'vue'}`, { node22: true, bundler }),
  )),
  demo('issue-951-taro-vite-react-tailwindcss-v4', 'taro', taroTargets, 'src/pages/index/index.tsx', { bundler: 'vite' }),
  demo('subpackage-taro-webpack-react-tailwindcss-v4', 'taro', ['weapp', 'alipay', 'tt', 'h5', 'rn'], 'src/pages/index/index.tsx', { bundler: 'webpack' }),
  demo('uni-app-vite-tailwindcss-v4', 'uni', uniTargets, 'src/pages/index/index.vue', { node22: true }),
  demo('subpackage-uni-app-vite-tailwindcss-v4', 'uni', mini, 'src/pages/index/index.vue'),
  demo('issue-uview-plus-cssentries', 'uni', ['mp-weixin', 'mp-alipay'], 'src/pages/demonstration/index.vue'),
  demo('uni-app-vite-vue3-hbuilderx-tailwindcss-v4', 'uni', ['mp-weixin', 'h5', 'app'], 'pages/index/index.vue', { inputRoot: '.' }),
  demo('uni-app-x-vdom-tailwindcss-v4', 'uni', ['h5'], 'pages/index/index.uvue', { inputRoot: '.' }),
  demo('issue-1144-uni-app-x-web', 'uni', ['h5'], 'pages/index/index.uvue', { inputRoot: '.' }),
  demo('uni-app-x-vapor-tailwindcss-v4', 'hbuilderx', [], undefined, { limitation: '仅有 HBuilderX Harmony 设备 launch；没有独立 CLI 构建或 Web 目标。' }),
  demo('mpx-tailwindcss-v4', 'mpx', ['wx', 'ali', 'swan', 'tt', 'dd'], 'src/pages/index.mpx', { node22: true }),
  demo('gulp-tailwindcss-v4', 'gulp', ['weapp', 'tt'], 'src/pages/index/index.wxml', { node22: true, sourceByTarget: { tt: 'src/pages/index/index.ttml' } }),
  demo('weapp-vite-tailwindcss-v4', 'weapp-vite', ['weapp'], 'pages/index/index.wxml', { node22: true }),
  demo('style-injector-uni-app', 'uni', ['mp-weixin', 'h5'], 'src/sub-normal/pages/index.vue', { route: '/#/sub-normal/pages/index' }),
  demo('style-injector-mpx', 'mpx', ['wx'], 'src/sub-normal/pages/index.mpx'),
  ...['vite', 'webpack'].map(bundler => demo(`style-injector-taro-${bundler}-react`, 'taro', ['weapp', 'h5'], 'src/sub-normal/pages/index/index.tsx', { route: '/#/sub-normal/pages/index/index', bundler })),
  ...['vite', 'webpack', 'rsbuild'].flatMap(bundler => ['react', 'vue'].map(framework =>
    demo(`web/${framework}-${bundler}-tailwindcss-v4`, bundler, ['web', 'weapp'], `src/App.${framework === 'react' ? 'tsx' : 'vue'}`, { node22: bundler === 'rsbuild' && framework === 'react' }),
  )),
  demo('web/vue-vite7-tailwindcss-v4', 'vite', ['web'], 'src/App.vue'),
  demo('web/nuxt-vite-tailwindcss-v4', 'nuxt', ['web'], 'app/pages/index.vue', { node22: true }),
]

export function isWeb(item) {
  return ['web', 'h5', 'h5:ssr', 'harmony-hybrid'].includes(item.target)
}

export function coverage(item) {
  if (item.family === 'taro' && item.target === 'rn') {
    return 'native-build'
  }
  if (['harmony-hybrid', 'app'].includes(item.target)) {
    return 'webview-build'
  }
  return item.name.startsWith('style-injector-') ? 'authored-styles' : 'utilities'
}

export function requiredPhases(item) {
  return ['native-build', 'webview-build'].includes(coverage(item)) ? ['production'] : ['production', 'initial', 'replace', 'add', 'restore', ...(isWeb(item) || item.name.startsWith('web/') ? ['refresh'] : [])]
}

export function commands(item, port = 5173) {
  const { family, target } = item
  const env = { TARO_BUILD_STRICT: '1', UNI_BUILD_STRICT: '1', ...(item.inputRoot ? { UNI_INPUT_DIR: item.inputRoot } : {}) }
  if (family === 'taro') {
    const args = ['exec', 'taro', 'build', '--type', target]
    return { build: args, dev: [...args, '--watch', ...(isWeb(item) ? ['--port', String(port)] : [])], env, output: 'dist' }
  }
  if (family === 'uni') {
    const args = target.startsWith('h5') ? (target === 'h5:ssr' ? ['--ssr'] : []) : ['-p', target]
    return { build: ['exec', 'uni', 'build', ...args], dev: ['exec', 'uni', ...args, ...(isWeb(item) ? ['--host', '127.0.0.1', '--port', String(port), '--strictPort'] : [])], env, output: 'dist' }
  }
  if (family === 'mpx') {
    env.MPX_CURRENT_TARGET_MODE = target
    return { build: ['exec', 'mpx-cli-service', 'build', '--targets', target], dev: ['exec', 'mpx-cli-service', 'serve', '--targets', target], env, output: 'dist' }
  }
  if (family === 'gulp') {
    env.PLATFORM = target
    return { build: ['run', 'build'], dev: ['run', target === 'tt' ? 'dev:tt' : 'dev'], env, output: 'dist' }
  }
  if (family === 'weapp-vite') {
    return { build: ['run', 'build'], dev: ['run', 'dev'], env, output: 'dist' }
  }
  const host = ['--host', '127.0.0.1', '--port', String(port)]
  if (target === 'weapp') {
    env.WEAPP_TW_TARGET = 'weapp'
  }
  if (family === 'vite') {
    return { build: ['exec', 'vite', 'build'], dev: ['exec', 'vite', ...host, '--strictPort'], env, output: 'dist' }
  }
  if (family === 'webpack') {
    return { build: ['exec', 'webpack', '--mode', 'production'], dev: ['exec', 'webpack', 'serve', '--mode', 'development', ...host], env, output: 'dist' }
  }
  if (family === 'rsbuild') {
    return { build: ['exec', 'rsbuild', 'build'], dev: ['exec', 'rsbuild', 'dev', ...host], env, output: 'dist' }
  }
  assert.equal(family, 'nuxt')
  return { build: ['run', 'build'], dev: ['exec', 'nuxt', 'dev', ...host], env, output: '.output' }
}

export const cases = demos.flatMap(item => item.targets.map(target => ({ ...item, source: target === 'rn' ? 'src/pages/index/index.rn.tsx' : item.sourceByTarget?.[target] ?? item.source, target, id: `${item.name}:${target}` })))

export function checkCatalog() {
  const actual = fg.sync('demo/**/package.json', { cwd: repo, ignore: ['**/node_modules/**', '**/dist/**', '**/.output/**', '**/.nuxt/**', '**/unpackage/**'] })
    .map(file => path.posix.dirname(file).slice('demo/'.length))
    .sort()
  assert.deepEqual(demos.map(item => item.name).sort(), actual, 'Every demo must declare host coverage')
  assert.equal(new Set(cases.map(item => item.id)).size, cases.length)
  for (const item of demos) {
    if (item.family === 'taro') {
      assert.ok(['vite', 'webpack'].includes(item.bundler), `Undeclared Taro bundler: ${item.name}`)
    }
    const manifest = JSON.parse(readFileSync(path.join(repo, 'demo', item.name, 'package.json'), 'utf8'))
    assert.ok(item.targets.length || item.limitation, item.name)
    if (item.source) {
      assert.ok(readFileSync(path.join(repo, 'demo', item.name, item.source), 'utf8').length)
    }
    // 目标别名、调试开关与设备 launch 不生成重复的 CLI 验收项。
    const aliases = new Set(['android', 'ios', 'harmony', 'custom', 'debug', 'debug-loader', 'local', 'babel', 'e2e-watch', 'open', '0', '1', 'android:emulator', 'ios:simulator'])
    for (const script of Object.keys(manifest.scripts ?? {})) {
      const match = /^(?:build|dev):(.+)$/.exec(script)
      if (!match || aliases.has(match[1])) {
        continue
      }
      if (item.family === 'hbuilderx' || (item.name.includes('uni-app-x') && match[1] !== 'h5')) {
        continue
      }
      assert.ok(item.targets.includes(match[1]) || (item.family === 'gulp' && match[1] === 'tt'), `Unregistered target ${item.name}:${match[1]}`)
    }
  }
}

export function matrix() {
  checkCatalog()
  const include = []
  for (const demo of demos) {
    for (const node of [24, 22]) {
      for (const os of ['windows-latest', 'macos-latest', 'ubuntu-latest']) {
        const selected = cases.filter(item => item.name === demo.name && (node === 24 || (demo.node22 && item.target === demo.targets[0])))
        for (let offset = 0; offset < selected.length; offset += 4) {
          include.push({ os, node, shard: `${demo.name.replaceAll('/', '-')}-${offset / 4}`, cases: selected.slice(offset, offset + 4).map(item => item.id) })
        }
      }
    }
  }
  assert.ok(include.length > 0 && include.length <= 256)
  return { include }
}
