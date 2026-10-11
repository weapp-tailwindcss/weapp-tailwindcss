import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import fg from 'fast-glob'

export async function saveWatchFailure({ project, inputs, output, destination, context, error }) {
  await mkdir(destination, { recursive: true })
  const evidence = { schema: 'weapp-demo-watch-failure/v1', context, error: error.stack ?? String(error), files: [] }
  const sources = [...new Set(inputs)].map(file => ({ kind: 'source', file: path.resolve(project, file), root: project }))
  const outputs = (await fg('**/*', { cwd: output, absolute: true, dot: true, onlyFiles: true, followSymbolicLinks: false }))
    .map(file => ({ kind: 'output', file, root: output }))
  for (const [index, { kind, file, root }] of [...sources, ...outputs].entries()) {
    const record = { kind, original: path.relative(root, file), saved: `${index}${path.extname(file)}` }
    try {
      // 使用独立编号存放证据，外部 CSS 入口与同名文件不能覆盖报告或逃逸证据目录。
      await writeFile(path.join(destination, record.saved), await readFile(file))
    }
    catch (caught) { record.error = caught.code ?? caught.message }
    evidence.files.push(record)
  }
  await writeFile(path.join(destination, 'manifest.json'), JSON.stringify(evidence, null, 2))
  return evidence
}
