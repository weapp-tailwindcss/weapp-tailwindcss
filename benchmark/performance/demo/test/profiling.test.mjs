import { expect, it } from 'vitest'
import { withoutProfiling } from '../profiling.mjs'
import { consumerManifest } from '../published.mjs'
import { selectCases } from '../model.mjs'

it('关闭诊断插件而不更改框架插件、业务文本与日志选项；别名按原绑定保留', async () => {
  const source = `import { debugX as debug } from '@weapp-tailwindcss/debug-uni-app-x';
export const plugins = ['framework', ...debug({ cwd: 'project' })];
export const label = '@weapp-tailwindcss/debug-uni-app-x';`
  const next = await withoutProfiling(source, 'vite.config.ts')
  const result = await import(`data:text/javascript,${encodeURIComponent(next)}`)
  expect(result.plugins).toEqual(['framework'])
  expect(result.label).toBe('@weapp-tailwindcss/debug-uni-app-x')
  await expect(withoutProfiling('import { changeOutput } from "@weapp-tailwindcss/debug-uni-app-x"', 'vite.config.ts')).rejects.toThrow('未知诊断 API')
})

it('发布消费清单不安装仓库的额外诊断工具，不移除实际被测生成插件', async () => {
  const { manifest } = await consumerManifest(selectCases('uni-app-x-vdom-tailwindcss-v4:h5')[0], { version: '5.5.11' })
  expect(manifest.devDependencies).not.toHaveProperty('@weapp-tailwindcss/debug-uni-app-x')
  expect(manifest.devDependencies['weapp-tailwindcss']).toBe('5.5.11')
})
