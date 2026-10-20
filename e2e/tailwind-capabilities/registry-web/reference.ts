import type { RegistryWebProfile } from './profiles'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { registryBaseCss } from './profiles'

const require = createRequire(import.meta.url)

export function registryFixtureCss(profiles: readonly RegistryWebProfile[]) {
  return `${registryBaseCss}\n${profiles.map(item => item.css).join('\n')}`
}

export async function buildRegistryReference(profiles: readonly RegistryWebProfile[]) {
  const { compile } = await import('tailwindcss')
  const [theme, preflight] = await Promise.all([
    readFile(require.resolve('tailwindcss/theme.css'), 'utf8'),
    readFile(require.resolve('tailwindcss/preflight.css'), 'utf8'),
  ])
  const fixtureCss = registryFixtureCss(profiles)
  const input = `@layer theme, base, components, utilities;\n@layer theme {${theme}}\n@layer base {${preflight}\n${fixtureCss}}\n@layer utilities {@tailwind utilities;}`
  const compiler = await compile(input)
  return {
    css: compiler.build([...new Set(profiles.map(item => item.candidate))]),
    fixtureCss,
    productInput: `@import "tailwindcss" source(none);\n@layer base {${fixtureCss}}`,
    identity: {
      oracle: 'isolated-official-tailwindcss-compile',
      themeSha256: createHash('sha256').update(theme).digest('hex'),
      preflightSha256: createHash('sha256').update(preflight).digest('hex'),
      inputSha256: createHash('sha256').update(input).digest('hex'),
    },
  }
}
