import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { createCjsDefaultDeclaration } from './cjs-default-declaration'
import { rewriteDeclarationModuleSpecifiers } from './dts-module-specifiers'

const root = resolve(process.cwd(), process.argv[2] ?? '.')
const dist = join(root, 'dist')

async function* declarationFiles(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const filepath = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* declarationFiles(filepath)
    }
    else if (entry.name.endsWith('.d.ts')) {
      yield filepath
    }
  }
}

async function main() {
  const files: string[] = []
  for await (const filepath of declarationFiles(dist)) {
    files.push(filepath)
  }
  const cjsFiles = new Set(files.map(filepath => `${filepath.slice(0, -5)}.d.cts`))
  for (const filepath of files) {
    if (process.argv.includes('--only-defaults')) {
      break
    }
    const target = `${filepath.slice(0, -5)}.d.cts`
    const content = await readFile(filepath, 'utf8')
    await writeFile(target, rewriteDeclarationModuleSpecifiers(content, target, dist, cjsFiles), 'utf8')
  }
  // 仅显式登记的可调用 CJS 入口使用 export =，命名类型始终引用同一份 ESM 定义。
  for (const entry of process.argv.filter(argument => argument.startsWith('--default=')).map(argument => argument.slice('--default='.length))) {
    const filepath = resolve(dist, `${entry}.d.ts`)
    await writeFile(resolve(dist, `${entry}.d.cts`), createCjsDefaultDeclaration(filepath), 'utf8')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
