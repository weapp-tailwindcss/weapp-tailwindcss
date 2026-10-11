import { afterEach, expect, test } from 'vitest'
import { createCliFixture, runCli, runCliFailure } from './parity-harness'

const fixtures: Array<{ cleanup: () => Promise<void> }> = []
afterEach(async () => Promise.all(fixtures.splice(0).map(fixture => fixture.cleanup())))

async function project() {
  const result = await createCliFixture({
    'input.css': '@import "tailwindcss" source(none);',
  })
  fixtures.push(result)
  return result
}

test('canonicalizes, collapses and sorts positional candidate groups', async () => {
  const fixture = await project()
  const result = await runCli(fixture.root, ['canonicalize', '--css', 'input.css', 'py-3 p-1 px-3'])
  expect(result.stdout.trim()).toBe('p-3')
})

test('uses the default Tailwind import when --css is omitted', async () => {
  const fixture = await project()
  const result = await runCli(fixture.root, ['canonicalize', 'py-3 p-1 px-3'])
  expect(result.stdout.trim()).toBe('p-3')
})

test('reads multiple candidate groups from stdin', async () => {
  const fixture = await project()
  const result = await runCli(fixture.root, ['canonicalize', '--css', 'input.css'], 'py-3 p-1 px-3\nmt-2 mr-2 mb-2 ml-2\n')
  expect(result.stdout.trim()).toBe('p-3\nm-2')
})

test.each(['json', 'jsonl'] as const)('renders %s output', async (format) => {
  const fixture = await project()
  const result = await runCli(fixture.root, ['canonicalize', '--css', 'input.css', '--format', format, 'py-3 p-1 px-3'])
  const parsed = format === 'json' ? JSON.parse(result.stdout)[0] : JSON.parse(result.stdout.trim())
  expect(parsed).toEqual({ input: 'py-3 p-1 px-3', output: 'p-3', changed: true })
})

test('splits arbitrary values with segment-aware spacing', async () => {
  const fixture = await project()
  const result = await runCli(fixture.root, [
    'canonicalize',
    '--css',
    'input.css',
    '--format',
    'json',
    "content-['hello world'] p-1",
  ])
  expect(JSON.parse(result.stdout)).toEqual([
    {
      input: "content-['hello world'] p-1",
      output: "p-1 content-['hello_world']",
      changed: true,
    },
  ])
})

test('streams canonicalized output line by line', async () => {
  const fixture = await project()
  const result = await runCli(fixture.root, ['canonicalize', '--css', 'input.css', '--stream'], 'py-3 p-1 px-3\nmt-2 mr-2 mb-2 ml-2\n')
  expect(result.stdout).toBe('p-3\nm-2\n')
})

test('preserves empty lines while streaming', async () => {
  const fixture = await project()
  const result = await runCli(
    fixture.root,
    ['canonicalize', '--css', 'input.css', '--stream'],
    'py-3 p-1 px-3\n\nmt-2 mr-2 mb-2 ml-2\n',
  )
  expect(result.stdout).toBe('p-3\n\nm-2\n')
})

test.each(['json', 'jsonl'] as const)('streams %s output', async (format) => {
  const fixture = await project()
  const result = await runCli(
    fixture.root,
    ['canonicalize', '--css', 'input.css', '--stream', '--format', format],
    'py-3 p-1 px-3\nmt-2 mr-2 mb-2 ml-2\n',
  )
  if (format === 'json') {
    expect(JSON.parse(result.stdout)).toEqual([
      { input: 'py-3 p-1 px-3', output: 'p-3', changed: true },
      { input: 'mt-2 mr-2 mb-2 ml-2', output: 'm-2', changed: true },
    ])
  }
  else {
    expect(result.stdout).toBe(
      '{"input":"py-3 p-1 px-3","output":"p-3","changed":true}\n'
      + '{"input":"mt-2 mr-2 mb-2 ml-2","output":"m-2","changed":true}\n',
    )
  }
})

test('reports empty input and invalid formats', async () => {
  const fixture = await project()
  const empty = await runCliFailure(fixture.root, ['canonicalize', '--css', 'input.css'])
  const invalid = await runCliFailure(fixture.root, ['canonicalize', '--format', 'xml', 'p-4'])
  expect(empty.stderr).toContain('No candidate groups provided')
  expect(invalid.stderr).toContain('Invalid value for --format')
})
