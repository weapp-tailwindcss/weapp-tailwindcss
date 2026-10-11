import { cp, mkdtemp, readFile, realpath, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { parseSync, traverse } from '@babel/core'
import fg from 'fast-glob'
import { expect, it } from 'vitest'
import { runWithCleanup } from '../scripts/e2e-preflight/cleanup'
import { createHBuilderXAppProject } from '../scripts/hbuilderx-app-project'
import { createLocalHBuilderXRunner } from './hbuilderx-local/process'

it.skipIf(process.env['E2E_ISSUE_1164_NATIVE'] !== '1')('原生 CSS 最小对照生成四组 Harmony 样式，未加载 Tailwind 插件', async () => {
  const temporary = await realpath(await mkdtemp(path.join(tmpdir(), 'issue-1164-native-')))
  const projectRoot = path.join(temporary, 'native-control')
  const fixture = path.resolve(__dirname, 'fixtures/issue-1164-native')
  await cp(fixture, projectRoot, { recursive: true })
  await symlink(path.resolve(__dirname, '../demo/uni-app-x-vdom-tailwindcss-v4/node_modules'), path.join(projectRoot, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
  const runner = await createLocalHBuilderXRunner(projectRoot)
  const session = await createHBuilderXAppProject({ projectRoot, platform: 'app-harmony', runner, timeoutMs: 30_000 })
  await runWithCleanup(async () => {
    await session.open()
    await runner.run({ args: ['launch', 'app-harmony', '--project', session.launchProject, '--compile', 'true'], cwd: session.projectRoot, timeoutMs: 180_000 })
    const files = await fg('**/src/main/resources/resfile/**/www/assets/components/*.js', {
      cwd: path.join(projectRoot, 'unpackage/dist/dev/app-harmony'),
      absolute: true,
      ignore: ['**/build/**'],
    })
    expect(files).toHaveLength(4)
    const evidence: Record<string, unknown> = {}
    for (const file of files.sort()) {
      const source = await readFile(file, 'utf8')
      expect(source).not.toMatch(/wtu-|@apply|tailwindcss/)
      const inline: unknown[] = []
      const scoped: unknown[] = []
      traverse(parseSync(source, { configFile: false, babelrc: false })!, {
        ObjectProperty(property) {
          if (property.node.key.type === 'Identifier' && property.node.key.name === 'style') {
            const value = property.get('value').evaluate()
            expect(value.confident).toBe(true)
            inline.push(value.value)
          }
        },
        VariableDeclarator(variable) {
          const init = variable.get('init')
          if (variable.node.id.type === 'Identifier' && /^_style_\d+$/.test(variable.node.id.name) && init.isObjectExpression()) {
            const value = init.evaluate()
            expect(value.confident).toBe(true)
            scoped.push(value.value)
          }
        },
      })
      expect(inline).toEqual([
        { 'background-color': '#ff7a00', 'height': '100px', 'width': '100%' },
        { color: '#ffffff' },
        { 'background-color': '#f21903', 'height': '48px', 'width': '48px', 'border-radius': '9999px' },
      ])
      evidence[path.parse(file).name] = { inline, scoped }
    }
    await expect(`${JSON.stringify(evidence, null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1164/native-control.json')
  }, async () => {
    await session.cleanup()
    await rm(temporary, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 })
  })
}, 240_000)
