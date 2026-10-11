import { createRequire } from 'node:module'
import path from 'node:path'
import { parseSync } from '@babel/core'
import { expect, it } from 'vitest'
import { repo } from '../../../../scripts/ci/demo-matrix/catalog.mjs'
import { compileTemplateExpressions } from '../template-expressions.mjs'

const require = createRequire(path.join(repo, 'demo/web/vue-vite7-tailwindcss-v4/package.json'))
const { compileTemplate, parse } = require('vue/compiler-sfc')
const compiler = { transformJavaScript(source, snapshot, options) {
  parseSync(source, { configFile: false, babelrc: false, parserOpts: options.babelParserOptions })
  return { code: source.replaceAll('p-[24px]', 'p-_b24px_B') }
} }

it('动态 Vue 类表达式保留变量、模板字面量和实体，在真实 SFC 编译后消费安全类名', async () => {
  const source = '<div v-for="item in rows" :class="`${item} p-[24px]`" :title="\'a &amp; b\'"><span>{{ ok ? \'p-[24px]\' : text }}</span></div>'
  const result = await compileTemplateExpressions(compiler, source, {}, 'App.vue')
  const compiled = compileTemplate({ source: result, filename: 'App.vue', id: 'fixture' })
  expect(compiled.errors).toEqual([])
  expect(compiled.code).toContain('${item} p-_b24px_B')
  expect(compiled.code).toContain('a & b')
  expect(compiled.code).not.toContain('p-[24px]')
  expect(result).toContain('v-for="item in rows"')
  expect(parse(`<template>${result}</template>`).errors).toEqual([])
})

it('表达式解析失败不能被当作静态转换成功', async () => {
  await expect(compileTemplateExpressions({ transformJavaScript: () => ({ code: '', error: new Error('parse failed') }) }, '<div :class="value"/>', {}, 'App.vue')).rejects.toThrow('静态源码转换失败')
})
