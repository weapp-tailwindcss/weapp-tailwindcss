import fs from 'node:fs/promises'
import process from 'node:process'
import path from 'pathe'
import ts from 'typescript'

const repoRoot = process.cwd()

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function readSource(relativePath: string) {
  const file = path.resolve(repoRoot, relativePath)
  return {
    file,
    source: ts.createSourceFile(
      file,
      await fs.readFile(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    ),
  }
}

function findFunction(source: ts.SourceFile, name: string) {
  let result: ts.FunctionDeclaration | undefined
  source.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      result = node
    }
  })
  return result
}

function findVariableInitializer(source: ts.SourceFile, name: string) {
  let result: ts.Expression | undefined
  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) {
      return
    }
    for (const declaration of node.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name && declaration.initializer) {
        result = declaration.initializer
      }
    }
  })
  return result
}

function countCalls(root: ts.Node, matcher: (expression: ts.CallExpression) => boolean) {
  let count = 0
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && matcher(node)) {
      count += 1
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return count
}

function isPropertyCall(expression: ts.CallExpression, receiver: string, method: string) {
  return ts.isPropertyAccessExpression(expression.expression)
    && ts.isIdentifier(expression.expression.expression)
    && expression.expression.expression.text === receiver
    && expression.expression.name.text === method
}

function isIdentifierCall(expression: ts.CallExpression, name: string) {
  return ts.isIdentifier(expression.expression) && expression.expression.text === name
}

function callReceivesIdentifier(root: ts.Node, callName: string, identifier: string) {
  let matched = false
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node)
      && isIdentifierCall(node, callName)
      && node.arguments.some(argument => ts.isIdentifier(argument) && argument.text === identifier)
    ) {
      matched = true
    }
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matched
}

function stringElements(initializer: ts.Expression) {
  assert(ts.isNewExpression(initializer), 'IDE relaxed visibility cases must remain a Set literal.')
  const values = initializer.arguments?.[0]
  assert(values && ts.isArrayLiteralExpression(values), 'IDE relaxed visibility cases must use an array literal.')
  return values.elements.flatMap(element => ts.isStringLiteral(element) ? [element.text] : [])
}

async function main() {
  const probe = await readSource('e2e/frameworkIdeProbe.ts')
  const probeMain = findFunction(probe.source, 'main')
  assert(probeMain?.body, 'frameworkIdeProbe.ts must declare main().')
  const runProbe = findFunction(probe.source, 'runProbe')
  assert(runProbe?.body, 'frameworkIdeProbe.ts must declare the owned runProbe transaction.')
  assert(
    countCalls(probe.source, expression => isPropertyCall(expression, 'automator', 'launch')) === 1,
    'frameworkIdeProbe.ts must launch exactly one automator session per framework case.',
  )
  assert(
    callReceivesIdentifier(probeMain.body, 'withFrameworkIdeHotUpdateProbe', 'runProbe')
    && callReceivesIdentifier(runProbe.body, 'hotUpdate', 'miniProgram'),
    'frameworkIdeProbe.ts must pass the launched miniProgram into the complete HMR probe.',
  )

  const hotUpdate = await readSource('e2e/frameworkIdeHotUpdate.ts')
  const hotUpdateProbe = findFunction(hotUpdate.source, 'withFrameworkIdeHotUpdateProbe')
  assert(hotUpdateProbe?.body, 'frameworkIdeHotUpdate.ts must declare withFrameworkIdeHotUpdateProbe().')
  assert(
    countCalls(hotUpdateProbe.body, expression => isIdentifierCall(expression, 'runIdeClassHotUpdate')) === 2,
    'The IDE HMR probe must keep template and script mutations in one transaction.',
  )
  assert(
    callReceivesIdentifier(hotUpdateProbe.body, 'runIdeClassHotUpdate', 'miniProgram'),
    'Template and script HMR must reuse the miniProgram session created by frameworkIdeProbe.ts.',
  )
  assert(
    countCalls(hotUpdateProbe.body, expression => isPropertyCall(expression, 'automator', 'launch')) === 0,
    'The IDE HMR transaction must not launch another automator session.',
  )

  const styleHotUpdate = await readSource('e2e/frameworkIdeStyleHotUpdate.ts')
  assert(
    countCalls(styleHotUpdate.source, expression => isPropertyCall(expression, 'automator', 'launch')) === 0,
    'Style HMR must stay in the existing watch/automator transaction.',
  )

  const classHotUpdate = await readSource('e2e/frameworkIdeClassHotUpdate.ts')
  const relaxedCases = findVariableInitializer(classHotUpdate.source, 'IDE_LIVE_PAGE_VISIBILITY_RELAXED_CASES')
  assert(relaxedCases, 'frameworkIdeClassHotUpdate.ts must declare IDE_LIVE_PAGE_VISIBILITY_RELAXED_CASES.')
  const cases = stringElements(relaxedCases)
  assert(
    cases.filter(item => item === 'uni-app-x-vdom-tailwindcss-v4').length === 1,
    'uni-app x IDE HMR must remain a single-session case and must not reopen the DevTools project.',
  )
  assert(new Set(cases).size === cases.length, 'IDE relaxed visibility cases must not contain duplicates.')

  process.stdout.write('e2e IDE shared automator launch contract passed\n')
}

await main()
