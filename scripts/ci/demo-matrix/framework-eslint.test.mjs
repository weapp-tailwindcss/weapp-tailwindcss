import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { it } from 'vitest'
import { verifyFrameworkEslint } from '../framework-eslint/contracts.mjs'

const repo = fileURLToPath(new URL('../../../', import.meta.url))

it.each([
  'taro-vite-react-tailwindcss-v4',
  'taro-webpack-react-tailwindcss-v4',
  'issue-951-taro-vite-react-tailwindcss-v4',
])('%s 使用局部工具链保留 TS 规则行为', async (name) => {
  await verifyFrameworkEslint(path.join(repo, 'demo', name), 'taro')
}, 15_000)
