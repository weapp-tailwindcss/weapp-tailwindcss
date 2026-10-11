import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { parse, stringify } from 'yaml'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

it.each([
  ['packages', 'postcss'],
  ['tools', 'nested', 'postcss'],
].map(parts => [parts]))('冻结安装保留本地与第三方 calc 的依赖边界：%j', async (parts: string[]) => {
  const workspace = parse(await readFile(path.join(repoRoot, 'pnpm-workspace.yaml'), 'utf8'))
  const manifest = JSON.parse(await readFile(path.join(repoRoot, 'packages/postcss/package.json'), 'utf8'))
  const root = await mkdtemp(path.join(os.tmpdir(), 'pnpm-calc 中文 & '))
  const consumerDir = path.join(root, ...parts)
  const calcDir = path.join(root, 'packages', 'postcss-calc')
  const vendorDir = path.join(root, 'vendor', 'consumer')
  const upstreamDir = path.join(root, 'vendor', 'upstream-calc')

  async function json(dir: string, value: object) {
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, 'package.json'), JSON.stringify(value))
  }
  async function install(...args: string[]) {
    // 从仓库选择当前 pnpm，再切换安装目录，避免 Corepack 选到全局旧版本。
    return execa('pnpm', ['--dir', root, 'install', '--offline', '--ignore-scripts', ...args], {
      cwd: repoRoot,
      env: { CI: '1' },
      timeout: 30_000,
    })
  }

  try {
    await json(root, { name: 'calc-install-regression', private: true })
    await writeFile(path.join(root, 'pnpm-workspace.yaml'), stringify({
      packages: ['packages/*', 'tools/*/*'],
      overrides: workspace.overrides?.['postcss-calc']
        ? { 'postcss-calc': workspace.overrides['postcss-calc'] }
        : {},
    }))
    await json(calcDir, { name: '@weapp-tailwindcss/postcss-calc', version: '1.0.0', main: 'index.cjs' })
    await writeFile(path.join(calcDir, 'index.cjs'), 'module.exports = "workspace-calc"\n')
    // 用离线本地包模拟第三方自带的计算器，测试解析边界，不冒充上游算法测试。
    await json(upstreamDir, { name: 'postcss-calc', version: '8.2.4', main: 'index.cjs' })
    await writeFile(path.join(upstreamDir, 'index.cjs'), 'module.exports = "upstream-calc"\n')
    await json(vendorDir, { name: 'calc-consumer', version: '1.0.0', main: 'index.cjs', dependencies: { 'postcss-calc': 'file:../upstream-calc' } })
    await writeFile(path.join(vendorDir, 'index.cjs'), 'module.exports = require("postcss-calc")\n')
    await json(consumerDir, {
      name: 'postcss-install-consumer',
      private: true,
      dependencies: {
        '@weapp-tailwindcss/postcss-calc': manifest.dependencies['@weapp-tailwindcss/postcss-calc'],
      },
      devDependencies: {
        ...(manifest.devDependencies['postcss-calc'] ? { 'postcss-calc': manifest.devDependencies['postcss-calc'] } : {}),
        // file: 是包管理器的逻辑引用，只有该边界将分隔符统一为斜杠。
        'calc-consumer': `file:${path.relative(consumerDir, vendorDir).split(path.sep).join('/')}`,
      },
    })

    await install('--lockfile-only', '--no-frozen-lockfile')
    const lockfile = path.join(root, 'pnpm-lock.yaml')
    const originalLock = await readFile(lockfile, 'utf8')
    await install('--frozen-lockfile')
    const require = createRequire(path.join(consumerDir, 'package.json'))
    const expected = await realpath(path.join(calcDir, 'index.cjs'))
    expect(await realpath(require.resolve('@weapp-tailwindcss/postcss-calc'))).toBe(expected)
    expect(require('calc-consumer')).toBe('upstream-calc')
    expect(await readFile(lockfile, 'utf8')).toBe(originalLock)

    await rm(path.join(root, 'node_modules'), { recursive: true, force: true })
    await rm(path.join(consumerDir, 'node_modules'), { recursive: true, force: true })
    await install('--frozen-lockfile')
    expect(await realpath(require.resolve('@weapp-tailwindcss/postcss-calc'))).toBe(expected)
    expect(await readFile(lockfile, 'utf8')).toBe(originalLock)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
