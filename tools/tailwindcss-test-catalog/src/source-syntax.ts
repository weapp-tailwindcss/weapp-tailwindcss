/* eslint-disable no-template-curly-in-string -- 源码夹具必须保留未经求值的动态插值。 */
export interface SourceSyntaxCase {
  id: string
  language: 'html' | 'tsx' | 'vue' | 'wxml' | 'css'
  source: string
  candidates: string[]
  absentCandidates?: string[]
}

export const sourceSyntaxCases: SourceSyntaxCase[] = [
  { id: 'html-literal', language: 'html', source: '<div class="p-4 w-[123px]"></div>', candidates: ['p-4', 'w-[123px]'] },
  { id: 'tsx-literal', language: 'tsx', source: '<View className="p-4 w-[123px]" />', candidates: ['p-4', 'w-[123px]'] },
  { id: 'tsx-conditional', language: 'tsx', source: '<View className={active ? "bg-red-500" : "bg-blue-500"} />', candidates: ['bg-red-500', 'bg-blue-500'] },
  { id: 'tsx-array', language: 'tsx', source: '<View className={["p-4", active && "text-red-500"].filter(Boolean).join(" ")} />', candidates: ['p-4', 'text-red-500'] },
  { id: 'tsx-map', language: 'tsx', source: 'const variants = { primary: "bg-red-500", secondary: "bg-blue-500" }; <View className={variants[kind]} />', candidates: ['bg-red-500', 'bg-blue-500'] },
  { id: 'tsx-template-static', language: 'tsx', source: '<View className={`p-4 ${active ? "opacity-50" : "opacity-100"}`} />', candidates: ['p-4', 'opacity-50', 'opacity-100'] },
  { id: 'vue-array-object', language: 'vue', source: '<view :class="[\'p-4\', { \'bg-red-500\': active }]" />', candidates: ['p-4', 'bg-red-500'] },
  { id: 'wxml-conditional', language: 'wxml', source: '<view class="p-4 {{active ? \'w-[123px]\' : \'w-[45px]\'}}" />', candidates: ['p-4', 'w-[123px]', 'w-[45px]'] },
  { id: 'hover-class', language: 'wxml', source: '<view hover-class="!bg-[gray] after:!content-[\'good_work!\']" />', candidates: ['!bg-[gray]', 'after:!content-[\'good_work!\']'] },
  { id: 'interpolation-negative', language: 'tsx', source: '<View className={`bg-${color}-500`} />', candidates: [], absentCandidates: ['bg-red-500', 'bg-blue-500'] },
  { id: 'business-text', language: 'tsx', source: '<View title="keep-[business] App.vue:4 https://example.com/a[b]">Hello world!</View>', candidates: [], absentCandidates: ['keep-[business]'] },
]
