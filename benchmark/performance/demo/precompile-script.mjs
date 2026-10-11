import path from 'node:path'

export async function compileScript(compiler, source, snapshot, filename, language = path.extname(filename).slice(1)) {
  const typescript = ['ts', 'tsx', 'mts', 'cts'].includes(language)
  const jsx = !typescript || language === 'tsx'
  const plugins = [...(typescript ? ['typescript'] : []), ...(jsx ? ['jsx'] : [])]
  const result = await compiler.transformJavaScript(source, snapshot, { filename, babelParserOptions: { plugins } })
  // 发布 API 可能返回原文和解析错误；静态基线不得把这种失败当作转换成功。
  if (result.error) throw new Error(`静态源码转换失败：${filename}`, { cause: result.error })
  return result.code
}
