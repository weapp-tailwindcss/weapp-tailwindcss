import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const source = `.nut-fallback {
  height: var(--nutui-48px, 48px);
  width: var(--width, calc(24px + var(--other, 12px)));
  margin: var(--margin, -2px);
  padding: 1rem;
  content: "48px";
  background: var(--image, url("48px.png"));
}
`

// 在独立 Node 进程加载真实产物，避免测试别名将发布入口替换为源码。
const consumer = `
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { pathToFileURL } from 'node:url';
const unitPlugins = ['postcss-pxtrans', 'postcss-rule-unit-converter', 'postcss-plugin-shared', 'postcss-rem-to-responsive-pixel'];
registerHooks({ resolve(specifier, context, nextResolve) {
  if (unitPlugins.some(name => specifier === name || specifier.startsWith(name + '/'))) {
    throw new Error('单位转换实现必须随发布产物打包：' + specifier);
  }
  return nextResolve(specifier, context);
} });
const { createStyleHandler, postcssHtmlTransform } = await import(pathToFileURL(process.argv[1]).href);
const handler = createStyleHandler({
  appType: 'weapp-vite',
  postcssOptions: { plugins: [postcssHtmlTransform({ platform: 'weapp' })] },
  autoprefixer: false,
  cssPresetEnv: { autoprefixer: false },
  cssCalc: false,
  cssPreflight: { border: '0 solid', 'box-sizing': 'border-box', margin: '0', padding: '0' },
  cssRemoveActivePseudoClass: true,
  cssRemoveHoverPseudoClass: true,
  majorVersion: 4,
  cssOptions: { px2rpx: true, rem2rpx: true, cssChildCombinatorReplaceValue: ['view', 'text'] },
});
const result = await handler(readFileSync(0, 'utf8'));
process.stdout.write(JSON.stringify({ css: result.css }));
`

describe('Issue 1318：VPT 配置的发布产物', () => {
  it.each(['index.js', 'index.cjs'])('%s 包含 fallback 修复并生成一致的 static 产物', async (entry) => {
    const output = execFileSync(process.execPath, [
      '--input-type=module',
      '-e',
      consumer,
      path.resolve(__dirname, '../packages/postcss/dist', entry),
    ], { input: source, encoding: 'utf8', timeout: 30_000 })
    const { css } = JSON.parse(output) as { css: string }
    expect(css).toContain('var(--nutui-48px, 48rpx)')
    expect(css).toContain('var(--width, calc(24rpx + var(--other, 12rpx)))')
    expect(css).toContain('var(--margin, -2rpx)')
    expect(css).toContain('padding: 32rpx')
    expect(css).toContain('content: "48px"')
    expect(css).toContain('url("48px.png")')
    await expect(css).toMatchFileSnapshot('./__snapshots__/issue-1318/vpt.css')
  })
})

it('发布类型包含正式依赖的 fallback 配置', () => {
  const filename = path.resolve(__dirname, '../packages/postcss/dist/issue-1318-consumer.ts')
  const source = `
import type { Px2rpxOptions, UserDefinedPostcssOptions } from './types.js';
import { createStyleHandler } from './index.js';
const px: Px2rpxOptions = { transformVarFallbacks: false, designWidth: 375 };
const options: UserDefinedPostcssOptions = { cssOptions: { px2rpx: px } };
createStyleHandler(options);
// @ts-expect-error 配置只接受布尔值。
const invalid: Px2rpxOptions = { transformVarFallbacks: 'false' };
`
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ESNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    types: [],
  }
  const host = ts.createCompilerHost(options)
  const readFile = host.readFile.bind(host)
  const fileExists = host.fileExists.bind(host)
  host.fileExists = file => file === filename || fileExists(file)
  host.readFile = (file) => {
    if (file === filename) {
      return source
    }
    return readFile(file)
  }

  const program = ts.createProgram([filename], options, host)
  const diagnostics = ts.getPreEmitDiagnostics(program)
  expect(diagnostics.map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'))).toEqual([])
})
