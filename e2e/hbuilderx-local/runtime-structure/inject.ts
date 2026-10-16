import type { RuntimeStructureAdapter } from './index'
import ts from 'typescript'
import { findRuntimeProbeView, parseRuntimeProbeSource } from './source'
import { createUniAppRenderProbe } from './uni-app'
import { createUniAppXElementProbe } from './uni-app-x'

interface Edit { at: number, text: string }

/** 只插入对象的直接成员，不替换原生命周期、setup 返回值或业务方法。 */
function extendOptions(body: string, additions: { setup?: string, bridge?: string }) {
  const document = ts.createSourceFile('probe.ts', body, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const statement = document.statements.find(ts.isExportAssignment)
  if (!statement || !ts.isObjectLiteralExpression(statement.expression)) {
    throw new Error('运行时结构探针需要对象形式的 export default')
  }
  const object = statement.expression
  const edits: Edit[] = []
  const member = (name: string) => object.properties.find(property => property.name?.getText(document).replace(/['"]/g, '') === name)
  if (additions.setup) {
    const setup = member('setup')
    if (setup) {
      if (!ts.isMethodDeclaration(setup) || !setup.body) {
        throw new Error('运行时结构探针不支持非方法形式的 setup')
      }
      edits.push({ at: setup.body.getStart(document) + 1, text: `\n${additions.setup}\n` })
    }
    else {
      edits.push({ at: object.getStart(document) + 1, text: `\nsetup() { ${additions.setup} },\n` })
    }
  }
  if (additions.bridge) {
    const methods = member('methods')
    if (methods) {
      if (!ts.isPropertyAssignment(methods) || !ts.isObjectLiteralExpression(methods.initializer)) {
        throw new Error('运行时结构桥接需要对象形式的 methods')
      }
      if (methods.initializer.properties.some(property => property.name?.getText(document).includes('__wtRuntimeReport'))) {
        throw new Error('运行时结构桥接方法与现有方法冲突')
      }
      edits.push({ at: methods.initializer.getStart(document) + 1, text: `\n${additions.bridge},\n` })
    }
    else {
      edits.push({ at: object.getStart(document) + 1, text: `\nmethods: { ${additions.bridge} },\n` })
    }
  }
  for (const edit of edits.sort((a, b) => b.at - a.at)) {
    body = body.slice(0, edit.at) + edit.text + body.slice(edit.at)
  }
  return body
}

/** 仅由 App runner 在本轮临时源码中调用，原文件由项目恢复事务负责。 */
export function injectRuntimeStructureProbe(source: string, runId: string, adapter: RuntimeStructureAdapter) {
  if (!/^[a-z\d-]+$/i.test(runId)) {
    throw new Error('运行时结构探针身份只允许字母、数字与连字符')
  }
  if (source.includes('__wtInstallRuntimeStructure') || source.includes('module="__wtRuntimeStructure"')) {
    throw new Error('运行时结构探针不能重复安装')
  }
  const descriptor = parseRuntimeProbeSource(source)
  const normal = descriptor.script
  const setup = descriptor.scriptSetup
  const script = normal ?? setup
  if (adapter === 'uni-app-x-element') {
    const helper = createUniAppXElementProbe(runId)
    if (!script) {
      return `${source}\n<script lang="uts">${helper}\nexport default { setup() { __wtInstallRuntimeStructure() } }</script>\n`
    }
    const body = normal ? extendOptions(script.content, { setup: '__wtInstallRuntimeStructure()' }) : `${script.content}\n__wtInstallRuntimeStructure()\n`
    return source.slice(0, script.loc.start.offset) + helper + body + source.slice(script.loc.end.offset)
  }
  const prefix = JSON.stringify(`WT_RUNTIME_STRUCTURE_${runId}=`)
  const bridge = `__wtRuntimeReport(payload) { console.log(${prefix} + payload) }`
  if (normal) {
    source = source.slice(0, normal.loc.start.offset) + extendOptions(normal.content, { bridge }) + source.slice(normal.loc.end.offset)
  }
  else {
    const language = setup?.lang
    source += `\n<script${language ? ` lang="${language}"` : ''}>export default { methods: { ${bridge} } }</script>\n`
  }
  const at = findRuntimeProbeView(source)
  const nonce = JSON.stringify(runId)
  const attributes = ` data-wt-runtime-owner='${runId}' :wt-runtime-probe='${nonce}' :change:wt-runtime-probe="__wtRuntimeStructure.start"`
  source = source.slice(0, at) + attributes + source.slice(at)
  return `${source}\n${createUniAppRenderProbe(runId)}\n`
}
