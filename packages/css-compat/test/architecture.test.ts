import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { auditClientBoundaries } from '../../../scripts/architecture/client-boundaries'
import { auditCssCompat } from '../../../scripts/architecture/css-compat'

function fixture(dependencies: Record<string, string>, source: string) {
  const root = fs.mkdtempSync(path.join(tmpdir(), 'css-compat boundary '))
  const pkg = path.join(root, 'packages', 'css-compat')
  fs.mkdirSync(path.join(pkg, 'src'), { recursive: true })
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ dependencies, devDependencies: { 'mdn-data': '2.37.2' } }))
  fs.writeFileSync(path.join(pkg, 'src', 'index.ts'), source)
  try { return auditCssCompat(root) }
  finally { fs.rmSync(root, { recursive: true, force: true }) }
}

describe('轻量内核架构门禁', () => {
  it('客户端运行时入口不引入 CSS 构建内核', () => {
    const root = path.resolve('architecture-fixture')
    const runtime = path.join(root, 'packages-runtime', 'runtime')
    const entry = path.join(runtime, 'src', 'index.ts')
    const layers = path.join(root, 'packages', 'css-compat', 'src', 'layers.ts')
    const errors = auditClientBoundaries(root, [{ name: '@weapp-tailwindcss/runtime', root: runtime, files: [entry], options: {}, dependencies: [], exports: { '.': './dist/index.js' } }], new Map([[entry, new Set([layers])], [layers, new Set<string>()]]))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('客户端引入构建依赖')
  })
  it('允许必要 CSS 依赖以及开发期属性数据', () => {
    expect(fixture({ postcss: '^8.5.29' }, "import type { Root } from 'postcss'\nexport type { Root } from 'postcss'")).toEqual([])
  })
  it.each(['@weapp-tailwindcss/engine', '@weapp-tailwindcss/source-scan', '@tailwindcss/oxide', '@babel/parser', '@weapp-tailwindcss/native-darwin-arm64'])('拒绝安装依赖 %s', (name) => {
    expect(fixture({ [name]: '1.0.0' }, '')[0]).toContain('安装边界违规')
  })
  it.each(["import fs from 'node:fs'", "export type { Options } from '@weapp-tailwindcss/engine'", "const x = require('vite')", "import x from '../../engine/src/index'"])('拒绝生产源码越界 %s', (source) => {
    expect(fixture({}, source).length).toBeGreaterThan(0)
  })
})
