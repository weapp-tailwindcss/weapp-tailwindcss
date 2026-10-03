import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const { counter, output } = JSON.parse(await readFile(new URL('./fixture.json', import.meta.url), 'utf8'))
await mkdir(path.join(output, 'server'), { recursive: true })
await mkdir(path.join(output, 'public'), { recursive: true })
await writeFile(path.join(output, 'server', 'index.mjs'), 'export default "server"\n')
await writeFile(path.join(output, 'public', 'index.html'), '<main>fixture</main>\n')
await appendFile(counter, 'build\n')
console.log('已生成缓存回归产物')
