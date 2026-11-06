import { mkdtemp, mkdir, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'
import { verifyTemplateTailwindModernGuard } from '../../../../scripts/ci/tailwind-modern-guard.mjs'

it('模板守卫通过嵌套条件加载本轮构建的 PostCSS 双入口', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'template-guard-'))
  const core = fileURLToPath(new URL('../../', import.meta.url))
  try {
    await mkdir(path.join(root, 'node_modules'))
    await symlink(core, path.join(root, 'node_modules/weapp-tailwindcss'), 'junction')
    const manifest = JSON.parse(await readFile(path.resolve(core, '../postcss/package.json'), 'utf8'))
    expect(manifest.exports['.'].import).toHaveProperty('default', './dist/index.js')
    await expect(verifyTemplateTailwindModernGuard(root)).resolves.toEqual({ version: manifest.version })
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})
