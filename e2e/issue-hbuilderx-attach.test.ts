import type { AttachedWebServer } from './hbuilderx-local/web/attached'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { it } from 'vitest'
import { parseThemeClasses, parseThemeTokens, renderThemeUts } from '../demo/issue-1144-uni-app-x-web/scripts/theme-plugin.mjs'
import { webCases } from './hbuilderx-local/cases'
import { issue1170Case, issue1170Source } from './hbuilderx-local/issue-1170-source'
import { runPnpm } from './hbuilderx-local/process'
import { verifyWebHmr } from './hbuilderx-local/runner'
import { assertLogOutsideProject, validateAttachedUrl, waitForAttachedServer } from './hbuilderx-local/web/attached'
import { SourceTransaction } from './hbuilderx-local/web/transaction'

const enabled = Boolean(process.env['E2E_HBUILDERX_ATTACH'])
it.skipIf(!enabled)('连接 IDE 手动启动的单场景服务并验收真实 HMR', async () => {
  const options = JSON.parse(process.env['E2E_HBUILDERX_ATTACH']!)
  const repoRoot = path.resolve(__dirname, '..')
  const projectRoot = await realpath(path.resolve(repoRoot, 'demo/issue-1144-uni-app-x-web'))
  const sessionFile = path.join(projectRoot, '.hbuilderx-acceptance.json')
  if (options.recover) {
    const session = JSON.parse(await readFile(sessionFile, 'utf8'))
    if (session.journal !== path.resolve(options.recover)) {
      throw new Error('恢复路径与项目登记的账本不一致')
    }
    try {
      await (await SourceTransaction.recover(session.journal, projectRoot)).restore()
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
      // 准备构建被中断、尚未建立账本时没有写入复现源码。
      await readFile(session.journal).then(() => {
        throw error
      }, (cause) => {
        if (cause.code !== 'ENOENT') {
          throw cause
        }
      })
    }
    await rm(sessionFile)
    return
  }
  const { channel } = options
  if (!['stable', 'alpha'].includes(channel) || !['1170-LF', '1170-CRLF', '1144-options', '1144-setup'].includes(options.case)) {
    throw new Error('未知验收场景或 IDE channel')
  }
  const baseUrl = validateAttachedUrl(options.url)
  const logFile = path.resolve(options.log)
  assertLogOutsideProject(logFile, projectRoot)
  const runId = randomUUID()
  const artifactRoot = path.resolve(repoRoot, 'e2e/.artifacts/hbuilderx-attach', `${channel}-${options.case}-${runId}`)
  const journal = path.join(artifactRoot, 'source-recovery.json')
  await mkdir(artifactRoot, { recursive: true })
  // 排他登记先于准备，防止同一个项目被两轮验收同时修改。
  const registration = JSON.stringify({ runId, channel, case: options.case, journal })
  await writeFile(sessionFile, registration, { flag: 'wx' })
  let transaction: SourceTransaction | undefined
  let failure: unknown
  try {
    const sourceStatus = execFileSync('git', ['status', '--porcelain', '--', 'demo/issue-1144-uni-app-x-web'], { cwd: repoRoot, encoding: 'utf8' })
    if (sourceStatus.trim()) {
      throw new Error(`复现项目存在未提交修改，请先处理：\n${sourceStatus}`)
    }
    await runPnpm(projectRoot, ['run', 'predev:h5'], 120_000)
    const item = options.case.startsWith('1170') ? issue1170Case() : webCases.find(item => item.name === 'issue-1144-uni-app-x-web')!
    const pageFile = path.resolve(projectRoot, item.sourceFile)
    const appFile = path.join(projectRoot, 'App.uvue')
    const mainCss = path.join(projectRoot, 'main.css')
    const themeFile = path.join(projectRoot, 'theme.uts')
    transaction = await SourceTransaction.create(journal, projectRoot, [pageFile, appFile, mainCss, themeFile, ...item.hmrSteps.flatMap(step => step.sourceMutation ? [path.resolve(projectRoot, step.sourceMutation.file)] : [])])
    if (options.case.startsWith('1170')) {
      await transaction.write(pageFile, issue1170Source.replaceAll('\n', options.case === '1170-CRLF' ? '\r\n' : '\n'))
    }
    else if (options.case === '1144-setup') {
      for (const [file, fixture] of [[appFile, 'App-setup.uts'], [pageFile, 'index-setup.uts']]) {
        const original = await readFile(file!, 'utf8')
        const script = await readFile(path.resolve(__dirname, 'fixtures/issue-1144', fixture!), 'utf8')
        if ([...original.matchAll(/<script\b[^>]*>[\s\S]*?<\/script>/g)].length !== 1) {
          throw new Error(`复现文件 script 数量异常：${file}`)
        }
        await transaction.write(file!, original.replace(/<script\b[^>]*>[\s\S]*?<\/script>/, `<script setup lang="uts">\n${script}</script>`))
      }
    }
    const attachment: AttachedWebServer = {
      baseUrl,
      runId,
      channel,
      logFile,
      artifactRoot,
      assertOwned: () => transaction!.assertOwned(),
      async writeSource(file, content) {
        if (path.resolve(file) === mainCss) {
          await transaction!.expectGenerated(themeFile, renderThemeUts(parseThemeTokens(content), parseThemeClasses(content)))
        }
        await transaction!.write(file, content)
      },
    }
    await writeFile(path.join(artifactRoot, 'acceptance.json'), JSON.stringify({
      runId,
      mode: 'attached-ide',
      case: options.case,
      channel,
      baseUrl,
      projectRoot,
      revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
      platform: process.platform,
      node: process.version,
      logFile,
    }, null, 2))
    console.log(`源码已准备：${options.case} / ${channel}\n请在对应 HBuilderX 中打开 ${projectRoot}，停止旧运行后点击「运行到浏览器」。\n等待新服务 ${baseUrl}，最多 5 分钟。\n测试完成后请将完整 IDE 控制台日志导出至 ${logFile}。\n异常中断恢复：pnpm e2e:hbuilderx:attach --recover "${journal}"`)
    const identity = await waitForAttachedServer(attachment, projectRoot, item.serverIdentityPath!, 300_000)
    await writeFile(path.join(artifactRoot, 'server-identity.json'), JSON.stringify(identity, null, 2))
    attachment.instanceId = identity.instanceId
    await verifyWebHmr(item, attachment)
  }
  catch (error) {
    failure = error
    await writeFile(path.join(artifactRoot, 'failure.txt'), String(error instanceof Error ? error.stack : error))
  }
  finally {
    // 原生服务属于用户；这里只恢复源码，不停止或关闭该服务。
    try {
      await transaction?.restore()
      const actualRegistration = await readFile(sessionFile, 'utf8')
      if (actualRegistration === registration) {
        await rm(sessionFile)
      }
      else {
        failure = new AggregateError([failure].filter(Boolean), '验收登记被外部修改，保留现场')
      }
    }
    catch (error) {
      await writeFile(path.join(artifactRoot, 'recovery-error.txt'), String(error))
      failure = new AggregateError([failure, error].filter(Boolean), `源码恢复未完成，保留账本：${journal}`)
    }
  }
  await writeFile(path.join(artifactRoot, 'result.json'), JSON.stringify({ status: failure ? 'failed' : 'passed', runId, channel, case: options.case }, null, 2))
  if (failure) {
    throw failure
  }
}, 1_200_000)
