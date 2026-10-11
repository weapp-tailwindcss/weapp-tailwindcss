import type { EscapeOptions, MappingStringDictionary, SYMBOL_TABLE_TYPE, SYMBOL_TABLE_TYPE_VALUES, UnescapeOptions } from '..'

import { expectAssignable, expectError, expectType } from 'tsd'
import {
  ComplexMappingChars2String,
  ComplexMappingChars2StringEntries,
  escape,

  isAllowedClassName,
  isAsciiNumber,
  MappingChars2String,
  MappingChars2StringEntries,

  MAX_ASCII_CHAR_CODE,
  SYMBOL_TABLE,

  toEscapeOptions,
  toUnescapeOptions,
  unescape,

} from '..'

expectType<string>(escape('abc'))
expectType<string>(escape('1abc', { ignoreHead: true }))
expectType<string>(escape('p-[2px]', { map: MappingChars2String }))
expectType<string>(unescape('u_x1f60a_'))
expectType<string>(unescape('u_x1f60a_', { map: MappingChars2String }))

expectType<boolean>(isAsciiNumber(48))
expectType<boolean>(isAllowedClassName('bg-success'))
expectType<boolean>(isAllowedClassName('bg-success-2'))

expectType<EscapeOptions>(toEscapeOptions())
expectType<EscapeOptions>(toEscapeOptions({ ignoreHead: true }))
expectType<UnescapeOptions>(toUnescapeOptions())
expectType<UnescapeOptions>(toUnescapeOptions({ map: MappingChars2String }))

expectType<127>(MAX_ASCII_CHAR_CODE)
expectAssignable<MappingStringDictionary>(MappingChars2String)
expectAssignable<MappingStringDictionary>(ComplexMappingChars2String)
expectType<Array<[string, string]>>(MappingChars2StringEntries)
expectType<Array<[string, string]>>(ComplexMappingChars2StringEntries)

expectType<SYMBOL_TABLE_TYPE>(SYMBOL_TABLE)
expectType<'.'>(SYMBOL_TABLE.DOT)

expectError(escape(123))
expectError(unescape(123))
