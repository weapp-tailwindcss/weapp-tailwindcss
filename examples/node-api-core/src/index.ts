import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createCompiler } from 'weapp-tailwindcss/core'
import { demoClassNames } from './fixtures'

const projectRoot = fileURLToPath(new URL('..', import.meta.url))
const cssEntry = fileURLToPath(new URL('./app.css', import.meta.url))

export interface DemoResult {
  js: string
  revision: number
  snapshotClassSetSize: number
  wxml: string
  wxss: string
}

export async function runNodeApiCoreDemo(): Promise<DemoResult> {
  const compiler = createCompiler({
    appType: 'native',
  })
  const generated = await compiler.generate({
    candidates: demoClassNames,
    id: cssEntry,
    scanSources: false,
    sourceOptions: {
      cssEntries: [cssEntry],
      projectRoot,
    },
    target: 'web',
  })

  const wxml = await compiler.transformTemplate(
    '<view class="mt-[8px] space-y-2.5"><text class="text-[23.43px] bg-[#123456]">Node API</text></view>',
    generated.snapshot,
  )
  const { css: wxss } = await compiler.transformCss(
    generated.css,
    generated.snapshot,
  )
  const { code: js } = await compiler.transformJavaScript(
    'const classes = ["mb-[1.5rem]", "text-[23.43px]", "not-a-tailwind-token"]',
    generated.snapshot,
  )
  await compiler.dispose()

  return {
    js,
    revision: generated.revision,
    snapshotClassSetSize: generated.snapshot.classSet.size,
    wxml,
    wxss,
  }
}

async function main() {
  const result = await runNodeApiCoreDemo()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main()
}
