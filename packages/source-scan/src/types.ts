export interface TailwindSourceEntry {
  base: string
  pattern: string
  negated: boolean
}

export interface SourceMatchPolicy {
  /** 仅用于保留 engine 公开辅助函数要求正向来源的约定。 */
  requirePositive?: boolean
}
