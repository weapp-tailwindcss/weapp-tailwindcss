// #1280 六个探针，以及 Panda #155 的 9d27162358fb54f70e9653540bbfa83ff4bd743e 中 e2e/web/layers.spec.ts 的全部层语义 fixture。
export const safeCases = [
  { name: '声明顺序', css: '@layer a,b;@layer b{.probe{color:blue}}@layer a{.probe{color:red}}', values: ['color:red', 'color:blue'] },
  { name: '重复层', css: '@layer a{.probe{color:red}}@layer b{.probe{color:blue}}@layer a{.probe{color:orange}}', values: ['color:red', 'color:orange', 'color:blue'] },
  { name: 'important 逆序', css: '@layer a,b;@layer a{.probe{color:red!important}}@layer b{.probe{color:blue!important}}', values: ['color:blue!', 'color:red!'] },
  { name: '未分层普通优先级', css: '.probe{color:black}@layer a{.probe{color:red}}', values: ['color:red', 'color:black'] },
  { name: '混合声明与 fallback', css: '@layer a,b;@layer a{.probe{color:red!important;background:red;color:orange!important}}@layer b{.probe{color:blue!important;background:blue}}.probe{color:black!important;background:black}', values: ['background:red', 'background:blue', 'background:black', 'color:black!', 'color:blue!', 'color:red!', 'color:orange!'] },
  { name: '嵌套与隐式父层', css: '@layer outer.a,outer.b,last;@layer outer{.probe{color:green!important;padding-top:3px}@layer b{.probe{color:blue!important;padding-top:2px}}@layer a{.probe{color:red!important;padding-top:1px}}}@layer last{.probe{color:purple!important;padding-top:4px}}@layer outer.a{.probe{color:orange!important}}', values: ['padding-top:1px', 'padding-top:2px', 'padding-top:3px', 'padding-top:4px', 'color:purple!', 'color:green!', 'color:blue!', 'color:red!', 'color:orange!'] },
  { name: '匿名身份与简写', css: '@layer first;@layer first{.probe{margin:1px;color:red!important}}@layer{.probe{margin-top:2px;color:blue!important}}@layer{.probe{margin-top:3px;color:green!important}}', values: ['margin:1px', 'margin-top:2px', 'margin-top:3px', 'color:green!', 'color:blue!', 'color:red!'] },
  { name: '条件包装', css: '@layer a,b;@layer a{.probe{color:red;background:red}}@media(min-width:700px){@supports(display:grid){@layer b{.probe{color:blue;background:blue!important}}}}', values: ['color:red', 'background:red', 'color:blue', 'background:blue!'] },
  { name: '转义点分名称', css: String.raw`@layer a\.b,a.b;@layer a.b{.probe{color:blue}}@layer a\.b{.probe{color:red}}`, values: ['color:red', 'color:blue'] },
  { name: '转义名称别名', css: String.raw`@layer a,b;@layer b{.probe{color:blue}}@layer \61 {.probe{color:red}}`, values: ['color:red', 'color:blue'] },
  { name: '大小写与注释', css: '@LAYER a/*name*/, b;@layer b{.probe{color:blue}}@Layer a{.probe{color:red}}', values: ['color:red', 'color:blue'] },
  { name: 'Panda 声明顺序及未分层普通优先级', css: '.probe{color:green}@layer base,utilities;@layer utilities{.probe{color:blue;background:blue}}@layer base{.probe{color:red;background:red}}', values: ['color:red', 'background:red', 'color:blue', 'background:blue', 'color:green'] },
  { name: 'Panda important、混合声明与 fallback', css: '@layer a,b;@layer a{.probe{color:red!important;background:red;color:orange!important}}@layer b{.probe{color:blue!important;background:blue}}.probe{color:green!important;background:green}', values: ['background:red', 'background:blue', 'background:green', 'color:green!', 'color:blue!', 'color:red!', 'color:orange!'] },
]

export const conflicts = [
  { name: '转义自定义属性', css: String.raw`@layer a,b;@layer a{#probe{--f\6f o:red}}@layer b{.probe{--foo:blue}}.probe{color:var(--foo)}` },
  { name: 'font-variant 简写', css: '@layer a,b;@layer a{#probe{font-variant:small-caps}}@layer b{.probe{font-variant-caps:normal}}' },
  { name: 'white-space 简写', css: '@layer a,b;@layer a{#probe{white-space:pre}}@layer b{.probe{white-space-collapse:collapse}}' },
  { name: '普通权重倒置', css: '@layer a,b;@layer a{#probe.probe{color:red}}@layer b{.probe{color:blue}}' },
  { name: 'important 权重倒置', css: '@layer a,b;@layer a{.probe{color:red!important}}@layer b{#probe.probe{color:blue!important}}' },
  { name: 'selector list', css: '@layer a,b;@layer a{#probe.probe,.other{color:red}}@layer b{.probe{color:blue}}' },
  { name: '简写与长写', css: '@layer a,b;@layer a{#probe.probe{margin:1px}}@layer b{.probe{margin-top:2px}}' },
  { name: '逻辑与物理属性', css: '@layer a,b;@layer a{#probe.probe{margin-inline-start:1px}}@layer b{.probe{margin-left:2px}}' },
  { name: 'Panda ancestor 权重反例', css: '@layer base,utilities;@layer base{#card .probe{color:red}}@layer utilities{.probe{color:blue}}' },
]

// 别名在两个方向和两种声明优先级中共享属性身份。
for (const [alias, canonical, first, second] of [
  ['grid-gap', 'gap', '1px', '2px'],
  ['grid-row-gap', 'row-gap', '1px', '2px'],
  ['grid-column-gap', 'column-gap', '1px', '2px'],
  ['word-wrap', 'overflow-wrap', 'break-word', 'normal'],
  ['page-break-before', 'break-before', 'avoid', 'auto'],
  ['page-break-after', 'break-after', 'avoid', 'auto'],
  ['page-break-inside', 'break-inside', 'avoid', 'auto'],
]) {
  for (const important of ['', '!important']) {
    const low = important ? 'b' : 'a'
    const high = important ? 'a' : 'b'
    conflicts.push({ name: `${alias} ${important}`, css: `@layer a,b;@layer ${low}{#probe{${alias}:${first}${important}}}@layer ${high}{.probe{${canonical}:${second}${important}}}` })
  }
}

safeCases.push(
  { name: '合法点分注释及转义终止空白', css: String.raw`@layer a.b,a.c;@layer a.c{.probe{color:blue}}@layer a/**/.\62 {.probe{color:red}}`, values: ['color:red', 'color:blue'] },
  { name: '转义自定义属性大小写', css: String.raw`@layer a,b;@layer a{#probe{--F\6f o:red}}@layer b{.probe{--foo:blue}}.probe{color:var(--foo)}`, values: [String.raw`--F\6f o:red`, '--foo:blue', 'color:var(--foo)'] },
)

export const rejectedCases = [
  { name: '普通 import', css: '@import url("data:text/css,.probe%7Bcolor%3Ared%7D");@layer a{.probe{color:blue}}', code: 'LAYER_IMPORT', color: 'rgb(255, 0, 0)' },
  ...['a . b', 'a. b', 'a .b'].map(layer => ({ name: `非法层名 ${layer}`, css: `.probe{color:black}@layer ${layer}{.probe{color:red}}`, code: 'LAYER_NAME', color: 'rgb(0, 0, 0)' })),
  { name: 'keyframes 转义及字符串别名', css: String.raw`@layer a,b;@layer b{@keyframes "spin"{from{color:blue}to{color:blue}}}@layer a{@keyframes \73 pin{from{color:red}to{color:red}}}.probe{animation:spin 1s paused both}`, code: 'LAYER_DESCRIPTOR_ORDER', color: 'rgb(0, 0, 255)' },
]
