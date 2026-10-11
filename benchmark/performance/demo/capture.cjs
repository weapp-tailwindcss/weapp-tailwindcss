const fs = require('node:fs')
const { Transform } = require('node:stream')

const platformEnvironmentKeys = ['UNI_PLATFORM', 'UNI_UTS_PLATFORM', 'MPX_CLI_MODE', 'MPX_CURRENT_TARGET_MODE', 'TARO_ENV', 'WEAPP_TW_TARGET', 'WEAPP_TAILWINDCSS_TARGET']
function captureEnvironment() {
  // 只记录平台身份，不复制 CI 凭据或消费项目之外的模块搜索路径。
  return Object.fromEntries(platformEnvironmentKeys.map(key => [key, process.env[key] ?? null]))
}

function encode(value) {
  if (value instanceof RegExp) return { $regexp: value.source, flags: value.flags }
  if (typeof value === 'function') {
    // 仅持久化语法上可证明不读取参数、闭包或全局状态的布尔常量函数，不执行配置回调探测结果。
    const source = Function.prototype.toString.call(value).trim()
    const constant = /^(?:\(\s*\)\s*=>\s*(true|false)|(?:\(\s*\)\s*=>|function\s*\(\s*\))\s*\{\s*return\s+(true|false)\s*;?\s*\})$/.exec(source)
    if (constant) return { $constantFunction: (constant[1] ?? constant[2]) === 'true' }
    throw new Error('性能预编译尚不能持久化带闭包的插件配置，拒绝不等价对照')
  }
  if (Array.isArray(value)) return value.map(encode)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encode(item)]))
  return value
}

function record(key, value) {
  const file = process.env.WEAPP_DEMO_COST_CAPTURE
  if (!file) throw new Error('捕获器只允许在准备阶段运行')
  fs.appendFileSync(file, `${JSON.stringify({ key, value: encode(value) })}\n`)
}

function capture(module, name, original, context) {
  if (typeof original !== 'function') return original
  return function (...args) {
    if (['WeappTailwindcss', 'createPlugins', 'StyleInjector'].includes(name)) record('options', { module, options: args[0] ?? {}, environment: captureEnvironment() })
    const result = new.target ? Reflect.construct(original, args) : original(...args)
    if (module.endsWith('/framework') || module.endsWith('/presets')) record(`helper:${name}`, result)
    if (module === 'weapp-style-injector/vite/uni-app' && name === 'StyleInjector') {
      return [result, { name: 'demo-cost:capture-preprocess', async configResolved(config) {
        const { captureAuthoredPreprocessing } = await import(context.authoredPreprocessor)
        // 使用本次构建的真实配置执行预处理，不把框架闭包转换为字符串或丢弃别名。
        record('injector:preprocessed', await captureAuthoredPreprocessing(context.consumer, args[0] ?? {}, config))
      } }]
    }
    return result
  }
}

function decode(value, from, to) {
  if (value?.$regexp) return new RegExp(value.$regexp, value.flags)
  if (typeof value?.$constantFunction === 'boolean') return () => value.$constantFunction
  if (typeof value === 'string') return value.replaceAll(from, to)
  if (Array.isArray(value)) return value.map(item => decode(item, from, to))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, decode(item, from, to)]))
  return value
}

function frameworkCompatibility(records) {
  return records.some(row => row.key === 'options' && row.value.module === 'weapp-tailwindcss/vite'
    && row.value.options.appType === 'taro' && row.value.environment?.TARO_ENV === 'alipay')
    ? ['taro-alipay-browserslist'] : []
}

function disabled(name, records, from, root, specifier = '') {
  if (name === 'WeappTailwindcss' || name === 'StyleInjector') return function () {
    if (new.target || /\/(?:webpack|rspack)(?:\/|$)/.test(specifier)) return { apply() {} }
    if (specifier !== 'weapp-tailwindcss/vite' || !frameworkCompatibility(records).length) return []
    // 保留现有的 Taro 框架兼容处理；不加载发布包，也不生成或转换任何样式。
    return [{ name: 'demo-cost:taro-alipay-framework-compat', enforce: 'pre', generateBundle() {
      this.emitFile({ type: 'asset', fileName: '.browserslistrc', source: 'defaults and fully supports es6-module' })
    } }]
  }
  if (name === 'patchRspackConfig') return value => value
  if (name === 'createPlugins') return () => Object.fromEntries(['adaptWxss', 'generateWxss', 'transformJs', 'transformWxml'].map(key => [key, () => new Transform({ objectMode: true, transform(file, encoding, done) { done(null, file) } })]))
  const helper = records.filter(row => row.key === `helper:${name}`)
  if (helper.length) {
    if (new Set(helper.map(row => JSON.stringify(row.value))).size !== 1) throw new Error(`平台 helper 有多种结果，必须拆分目标：${name}`)
    return () => decode(helper[0].value, from, root)
  }
  throw new Error(`不支持的禁用导出 ${name}`)
}

exports.capture = capture
exports.disabled = disabled
exports.encode = encode
exports.decode = decode
exports.platformEnvironmentKeys = platformEnvironmentKeys
exports.frameworkCompatibility = frameworkCompatibility
exports.captureOptions = options => { record('options', { module: 'weapp-vite', options, environment: captureEnvironment() }); return options }
