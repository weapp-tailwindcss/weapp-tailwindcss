import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { rewriteDeclarationModuleSpecifiers } from './dts-module-specifiers'
import { corePackageRoot } from './paths'

const root = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : corePackageRoot
const distDir = join(root, 'dist')

async function* walk(dir: string): AsyncGenerator<string, void, unknown> {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const filepath = join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walk(filepath)
    }
    else if (/\.d\.[cm]?ts$/.test(entry.name) || entry.name.endsWith('.d.ts')) {
      yield filepath
    }
  }
}

async function main() {
  const declarationFiles = []
  for await (const filepath of walk(distDir)) {
    declarationFiles.push(filepath)
  }
  const declarationFileSet = new Set(declarationFiles)

  for (const filepath of declarationFiles) {
    const content = await readFile(filepath, 'utf8')
    const next = rewriteDeclarationModuleSpecifiers(content, filepath, distDir, declarationFileSet)
    if (next !== content) {
      await writeFile(filepath, next, 'utf8')
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
