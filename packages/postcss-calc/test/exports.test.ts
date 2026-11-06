import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { assert, test } from 'vitest'

const require = createRequire(import.meta.url)

test('CommonJS 自引用入口指向构建产物', () => {
  const resolved = require.resolve('@weapp-tailwindcss/postcss-calc')
  const mod = require('@weapp-tailwindcss/postcss-calc')

  assert.strictEqual(resolved, path.resolve(import.meta.dirname, '../dist/index.cjs'))
  assert.strictEqual(typeof mod, 'function')
  assert.strictEqual(mod.postcss, true)
})

test('ESM 默认导出与 CommonJS 插件函数保持一致', () => {
  const result = execFileSync(process.execPath, ['--input-type=module', '-e', `
    import calc from '@weapp-tailwindcss/postcss-calc';
    if (typeof calc !== 'function' || calc.postcss !== true || calc().postcssPlugin !== 'postcss-calc') {
      throw new Error('ESM 插件入口不兼容');
    }
  `], { cwd: path.resolve(import.meta.dirname, '..'), encoding: 'utf8' })
  assert.strictEqual(result, '')
})

test.each(['mts', 'cts'])('NodeNext .%s 消费取得可调用插件与精确选项类型', (extension) => {
  const filename = path.resolve(import.meta.dirname, `../consumer.${extension}`)
  const source = extension === 'mts'
    ? `import calc, { type PostCssCalcOptions } from '@weapp-tailwindcss/postcss-calc';
       const options: PostCssCalcOptions = { preserve: true };
       calc(options); const marker: true = calc.postcss;
       // @ts-expect-error 选项必须保持布尔类型。
       calc({ preserve: 'yes' });`
    : `import calc = require('@weapp-tailwindcss/postcss-calc');
       const options: calc.PostCssCalcOptions = { preserve: true };
       calc(options); const marker: true = calc.postcss;
       // @ts-expect-error 选项必须保持布尔类型。
       calc({ preserve: 'yes' });`
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ESNext,
    noEmit: true,
    strict: true,
    skipLibCheck: false,
    types: [],
  }
  const host = ts.createCompilerHost(options)
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  host.readFile = file => path.resolve(file) === filename ? source : readFile(file)
  host.fileExists = file => path.resolve(file) === filename || fileExists(file)
  const program = ts.createProgram([filename], options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  assert.deepEqual(diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')), [])
})
