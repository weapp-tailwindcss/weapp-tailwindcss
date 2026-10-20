import type { AuthoringWebProfile } from './profiles'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

export interface AuthoringReference {
  css: string
  baselineCss: string
  identity: { oracle: string, inputSha256: string, candidates: string[] }
}

/** 只消费预先声明的候选与固定指令；不接受产品 CSS 或扫描结果。 */
export async function buildAuthoringReference(profile: AuthoringWebProfile): Promise<AuthoringReference | undefined> {
  if (!profile.official) {
    return undefined
  }
  const require = createRequire(import.meta.url)
  const { compile } = await import('tailwindcss')
  const [theme, preflight] = await Promise.all([
    readFile(require.resolve('tailwindcss/theme.css'), 'utf8'),
    readFile(require.resolve('tailwindcss/preflight.css'), 'utf8'),
  ])
  const baselineInput = `@layer theme,base,components,utilities;\n@layer theme {${theme}}\n@layer base {${preflight}}`
  const input = `${baselineInput}\n@layer utilities {@tailwind utilities;}\n${profile.official.directive ?? ''}`
  const baseline = await compile(baselineInput)
  const reference = await compile(input)
  const control = profile.official.control ?? ''
  return {
    css: `${reference.build(profile.official.candidates)}\n${control}`,
    baselineCss: baseline.build([]),
    identity: { oracle: control ? 'isolated-official-tailwindcss-compile-with-declared-negative-control' : 'isolated-official-tailwindcss-compile', inputSha256: createHash('sha256').update(`${input}\n${control}`).digest('hex'), candidates: [...profile.official.candidates] },
  }
}
