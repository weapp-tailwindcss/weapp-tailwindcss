import { describe, expect, it } from 'vitest'
import YAML from 'yaml'
import { parseWorkspaceLockfile } from './lockfile'

const workspace = 'lockfileVersion: "9.0"\nsettings: { autoInstallPeers: true }\nimporters: { ".": { devDependencies: { repoctl: { version: 5.4.9 } } } }\n'
const tools = 'lockfileVersion: "9.0"\nimporters: { ".": { packageManagerDependencies: { pnpm: { version: 12.3.4 } } } }\n'

describe('workspace lockfile documents', () => {
  it.each(['\n', '\r\n'])('supports single and multiple documents with %j newlines', (newline) => {
    const expected = { repoctl: { version: '5.4.9' } }
    for (const source of [workspace, `---\n${tools}---\n${workspace}`, `---\n${workspace}---\n${tools}`]) {
      expect(parseWorkspaceLockfile(source.replaceAll('\n', newline)).importers).toEqual({ '.': { devDependencies: expected } })
    }
  })

  it('rejects missing, duplicate and malformed documents', () => {
    expect(() => parseWorkspaceLockfile(tools)).toThrow('received 0')
    expect(() => parseWorkspaceLockfile(`${workspace}---\n${workspace}`)).toThrow('received 2')
    expect(() => parseWorkspaceLockfile(`bad: [\n---\n${workspace}`)).toThrow()
    expect(() => parseWorkspaceLockfile(`${workspace}---\nbad: [\n`)).toThrow()
  })

  it.each([null, true, 'invalid', [], ['invalid']].map(value => [value]))('rejects non-mapping settings and importers: %j', (value) => {
    for (const field of ['settings', 'importers']) {
      const document = YAML.stringify({ settings: {}, importers: {}, [field]: value })
      expect(() => parseWorkspaceLockfile(document)).toThrow('received 0')
      expect(parseWorkspaceLockfile(`${document}---\n${workspace}`).settings).toEqual({ autoInstallPeers: true })
    }
  })
})
