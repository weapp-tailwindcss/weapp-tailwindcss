import type {} from 'react-native'

/** 供业务组件复用的 React Native className 属性。 */
export interface NativeClassNameProps {
  className?: string | undefined
}

declare module 'react-native' {
  interface ViewProps extends NativeClassNameProps {}
  interface TextProps extends NativeClassNameProps {}
  interface ImageProps extends NativeClassNameProps {}
  interface ScrollViewProps extends NativeClassNameProps {}
}
