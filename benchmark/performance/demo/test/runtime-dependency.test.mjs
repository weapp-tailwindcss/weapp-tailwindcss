import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { repo } from '../../../../scripts/ci/demo-matrix/catalog.mjs'
import { selectCases } from '../model.mjs'
import { consumerManifest, withoutIntegration } from '../published.mjs'
import { plainRuntimeMarkers } from '../runtime-marker.mjs'

it('三组消费项目固定仓库包管理器，不使用机器上的默认 pnpm', async () => {
  const root = JSON.parse(await readFile(path.join(repo, 'package.json'), 'utf8'))
  const { manifest } = await consumerManifest(selectCases('web/react-webpack-tailwindcss-v4:web')[0], { version: '5.5.11' })
  expect(manifest.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+/)
  expect(manifest.packageManager).toBe(root.packageManager)
  expect(withoutIntegration(manifest).packageManager).toBe(root.packageManager)
})

it('Mpx 样式注入 demo 的三组消费项目声明 Babel 实际生成的 runtime 依赖', async () => {
  const item = selectCases('style-injector-mpx:wx')[0]
  const config = JSON.parse(await readFile(path.join(repo, 'demo', item.name, 'babel.config.json'), 'utf8'))
  // 未启用 corejs 的 transform-runtime 生成 @babel/runtime/helpers 导入。
  expect(config.plugins).toContain('@babel/plugin-transform-runtime')
  const { manifest } = await consumerManifest(item, { version: '5.5.11' })
  for (const consumer of [manifest, withoutIntegration(manifest, { authored: true })]) expect(consumer.dependencies['@babel/runtime']).toMatch(/^7\./)
})

it('所有 Taro RN 消费项目独立声明 Babel 的原生 preset，三组版本一致', async () => {
  for (const item of selectCases().filter(item => item.target === 'rn')) {
    const { manifest } = await consumerManifest(item, { version: '5.5.11' })
    expect(manifest.devDependencies['metro-react-native-babel-preset'], item.id).toMatch(/^0\.77\./)
    expect(withoutIntegration(manifest).devDependencies['metro-react-native-babel-preset']).toBe(manifest.devDependencies['metro-react-native-babel-preset'])
  }
})

it('普通源码保留运行时模板标记的原始字符串语义和导入别名，不依赖已移除的包', async () => {
  const source = 'import { weappTwIgnore as ignore } from "weapp-tailwindcss/escape"; export const value = ignore`h-[1px]\\n`;'
  const original = new Map([['page.ts', source], ['page.vue', `<template><view/></template><script setup>${source}</script><style>.x{color:red}</style>`]])
  const result = await plainRuntimeMarkers(original)
  expect(result.get('page.ts')).toContain('const ignore = String.raw')
  expect(result.get('page.ts')).not.toContain('weapp-tailwindcss/escape')
  const actual = await import(`data:text/javascript,${encodeURIComponent(result.get('page.ts'))}`)
  expect(actual.value).toBe('h-[1px]\\n')
  expect(result.get('page.vue')).toContain('<style>.x{color:red}</style>')
  expect(original.get('page.ts')).toBe(source)
  await expect(plainRuntimeMarkers(new Map([['page.ts', 'import { escape } from "weapp-tailwindcss/escape"']]))).rejects.toThrow('仅支持')
})
