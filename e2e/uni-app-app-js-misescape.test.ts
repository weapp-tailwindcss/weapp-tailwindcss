import { promises as fs } from 'node:fs'
import path from 'node:path'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'

const repoRoot = path.resolve(__dirname, '..')
const projectRoot = path.resolve(repoRoot, 'demo/uni-app-vite-tailwindcss-v4')
const packageName = '@weapp-tailwindcss-demo/uni-app-vite-tailwindcss-v4'
const snapshotPath = path.resolve(__dirname, '__snapshots__/uni-app-app-js-misescape/output.txt')

function reportOutputPath(root: string, output: string, pathApi = path) {
  // 快照记录的是产物标识；先按文件系统规则求相对路径，再转成统一的逻辑路径。
  return pathApi.relative(pathApi.resolve(root), pathApi.resolve(root, output)).split(pathApi.sep).join('/')
}

async function collectJavaScript(root: string) {
  const entries = await fs.readdir(root, { recursive: true, withFileTypes: true })
  const files = entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => path.join(entry.parentPath, entry.name))
    .sort()
  return (await Promise.all(files.map(file => fs.readFile(file, 'utf8')))).join('\n')
}

async function build(platform: 'app' | 'h5') {
  await execa('pnpm', ['--filter', packageName, `build:${platform}`], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NO_COLOR: '1',
    },
  })
  const outputRoot = path.resolve(projectRoot, 'dist/build', platform)
  return {
    code: await collectJavaScript(outputRoot),
    outputRoot,
  }
}

describe('uni-app App business string translation', () => {
  it.each([
    { pathApi: path.posix, root: '/repo', output: '/repo/demo/dist/app' },
    { pathApi: path.posix, root: '/', output: '/demo/dist/app' },
    { pathApi: path.posix, root: '/repo', output: 'demo/dist/app' },
    { pathApi: path.win32, root: 'C:\\repo', output: 'C:\\repo\\demo\\dist\\app' },
    { pathApi: path.win32, root: 'C:\\', output: 'C:\\demo\\dist\\app' },
    { pathApi: path.win32, root: 'C:\\repo', output: 'demo\\dist\\app' },
    { pathApi: path.win32, root: '\\\\server\\repo', output: '\\\\server\\repo\\demo\\dist\\app' },
  ])('产物标识不依赖运行系统的路径分隔符：$root / $output', ({ pathApi, root, output }) => {
    expect(reportOutputPath(root, output, pathApi)).toBe('demo/dist/app')
  })

  it('preserves Vuex actions in App and H5 while App escapes generated classes', async () => {
    const app = await build('app')
    const h5 = await build('h5')

    expect(app.code).toContain('user/getUserInfo')
    expect(app.code).not.toContain('user_fgetUserInfo')
    expect(app.code).toContain('text-_b45rpx_B')
    expect(h5.code).toContain('user/getUserInfo')
    expect(h5.code).not.toContain('user_fgetUserInfo')

    await expect([
      `app.output=${reportOutputPath(repoRoot, app.outputRoot)}`,
      `app.action=${app.code.includes('user/getUserInfo') ? 'preserved' : 'missing'}`,
      `app.misescaped=${app.code.includes('user_fgetUserInfo')}`,
      `app.safeClass=${app.code.includes('text-_b45rpx_B')}`,
      `h5.output=${reportOutputPath(repoRoot, h5.outputRoot)}`,
      `h5.action=${h5.code.includes('user/getUserInfo') ? 'preserved' : 'missing'}`,
      `h5.misescaped=${h5.code.includes('user_fgetUserInfo')}`,
    ].join('\n')).toMatchFileSnapshot(snapshotPath)
  }, 180_000)
})
