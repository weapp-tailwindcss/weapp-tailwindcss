import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { appRoot, outputDir } from './paths'

const frames = [0, 150, 390, 720, 1050, 1410, 1680, 1799]
const locale = process.argv[2] === 'en' ? 'en' : 'zh'
const composition = locale === 'en' ? 'LynxPromoEn' : 'LynxPromoZh'

function renderFrame(frame: number) {
  return new Promise<void>((resolve, reject) => {
    const output = path.join(outputDir, 'frames', locale, `${String(frame).padStart(4, '0')}.png`)
    const browserExecutable = process.env['REMOTION_BROWSER_EXECUTABLE']
    const browserArguments = browserExecutable ? [`--browser-executable=${browserExecutable}`] : []
    const child = spawn('remotion', ['still', 'src/index.ts', composition, output, `--frame=${frame}`, ...browserArguments], { cwd: appRoot, stdio: 'inherit', shell: false })
    child.once('error', reject)
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Frame ${frame} render failed with code ${code}`)))
  })
}

async function main() {
  await fs.mkdir(path.join(outputDir, 'frames', locale), { recursive: true })
  for (const frame of frames) {
    await renderFrame(frame)
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
