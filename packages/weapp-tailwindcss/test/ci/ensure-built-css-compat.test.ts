import fs from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildTargets, resolveTargetStamps, shouldBuild } from '../../../../scripts/ensure-weapp-tailwindcss-built.mjs'

const ownedDirectories: string[] = []
const target = buildTargets.find(item => item.filter === '@weapp-tailwindcss/css-compat')

afterEach(() => {
  for (const directory of ownedDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function fixture() {
  expect(target).toBeDefined()
  const packageRoot = fs.mkdtempSync(path.join(tmpdir(), 'css compat cold build '))
  ownedDirectories.push(packageRoot)
  fs.copyFileSync(path.join(target!.packageRoot, 'package.json'), path.join(packageRoot, 'package.json'))
  const source = path.join(packageRoot, 'src', 'layers.ts')
  fs.mkdirSync(path.dirname(source), { recursive: true })
  fs.writeFileSync(source, 'export const revision = 1\n')
  return { target: { ...target!, packageRoot }, source }
}

function builtFixture() {
  const input = fixture()
  const outputs = resolveTargetStamps(input.target).map((entry: string) => path.join(input.target.packageRoot, entry))
  const before = new Date('2026-01-01T00:00:00Z')
  const built = new Date('2026-01-01T00:00:10Z')
  fs.utimesSync(input.source, before, before)
  for (const output of outputs) {
    fs.mkdirSync(path.dirname(output), { recursive: true })
    fs.writeFileSync(output, 'export {}\n')
    fs.utimesSync(output, built, built)
  }
  return { ...input, outputs }
}

describe('demo 冷构建的独立 CSS 内核依赖', () => {
  it('在 PostCSS 之前刷新 css-compat，确保 facade 可解析', () => {
    const names = buildTargets.map(item => item.filter)
    expect(names.filter(name => name === '@weapp-tailwindcss/css-compat')).toHaveLength(1)
    expect(names.indexOf('@weapp-tailwindcss/css-compat')).toBeLessThan(names.indexOf('@weapp-tailwindcss/postcss'))
  })

  it('干净 checkout 缺少 dist 时需要构建新内核', () => {
    const input = fixture()
    expect(shouldBuild(input.target)).toBe(true)
  })

  it('所有公开入口完整且源码未变时复用产物', () => {
    const input = builtFixture()
    expect(input.outputs).toHaveLength(16)
    expect(shouldBuild(input.target)).toBe(false)
  })

  it('仅内核源码变新时重新构建，即使 PostCSS 自身没有变化', () => {
    const input = builtFixture()
    fs.writeFileSync(input.source, 'export const revision = 2\n')
    const changed = new Date('2026-01-01T00:00:20Z')
    fs.utimesSync(input.source, changed, changed)
    expect(shouldBuild(input.target)).toBe(true)
  })

  it.each(['dist/legacy.cjs', 'dist/layers.d.mts'])('缺少公开入口 %s 时重新构建', (entry) => {
    const input = builtFixture()
    fs.rmSync(path.join(input.target.packageRoot, entry))
    expect(shouldBuild(input.target)).toBe(true)
  })
})
