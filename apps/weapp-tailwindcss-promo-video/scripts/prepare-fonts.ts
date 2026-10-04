import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { appRoot } from './paths'

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const found = await Promise.all(entries.filter(entry => entry.name !== 'assets').map((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : Promise.resolve(/\.(?:tsx?|json)$/.test(entry.name) ? [file] : [])
  }))
  return found.flat()
}

const files = await sourceFiles(path.join(appRoot, 'src'))
const contents = await Promise.all(files.map(file => fs.readFile(file, 'utf8')))
const glyphs = [...new Set(contents.join(''))].sort((a, b) => a.codePointAt(0)! - b.codePointAt(0)!).join('')
const directory = path.join(appRoot, 'src', 'assets', 'fonts')
await fs.mkdir(directory, { recursive: true })
const query = new URLSearchParams({ family: 'Noto Sans SC:wght@100..900', text: glyphs })
const response = await fetch(`https://fonts.googleapis.com/css2?${query}`, { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36' } })
if (!response.ok) {
  throw new Error(`字体请求失败：${response.status}`)
}
const css = await response.text()
const fontUrl = css.match(/src: url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\) format\('woff2'\)/)?.[1]
if (!fontUrl) {
  throw new Error('未返回 WOFF2 中文字体')
}
const fontResponse = await fetch(fontUrl)
if (!fontResponse.ok) {
  throw new Error(`字体下载失败：${fontResponse.status}`)
}
const font = Buffer.from(await fontResponse.arrayBuffer())
if (font.subarray(0, 4).toString('ascii') !== 'wOF2') {
  throw new Error('字体格式不正确')
}
await fs.writeFile(path.join(directory, 'noto-sans-sc-video-subset.woff2'), font)
for (const [family, license] of [['noto-sans-sc', 'Noto-Sans-SC'], ['jetbrains-mono', 'JetBrains-Mono']]) {
  const root = path.dirname(fileURLToPath(import.meta.resolve(`@fontsource-variable/${family}`)))
  await fs.copyFile(path.join(root, 'LICENSE'), path.join(directory, `OFL-${license}.txt`))
  if (family === 'jetbrains-mono') {
    await fs.copyFile(path.join(root, 'files', 'jetbrains-mono-latin-wght-normal.woff2'), path.join(directory, 'jetbrains-mono-latin.woff2'))
  }
}
await fs.writeFile(path.join(directory, 'glyphs.txt'), glyphs)
console.log(`本地字体已准备，覆盖 ${[...glyphs].length} 个字形。`)
