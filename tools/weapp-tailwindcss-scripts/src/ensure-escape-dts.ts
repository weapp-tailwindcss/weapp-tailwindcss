import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { corePackageRoot } from './paths'

const DIST_DIR = path.resolve(corePackageRoot, 'dist')

function DECLARATION_TEMPLATE(importPath) {
  return `import type { ITemplateHandlerOptions } from '${importPath}';

export declare const weappTwIgnore: typeof String.raw;
export declare function escape(original: string, options?: ITemplateHandlerOptions): string;

export { isAllowedClassName, unescape } from '@weapp-tailwindcss/escape';
`
}

async function writeDeclaration(filename, importPath) {
  const target = path.resolve(DIST_DIR, filename)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, DECLARATION_TEMPLATE(importPath), 'utf8')
}

async function main() {
  await mkdir(DIST_DIR, { recursive: true })
  await Promise.all([
    writeDeclaration('escape.d.ts', './types.js'),
    writeDeclaration('escape.d.mts', './types.mjs'),
  ])
}

main().catch((error) => {
  console.error('[ensure-escape-dts] failed to write escape declarations')
  console.error(error)
  process.exitCode = 1
})
