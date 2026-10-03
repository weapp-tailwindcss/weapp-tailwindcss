import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import ts from 'typescript'
import { expect, it } from 'vitest'

const root = fileURLToPath(new URL('..', import.meta.url))

it('共享会话检查器验证当前 callback 事务结构', async () => {
  const { stdout } = await execa(process.execPath, ['--import', 'tsx', 'scripts/check-e2e-ide-shared-launch.ts'], { cwd: root, timeout: 10_000 })
  expect(stdout).toContain('shared automator launch contract passed')
})

function unsafeImports(text: string) {
  const source = ts.createSourceFile('entry.ts', text, ts.ScriptTarget.Latest, true)
  const unsafe: string[] = []
  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)
      && /miniprogram-automator/.test(node.moduleSpecifier.text) && !node.importClause?.isTypeOnly) {
      unsafe.push(node.getText(source))
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
      && node.arguments.some(arg => ts.isStringLiteral(arg) && /miniprogram-automator/.test(arg.text))) {
      unsafe.push(node.getText(source))
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return unsafe
}

function processCalls(text: string, functionName?: string) {
  const source = ts.createSourceFile('entry.ts', text, ts.ScriptTarget.Latest, true)
  const calls: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && /^(?:command|execa|exec|execFile|spawn|spawnSync|execSync)$/.test(node.expression.getText(source))) {
      calls.push(node.getText(source))
    }
    ts.forEachChild(node, visit)
  }
  if (functionName) {
    source.forEachChild((node) => {
      if (ts.isFunctionDeclaration(node) && node.name?.text === functionName) {
        visit(node)
      }
    })
  }
  else {
    visit(source)
  }
  return calls
}

function unsafeWechatLaunches(text: string) {
  const source = ts.createSourceFile('entry.ts', text, ts.ScriptTarget.Latest, true)
  const unsafe: string[] = []
  function visit(node: ts.Node) {
    if (ts.isArrayLiteralExpression(node)) {
      const args = node.elements.map(element => ts.isStringLiteralLike(element) ? element.text : undefined)
      const launch = args.indexOf('launch')
      if (launch >= 0 && args[launch + 1] === 'mp-weixin') {
        const compile = args.indexOf('--compile', launch + 2)
        // 参数必须显式且唯一；变量、条件表达式或重复覆盖都不能证明只编译。
        if (compile < 0 || args[compile + 1] !== 'true' || args.lastIndexOf('--compile') !== compile
          || node.elements.some(ts.isSpreadElement)) {
          unsafe.push(node.getText(source))
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return unsafe
}

it('规则识别静态导入、别名、动态导入与 require，允许纯类型导入', () => {
  expect(unsafeImports('import { Launcher as L } from \'@weapp-vite/miniprogram-automator\'')).toHaveLength(1)
  expect(unsafeImports('import(\'@weapp-vite/miniprogram-automator\')')).toHaveLength(1)
  expect(unsafeImports('require(\'miniprogram-automator\')')).toHaveLength(1)
  expect(unsafeImports('import type { MiniProgram } from \'@weapp-vite/miniprogram-automator\'')).toEqual([])
})

it('规则拒绝 HBuilderX 中转微信启动，缺省、变量及覆盖参数均不能放行', () => {
  for (const args of [
    '["launch", "mp-weixin"]',
    '["launch", "mp-weixin", "--compile", "false"]',
    '["launch", "mp-weixin", "--compile", compileOnly ? "true" : "false"]',
    '["launch", "mp-weixin", "--compile", "true", "--compile", "false"]',
    '["launch", "mp-weixin", "--compile", "true", ...options]',
    '["exec", "hbuilderx", "launch", "mp-weixin", "--compile", "false"]',
  ]) {
    expect(unsafeWechatLaunches(`wrapper.spawn({ args: ${args} })`), args).toHaveLength(1)
  }
  expect(unsafeWechatLaunches('wrapper.spawn({ args: ["launch", "mp-weixin", "--compile", "true"] })')).toEqual([])
  expect(unsafeWechatLaunches('wrapper.spawn({ args: ["launch", "app-android", "--compile", "false"] })')).toEqual([])
})

it('微信预检、连接与清理没有子进程启动入口，防止恢复 islogin 冷启动', async () => {
  expect(processCalls('async function wechat(){ await command(cli, ["islogin"]) }', 'wechat')).toHaveLength(1)
  for (const file of ['scripts/wechat/service.ts', 'scripts/wechat/automator.ts', 'scripts/wechat-project-cleanup.ts', 'scripts/e2e-preflight/probes/desktop.ts']) {
    expect(processCalls(await readFile(path.resolve(root, file), 'utf8'), file.endsWith('desktop.ts') ? 'wechat' : undefined), file).toEqual([])
  }
})

it('自动扫描全部 E2E 与脚本，只有会话边界及其 mock 回归能值导入原始 automator', async () => {
  const { stdout } = await execa('git', ['ls-files', '-co', '--exclude-standard', '-z', '--', 'e2e', 'scripts'], { cwd: root })
  const allowed = new Set(['scripts/wechat/automator.ts', 'e2e/wechat-automator.test.ts'])
  const files = [...new Set(stdout.split('\0').filter(file => /\.[cm]?[jt]s$/.test(file) && !allowed.has(file)))]
  const violations = (await Promise.all(files.map(async file => unsafeImports(await readFile(path.resolve(root, file), 'utf8')).map(item => `${file}: ${item}`)))).flat()
  expect(violations, '请使用 scripts/wechat/automator；禁止 CLI 冷启动、注销与票据重置。').toEqual([])
  const indirectLaunches = (await Promise.all(files.map(async file => unsafeWechatLaunches(await readFile(path.resolve(root, file), 'utf8')).map(item => `${file}: ${item}`)))).flat()
  expect(indirectLaunches, 'HBuilderX 中转同样会启动微信 CLI；仅允许显式 --compile true，watch 必须与 IDE 启动解耦。').toEqual([])
})
