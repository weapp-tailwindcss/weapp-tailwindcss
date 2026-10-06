import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import ts from 'typescript'
import { expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

it('独立 Node 编译入口的真实声明不依赖可选 React Native peer', async () => {
  await execa('pnpm', ['--filter', '@weapp-tailwindcss/react-native', 'build'], { cwd: repoRoot })
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-node-types-'))
  try {
    await fs.cp(path.join(repoRoot, 'packages/react-native/dist'), path.join(root, 'package'), { recursive: true })
    await fs.mkdir(path.join(root, 'node_modules/@weapp-tailwindcss'), { recursive: true })
    for (const [name, source] of [['@weapp-tailwindcss/postcss', 'postcss'], ['weapp-tailwindcss', 'weapp-tailwindcss']]) {
      await fs.symlink(path.join(repoRoot, 'packages', source!), path.join(root, 'node_modules', name!), 'junction')
    }
    const file = path.join(root, 'consumer.ts')
    await fs.writeFile(file, `
      import { compileNativeStylesheet } from './package/compiler.js'
      import { generateNativeStylesheet } from './package/tailwind.js'
      import { withWeappTailwindcss } from './package/metro.js'
      const manifest = compileNativeStylesheet('.flex { display: flex }')
      const config = withWeappTailwindcss({}, { manifest })
      const generation = generateNativeStylesheet({ css: '.flex { display: flex }' })
      void [config, generation]
    `)
    const program = ts.createProgram([file], {
      noEmit: true,
      strict: true,
      skipLibCheck: false,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      types: ['node'],
      typeRoots: [path.join(repoRoot, 'node_modules/@types')],
    })
    expect(ts.getPreEmitDiagnostics(program).map(item => ({ file: item.file?.fileName, message: ts.flattenDiagnosticMessageText(item.messageText, '\n') }))).toEqual([])
    expect(ts.resolveModuleName('react-native', file, program.getCompilerOptions(), ts.sys).resolvedModule).toBeUndefined()
  }
  finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}, 60_000)
