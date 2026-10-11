import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { appRoot } from './paths'

const chromeUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36'

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(target) : Promise.resolve([target])
  }))
  return files.flat().filter(file => /\.[cm]?[jt]sx?$/.test(file))
}

function packageRoot(specifier: string) {
  return path.dirname(fileURLToPath(import.meta.resolve(specifier)))
}

async function downloadNotoSansSubset(text: string, output: string) {
  const query = new URLSearchParams({
    family: 'Noto Sans SC:wght@100..900',
    text,
  })
  const cssResponse = await fetch(`https://fonts.googleapis.com/css2?${query}`, {
    headers: { 'User-Agent': chromeUserAgent },
  })
  if (!cssResponse.ok) {
    throw new Error(`Unable to request Noto Sans SC CSS: ${cssResponse.status} ${cssResponse.statusText}`)
  }
  const css = await cssResponse.text()
  const source = css.match(/src: url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\) format\('woff2'\)/)?.[1]
  if (!source) {
    throw new Error('Google Fonts did not return a WOFF2 source for Noto Sans SC.')
  }
  const fontResponse = await fetch(source)
  if (!fontResponse.ok) {
    throw new Error(`Unable to download Noto Sans SC: ${fontResponse.status} ${fontResponse.statusText}`)
  }
  const font = Buffer.from(await fontResponse.arrayBuffer())
  if (font.subarray(0, 4).toString('ascii') !== 'wOF2') {
    throw new Error('Downloaded Noto Sans SC asset is not a valid WOFF2 file.')
  }
  await fs.writeFile(output, font)
}

async function main() {
  const fontDir = path.join(appRoot, 'src', 'assets', 'fonts')
  const files = await sourceFiles(path.join(appRoot, 'src'))
  const contents = await Promise.all([
    ...files.map(file => fs.readFile(file, 'utf8')),
    fs.readFile(path.join(appRoot, 'lynx-promo-zh.srt'), 'utf8').catch(() => ''),
    fs.readFile(path.join(appRoot, 'lynx-promo-en.srt'), 'utf8').catch(() => ''),
  ])
  const glyphs = [...new Set(contents.join(''))]
    .sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0))
    .join('')

  const notoRoot = packageRoot('@fontsource-variable/noto-sans-sc')
  const monoRoot = packageRoot('@fontsource-variable/jetbrains-mono')
  await fs.mkdir(fontDir, { recursive: true })
  await Promise.all([
    downloadNotoSansSubset(glyphs, path.join(fontDir, 'noto-sans-sc-video-subset.woff2')),
    fs.copyFile(path.join(monoRoot, 'files', 'jetbrains-mono-latin-wght-normal.woff2'), path.join(fontDir, 'jetbrains-mono-latin.woff2')),
    fs.copyFile(path.join(notoRoot, 'LICENSE'), path.join(fontDir, 'OFL-Noto-Sans-SC.txt')),
    fs.copyFile(path.join(monoRoot, 'LICENSE'), path.join(fontDir, 'OFL-JetBrains-Mono.txt')),
  ])
  process.stdout.write(`${JSON.stringify({ fontDir, glyphs: glyphs.length }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
