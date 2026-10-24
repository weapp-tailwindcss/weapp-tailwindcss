import assert from 'node:assert/strict'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { beforeAll, it } from 'vitest'

const root = fileURLToPath(new URL('../../', import.meta.url))
const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, 'eslint.config.js') })

beforeAll(async () => {
  // 首次查询会加载真实配置及插件图；初始化应由 setup 管理，不计入首个路径合同的超时。
  const config = await eslint.calculateConfigForFile(path.join(root, 'scripts', 'agents', 'check.mjs'))
  assert.ok(config, '仓库维护的脚本必须加载真实 ESLint 配置')
  assert.ok(Object.keys(config.rules ?? {}).length > 0, '真实 ESLint 配置必须包含检查规则')
})

it.each([
  ['packages-runtime', 'ui', 'src', 'index.css'],
  ['website', 'src', 'css', 'tailwind.css'],
])('真实 CSS 配置不得启用 Prettier 格式化规则：%j', async (...segments) => {
  const file = path.join(root, ...segments)
  assert.equal((await stat(file)).isFile(), true, '必须验证仓库中的真实 CSS 文件')
  const config = await eslint.calculateConfigForFile(file)
  // 关闭格式化器后 CSS 可以没有 ESLint 配置；此合同不扩展既有文件检查范围。
  for (const [name, value] of Object.entries(config?.rules ?? {})) {
    if (name === 'format/prettier' || name.endsWith('/prettier')) {
      const severity = Array.isArray(value) ? value[0] : value
      assert.ok(severity === 0 || severity === 'off', `${name} 不得在普通 lint 中调用 Prettier`)
    }
  }
})

it.each([
  ['e2e', 'reports', 'local-full-run', 'run-example', 'runner.mjs'],
  ['e2e', 'reports', 'local-full-run', 'run-example', 'coverage', 'prettify.js'],
  ['submodules', 'tailwindcss-mangle', 'packages', 'core', 'src', 'index.ts'],
  ['packages', 'weapp-tailwindcss', 'native', 'target', 'release', '.fingerprint', 'native', 'lib-native.json'],
  ['packages', 'postcss', 'native', 'target', 'aarch64-apple-darwin', 'debug', '.fingerprint', 'native', 'lib-native.json'],
  ['packages', 'weapp-tailwindcss', 'native', 'target', '.rustc_info.json'],
])('Lint 不扫描生成报告和本地参考源码：%j', async (...segments) => {
  assert.equal(await eslint.isPathIgnored(path.join(root, ...segments)), true)
})

it.each([
  ['scripts', 'agents', 'check.mjs'],
  ['e2e', 'react-native', 'reports.ts'],
  ['packages', 'shared', 'src', 'index.ts'],
  ['packages', 'weapp-tailwindcss', 'native', 'ci.mjs'],
  ['packages', 'shared', 'src', 'target', 'index.ts'],
])('Lint 继续检查仓库维护的实现：%j', async (...segments) => {
  assert.equal(await eslint.isPathIgnored(path.join(root, ...segments)), false)
})
