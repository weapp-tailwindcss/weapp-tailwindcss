import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import ts from 'typescript'
import { expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))

it('真实发布声明的包解析配置不泄漏第三方工具类型', async () => {
  await execa('pnpm', ['--filter', 'weapp-tailwindcss', 'build'], { cwd: repoRoot })
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-public-types-'))
  try {
    await fs.mkdir(path.join(root, 'node_modules'))
    await fs.symlink(path.join(repoRoot, 'packages/weapp-tailwindcss'), path.join(root, 'node_modules/weapp-tailwindcss'), 'junction')
    const file = path.join(root, 'consumer.ts')
    await fs.writeFile(file, `
      import { resolveTailwindV4SourceFromRuntimeOptions } from 'weapp-tailwindcss/generator'
      import { uniAppX } from 'weapp-tailwindcss/presets'
      for (const platform of ['auto', 'posix', 'win32'] as const) {
        const resolve = { paths: ['.'], platform }
        void resolveTailwindV4SourceFromRuntimeOptions({ tailwindcss: { cwd: '.' } })
        void uniAppX({ base: '.', resolve })
      }
      // @ts-expect-error 平台只接受公开契约中的三个值。
      uniAppX({ base: '.', resolve: { platform: 'linux' } })
      // @ts-expect-error 解析路径必须是字符串数组。
      uniAppX({ base: '.', resolve: { paths: '.' } })
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
  }
  finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}, 60_000)
