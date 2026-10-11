import postcss from 'postcss'
import { consumeCascadeLayers as legacy } from '@weapp-tailwindcss/css-compat/legacy'
import { describe, expect, it } from 'vitest'
import { consumeCascadeLayers } from '../src/transform'

describe('独立 layer 内核的 legacy 接入', () => {
  it('公开 facade 转导出同一个函数', () => {
    expect(consumeCascadeLayers).toBe(legacy)
  })

  it.each([
    ['.x{color:black}@layer a{.x{color:red}}', '.x{color:black}.x{color:red}'],
    ['@layer a,b;@layer a{.x{color:red!important}}@layer b{.x{color:blue!important}}', '.x{color:red!important}.x{color:blue!important}'],
    ['@layer a;@layer a{.x:not(#n){color:red}}', '.x:not(#n){color:red}'],
  ])('旧调用链保持已发布输出 %s', (input, expected) => {
    const root = postcss.parse(input)
    consumeCascadeLayers(root)
    expect(root.toString()).toBe(expected)
  })
})
