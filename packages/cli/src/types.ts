export interface CommonCommandOptions {
  cwd?: string | boolean
}

export interface ExtractCommandOptions extends CommonCommandOptions {
  output?: string | boolean
  format?: string | boolean
  css?: string | boolean
  write?: boolean | string
}

export interface TokensCommandOptions extends CommonCommandOptions {
  output?: string | boolean
  format?: string | boolean
  groupKey?: string | boolean
  write?: boolean | string
}
