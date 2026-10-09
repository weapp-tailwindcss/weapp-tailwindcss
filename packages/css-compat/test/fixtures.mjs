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
  { name: '普通权重倒置', css: '@layer a,b;@layer a{#probe.probe{color:red}}@layer b{.probe{color:blue}}' },
  { name: 'important 权重倒置', css: '@layer a,b;@layer a{.probe{color:red!important}}@layer b{#probe.probe{color:blue!important}}' },
  { name: 'selector list', css: '@layer a,b;@layer a{#probe.probe,.other{color:red}}@layer b{.probe{color:blue}}' },
  { name: '简写与长写', css: '@layer a,b;@layer a{#probe.probe{margin:1px}}@layer b{.probe{margin-top:2px}}' },
  { name: '逻辑与物理属性', css: '@layer a,b;@layer a{#probe.probe{margin-inline-start:1px}}@layer b{.probe{margin-left:2px}}' },
  { name: 'Panda ancestor 权重反例', css: '@layer base,utilities;@layer base{#card .probe{color:red}}@layer utilities{.probe{color:blue}}' },
]
