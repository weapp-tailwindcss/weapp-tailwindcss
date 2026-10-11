import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { decode } from './capture.cjs'
import { hash, inside } from './published.mjs'
import { isWeb } from '../../../scripts/ci/demo-matrix/catalog.mjs'
import { connectMpxSidecar } from './authored-mpx.mjs'
import { preprocessInjectedCss } from './authored-vite.mjs'
import { connectScriptSidecar } from './authored-script.mjs'

export async function prepareInjectedCss(scope, module, require, preprocessConfig) {
  const css = await readFile(scope.sourceAbsolutePath, 'utf8')
  // Webpack 与 Taro Vite 的 generateSubpackageStyle 均返回原文；只有 uni Vite 显式运行预处理。
  if (module.includes('/webpack/') || module === 'weapp-style-injector/vite/taro' || scope.preprocess === false) return css
  assert.equal(module, 'weapp-style-injector/vite/uni-app', '未知的样式预处理链路')
  if (Array.isArray(preprocessConfig)) {
    const captured = preprocessConfig.filter(row => path.resolve(row.file) === path.resolve(scope.sourceAbsolutePath) && row.inputHash === hash(css))
    assert.equal(captured.length, 1, '缺少本轮输入对应的真实 Vite 预处理证据')
    return captured[0].output
  }
  return preprocessInjectedCss(css, scope.sourceAbsolutePath, require, preprocessConfig)
}

export async function compileAuthored(consumer, records, capturedRoot, sourceFiles) {
  const eligibleSources = new Set(sourceFiles.map(file => path.resolve(consumer.project, file)))
  const require = createRequire(path.join(consumer.project, 'package.json'))
  const injector = require('weapp-style-injector')
  const config = records.filter(row => row.key === 'options')
  assert.equal(config.length, 1, '样式注入静态基线需要唯一配置')
  const options = decode(config[0].value.options, capturedRoot, consumer.project)
  const preprocessConfig = records.filter(row => row.key === 'injector:preprocessed')
  assert.ok(preprocessConfig.length <= 1, '同一目标存在多套样式预处理配置')
  const root = path.join(consumer.project, 'src')
  const scopes = consumer.item.family === 'uni'
    ? injector.resolveUniAppStyleScopes({ ...options, pagesJsonPath: path.join(root, 'pages.json') })
    : consumer.item.family === 'taro'
      ? injector.resolveTaroSubPackages({ ...options, appConfigPath: path.join(root, 'app.config.ts') })
      : injector.resolveMpxSubPackages({ ...options, appPath: path.join(root, 'app.mpx') })
  assert.ok(scopes.length, '发布版注入器没有解析到样式作用域')
  const additions = new Map()
  for (const scope of scopes) {
    assert.ok(inside(consumer.project, scope.sourceAbsolutePath), '注入来源越界')
    assert.ok(!scope.referenceFileName, '引用型注入需要单独验证其样式生成语义')
    const css = await prepareInjectedCss(scope, config[0].value.module, require, decode(preprocessConfig[0]?.value, capturedRoot, consumer.project))
    const targets = [...(scope.targetSourceFiles ?? []), ...(scope.sourceModules ?? [])]
    assert.ok(targets.length, '注入作用域没有源码目标映射，拒绝猜测输出关系')
    for (const target of targets) {
      // 发布版扫描还会返回页面配置模块；它们不属于可消费样式的组件源码。
      if (!eligibleSources.has(path.resolve(target.sourceAbsolutePath))) continue
      const name = target.styleFileName ?? target.fileName.slice(0, -path.posix.extname(target.fileName).length)
      const output = `${name}${isWeb(consumer.item) ? '.css' : '.wxss'}`
      if (!injector.isFileMatchedBySubpackageScope(output, scope) || !injector.isSourceFileMatchedBySubpackageScope(target.fileName, scope)) continue
      const file = target.sourceAbsolutePath
      assert.ok(inside(consumer.project, file), '注入目标越界')
      const list = additions.get(file) ?? new Set()
      list.add(css)
      additions.set(file, list)
    }
  }
  const result = new Map()
  for (const [file, styles] of additions) {
    const relative = path.relative(consumer.project, file)
    const source = result.get(relative) ?? await readFile(file, 'utf8')
    const css = [...styles].join('\n')
    if (/\.(?:vue|mpx)$/.test(file)) result.set(relative, `${source}\n<style>\n${css}\n</style>\n`)
    else if (/\.(?:css|scss|sass|less)$/.test(file)) {
      result.set(relative, `${css}\n${source}`)
      if (consumer.item.family === 'mpx') await connectMpxSidecar(result, consumer.project, file, sourceFiles)
      if (consumer.item.family === 'taro') await connectScriptSidecar(result, consumer.project, file, sourceFiles)
    }
    else {
      assert.match(file, /\.(?:tsx|jsx|ts|js)$/)
      const styleFile = `${file}.cost.css`
      result.set(path.relative(consumer.project, styleFile), css)
      result.set(relative, `import './${path.basename(styleFile)}'\n${source}`)
    }
  }
  return result
}
