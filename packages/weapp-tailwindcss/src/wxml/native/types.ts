export interface NativeWxmlEscapeEntry {
  character: string
  replacement: string
}

export interface NativeWxmlTransformer {
  transformStatic: (source: string, contains?: (candidate: string) => boolean) => string | null
}

export interface NativeWxmlCompiler {
  createWxmlTransformer: (entries: NativeWxmlEscapeEntry[]) => NativeWxmlTransformer | null
}
