import type { WeappTailwindcssGenerator } from 'weapp-tailwindcss/generator'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'

export function resolveFixtureFile(directory: string, name: string, paths = path) {
  if (paths.isAbsolute(name) || path.win32.isAbsolute(name) || path.posix.isAbsolute(name)) {
    throw new Error(`夹具文件不能使用绝对路径：${name}`)
  }
  const file = paths.resolve(directory, name)
  const relative = paths.relative(directory, file)
  if (paths.isAbsolute(relative) || relative === '..' || relative.startsWith(`..${paths.sep}`)) {
    throw new Error(`夹具文件越过独立目录：${name}`)
  }
  return file
}

export async function withGeneratorFixture<T>(root: string, css: string, files: Record<string, string>, run: (generator: WeappTailwindcssGenerator, directory: string) => Promise<T>) {
  const { createWeappTailwindcssGenerator, resolveTailwindV4Source } = await import('weapp-tailwindcss/generator')
  const directory = await mkdtemp(path.join(tmpdir(), 'weapp-tailwind-capability-'))
  let generator: WeappTailwindcssGenerator | undefined
  try {
    await symlink(path.join(root, 'node_modules'), path.join(directory, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    for (const [name, content] of Object.entries({ ...files, 'entry.css': css })) {
      const file = resolveFixtureFile(directory, name)
      await mkdir(path.dirname(file), { recursive: true })
      await writeFile(file, content)
    }
    generator = createWeappTailwindcssGenerator(await resolveTailwindV4Source({ projectRoot: directory, cssEntries: [path.join(directory, 'entry.css')], packageName: 'tailwindcss' }))
    return await run(generator, directory)
  }
  finally {
    generator?.dispose?.()
    await rm(directory, { recursive: true, force: true })
  }
}
