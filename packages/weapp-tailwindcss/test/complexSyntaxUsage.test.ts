import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { replaceWxml } from '@/wxml/shared'
import { templateReplacer } from '@/wxml/utils'
import { complexSyntaxMap } from './complexSyntaxMap'

const wxmlClassTokenRegExp = /^[\w-]+$/

const expressionCases = [
  {
    label: 'ternary with data variants',
    input: '{{open ? "data-[state=open]:opacity-100" : "data-[state=closed]:opacity-0"}}',
  },
  {
    label: 'array with media and supports variants',
    input: '{{["[@media(pointer:fine){&:hover}]:opacity-100","supports-[display:grid]:grid",klass]}}',
  },
  {
    label: 'nested ternary with arbitrary values',
    input: '{{active ? (compact ? "w-[calc(100%-theme(spacing.4))]" : "translate-x-[calc(100%-50%)]") : "grid-cols-[repeat(auto-fit,minmax(12rem,1fr))]"}}',
  },
  {
    label: 'string concat with arbitrary properties',
    input: '{{"[--scroll-offset:calc(theme(spacing.10)-1px)] " + "before:content-[\\"hello_world\\"] " + cls}}',
  },
] as const

function assertClassTokenLegal(output: string) {
  for (const token of output.split(/\s+/).filter(Boolean)) {
    expect(wxmlClassTokenRegExp.test(token)).toBe(true)
  }
}

describe('tailwind complex syntax corpus', () => {
  describe.each(Object.entries(complexSyntaxMap))('%s', (_group, testCases) => {
    it.each(testCases)('%s', (testCase) => {
      const output = replaceWxml(testCase, {
        escapeMap: MappingChars2String,
      })
      assertClassTokenLegal(output)
      expect(output).toMatchSnapshot()
    })
  })
})

describe('template expressions with complex syntax', () => {
  it.each(expressionCases)("'$label'", ({ input }) => {
    const output = templateReplacer(input, {
      escapeMap: MappingChars2String,
    })
    expect(output).toMatchSnapshot()
  })
})
