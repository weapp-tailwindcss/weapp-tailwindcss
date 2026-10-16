import type { ShowcaseCatalog } from '../../website/src/components/docs/showcase/types'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { verifyShowcaseImages } from './assets'

interface PublicationOptions {
  imageRoot: string
  catalogFile: string
  markdownFile: string
  skipImages: boolean
}

interface PreparedOutput {
  catalog: ShowcaseCatalog
  markdown: string
}

const operations = { rename, writeFile, rm }
type Operations = typeof operations

interface Replacement {
  target: string
  prepared: string
  backup: string
  backedUp: boolean
  installed: boolean
}

/** 所有新内容先写临时位置，替换失败时逆序恢复；回滚失败保留备份位置与完整异常。 */
export async function publishShowcase(options: PublicationOptions, generate: (imageRoot: string) => Promise<PreparedOutput>, io: Operations = operations) {
  const scratch: string[] = []
  const replacements: Replacement[] = []
  let preserveBackups = false
  let failed = false
  let failure: unknown
  const prepare = async (target: string, name: string) => {
    const directory = await mkdtemp(path.join(path.dirname(target), '.showcase-publication-'))
    scratch.push(directory)
    const replacement = { target, prepared: path.join(directory, name), backup: path.join(directory, 'previous'), backedUp: false, installed: false }
    replacements.push(replacement)
    return replacement.prepared
  }
  try {
    const imageRoot = options.skipImages ? options.imageRoot : await prepare(options.imageRoot, 'images')
    if (!options.skipImages) {
      await mkdir(imageRoot)
    }
    const output = await generate(imageRoot)
    await verifyShowcaseImages(imageRoot, output.catalog.entries.flatMap(entry => [entry.primaryImage, ...entry.screenshots]))
    const catalog = await prepare(options.catalogFile, 'catalog.json')
    const markdown = await prepare(options.markdownFile, 'index.mdx')
    await io.writeFile(catalog, `${JSON.stringify(output.catalog, null, 2)}\n`, 'utf8')
    await io.writeFile(markdown, output.markdown, 'utf8')
    try {
      for (const item of replacements) {
        try {
          await io.rename(item.target, item.backup)
          item.backedUp = true
        }
        catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error
          }
        }
        await io.rename(item.prepared, item.target)
        item.installed = true
      }
    }
    catch (error) {
      const errors: unknown[] = [error]
      for (const item of [...replacements].reverse()) {
        try {
          if (item.installed) {
            await io.rm(item.target, { recursive: true, force: true })
          }
          if (item.backedUp) {
            await io.rename(item.backup, item.target)
          }
        }
        catch (rollbackError) {
          errors.push(rollbackError)
        }
      }
      preserveBackups = errors.length > 1
      throw preserveBackups
        ? new AggregateError(errors, `Showcase 发布及回滚失败，保留恢复目录：${scratch.join(', ')}`)
        : error
    }
  }
  catch (error) {
    failed = true
    failure = error
  }
  if (!preserveBackups) {
    const results = await Promise.allSettled(scratch.map(directory => io.rm(directory, { recursive: true, force: true })))
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason)
    if (errors.length) {
      throw new AggregateError(failed ? [failure, ...errors] : errors, `Showcase 临时目录清理失败：${scratch.join(', ')}`)
    }
  }
  if (failed) {
    throw failure
  }
}
