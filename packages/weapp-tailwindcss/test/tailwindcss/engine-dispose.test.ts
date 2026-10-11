import { expect, it } from 'vitest'
import { createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

it('主包释放校验引擎持有的会话', async () => {
  const source = await resolveTailwindV4Source({ css: '@tailwind utilities;', base: process.cwd() })
  const engine = createTailwindV4Engine(source)
  expect(await engine.validateCandidates(['flex'])).toEqual(new Set(['flex']))
  engine.dispose?.()
  await expect(engine.validateCandidates(['grid'])).rejects.toThrow('disposed')
})
