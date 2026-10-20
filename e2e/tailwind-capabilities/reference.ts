import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

/** 官方编译器只用作隔离测试参考，产品样式仍由 weapp-tailwindcss 生成。 */
export async function defaultReferenceBuilder() {
  const require = createRequire(import.meta.url)
  const { compile } = await import('tailwindcss')
  const theme = await readFile(require.resolve('tailwindcss/theme.css'), 'utf8')
  return async (candidates: string[]) => {
    const reference = await compile(`@layer theme {${theme}}\n@tailwind utilities;`)
    return reference.build(candidates)
  }
}
