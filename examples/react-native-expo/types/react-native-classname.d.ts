import 'react-native'

/** Expo 示例兼容 RN 0.81 type-alias props，包级 env 类型在旧 RN 版本继续生效。 */
declare module 'react-native' {
  interface ViewProps { className?: string | undefined }
  interface TextProps { className?: string | undefined }
  interface ImageProps { className?: string | undefined }
  interface ScrollViewProps { className?: string | undefined }
}
