import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import ts from 'typescript'
import { readUtf8 } from '../../e2e/hbuilderx-local/process.ts'

export interface StyleIsolationVariant {
  key?: string
  styleIsolationVersion?: '2'
}

export function resolveStyleIsolationVariants(projectDir: string): StyleIsolationVariant[] {
  if (!projectDir.includes('uni-app-x-')) {
    return [{}]
  }
  const variants = [
    { key: 'style-isolation-default' },
    { key: 'style-isolation-v2', styleIsolationVersion: '2' },
  ] satisfies StyleIsolationVariant[]
  const selectedVariant = process.env['DEMO_VISUAL_STYLE_ISOLATION_VARIANT']
  return selectedVariant ? variants.filter(item => item.key === selectedVariant) : variants
}

export async function readManifest(projectRoot: string) {
  return await readUtf8(path.resolve(projectRoot, 'manifest.json'))
}

export async function writeManifest(projectRoot: string, source: string) {
  await fs.writeFile(path.resolve(projectRoot, 'manifest.json'), source, 'utf8')
}

export async function writeStyleIsolationVariantManifest(projectRoot: string, variant: StyleIsolationVariant) {
  const source = await readManifest(projectRoot)
  const next = variant.styleIsolationVersion
    ? setStyleIsolationVersion(source, variant.styleIsolationVersion)
    : removeStyleIsolationVersion(source)
  await writeManifest(projectRoot, next)
}

function findUniAppXObject(source: string) {
  const document = ts.parseJsonText('manifest.json', source)
  const statement = document.statements[0]
  if (!statement || !ts.isExpressionStatement(statement) || !ts.isObjectLiteralExpression(statement.expression)) {
    return undefined
  }
  const property = statement.expression.properties.find(item =>
    ts.isPropertyAssignment(item) && ts.isStringLiteral(item.name) && item.name.text === 'uni-app-x',
  )
  if (!property || !ts.isPropertyAssignment(property) || !ts.isObjectLiteralExpression(property.initializer)) {
    return undefined
  }
  return { document, object: property.initializer }
}

function removeStyleIsolationVersion(source: string): string {
  const parsed = findUniAppXObject(source)
  if (!parsed) {
    return source
  }
  const { document, object } = parsed
  const property = object.properties.find(item =>
    ts.isPropertyAssignment(item) && ts.isStringLiteral(item.name) && item.name.text === 'styleIsolationVersion',
  )
  if (!property) {
    return source
  }
  // 只移除目标对象的直接属性；注释和条件指令不属于属性或逗号 token。
  const children = object.getChildren(document).find(item => item.kind === ts.SyntaxKind.SyntaxList)!.getChildren(document)
  const index = children.indexOf(property)
  const comma = [children[index + 1], children[index - 1]].find(item => item?.kind === ts.SyntaxKind.CommaToken)
  const edits = [property, ...comma ? [comma] : []].sort((a, b) => b.pos - a.pos)
  for (const item of edits) {
    source = source.slice(0, item.getStart(document)) + source.slice(item.end)
  }
  return removeStyleIsolationVersion(source)
}

function setStyleIsolationVersion(source: string, version: '2') {
  source = removeStyleIsolationVersion(source)
  const parsed = findUniAppXObject(source)
  if (!parsed) {
    return source
  }
  const { document, object } = parsed
  const open = object.getStart(document)
  const close = object.end - 1
  const lineStart = source.lastIndexOf('\n', open)
  const indent = source.slice(lineStart + 1, open).match(/^[\t ]*/)?.[0] ?? ''
  const childIndent = `${indent}\t`
  const body = source.slice(open + 1, close).trim()
  // 新属性位于条件块之前，避免被条件编译移除或被末尾行注释吞掉分隔符。
  const separator = object.properties.length ? ',' : ''
  const nextBody = `\n${childIndent}"styleIsolationVersion": "${version}"${separator}\n${body ? `${childIndent}${body}\n` : ''}${indent}`
  return source.slice(0, open + 1) + nextBody + source.slice(close)
}
