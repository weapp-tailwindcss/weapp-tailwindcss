import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import fg from 'fast-glob'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { issue1170Case, issue1170Source } from './hbuilderx-local/issue-1170-source'
import { runPnpm } from './hbuilderx-local/process'
import { verifyWebHmr } from './hbuilderx-local/runner'

const projectRoot = path.resolve(__dirname, '../demo/issue-1144-uni-app-x-web')
async function withReproduction(action: () => Promise<void>, eol = '\n') {
  const file = path.join(projectRoot, 'pages', 'index', 'index.uvue')
  const original = await readFile(file, 'utf8')
  try {
    await writeFile(file, issue1170Source.replaceAll('\n', eol))
    await action()
  }
  finally {
    await writeFile(file, original)
  }
}

const run = process.env['E2E_ISSUE_1170_WEB'] === '1' ? describe : describe.skip

run('issue #1170 empty scoped SCSS Web lifecycle', () => {
  it.each(['LF', 'CRLF'])('preserves %s styles after text-only saves, class replacement and browser refresh', async (lineEnding) => {
    await withReproduction(async () => {
      await verifyWebHmr(issue1170Case())
    }, lineEnding === 'CRLF' ? '\r\n' : '\n')
  }, 360_000)
})

it.skipIf(process.env['E2E_ISSUE_1170_STATIC'] !== '1')('issue #1170 production CSS retains the screenshot utilities', async () => {
  await withReproduction(async () => {
    await runPnpm(projectRoot, ['exec', 'cross-env', 'UNI_INPUT_DIR=.', 'uni', 'build'], 120_000)
    const files = await fg('**/*.css', { cwd: path.join(projectRoot, 'dist', 'build', 'h5'), absolute: true })
    const evidence = new Set<string>()
    for (const file of files) {
      postcss.parse(await readFile(file, 'utf8')).walkDecls((decl) => {
        if (['#f7fbff', '#102938', '200px'].includes(decl.value)) {
          evidence.add(`${decl.prop}: ${decl.value}`)
        }
      })
    }
    expect([...evidence].sort()).toEqual(['background-color: #102938', 'color: #f7fbff', 'width: 200px'])
    await expect(`${JSON.stringify([...evidence].sort(), null, 2)}\n`).toMatchFileSnapshot('__snapshots__/issue-1170-web/utilities.json')
  })
}, 150_000)
