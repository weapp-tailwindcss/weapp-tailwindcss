import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { corePackageRoot } from './paths'

const root = corePackageRoot

const entryShims = {
  'css-macro.d.ts': { target: './css-macro/index.js', defaultExport: true },
  'framework.d.ts': { target: './framework/index.js' },
  'generator.d.ts': { target: './generator/index.js' },
  'reset.d.ts': { target: './reset/index.js', defaultExport: true },
  'types.d.ts': { target: './types/index.js' },
  // tsdown 将 vite/web 的运行时入口输出到 dist/vite/web.js，
  // TypeScript 则按源码路径生成 dist/vite-web.d.ts，需要补齐公开导出的声明路径。
  'vite/web.d.ts': { target: '../vite-web.js' },
}

async function main() {
  await Promise.all(Object.entries(entryShims).map(async ([filename, { defaultExport = false, target }]) => {
    const filepath = join(root, 'dist', filename)
    await mkdir(dirname(filepath), { recursive: true })
    const content = defaultExport
      ? `export { default } from '${target}'\nexport * from '${target}'\n`
      : `export * from '${target}'\n`
    await writeFile(filepath, content, 'utf8')
  }))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
