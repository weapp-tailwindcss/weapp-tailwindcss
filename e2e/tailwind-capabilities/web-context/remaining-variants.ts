export interface RemainingVariantPlan {
  root: string
  feature: `variant/static/${string}`
  status: 'not-run'
  dependency: 'native-media' | 'native-autofill' | 'history-pixels' | 'render-lifecycle' | 'pseudo-element'
  reason: string
  candidate: string
  fixture: string
  sequence: string[]
  evidence: string[]
  implementation: string
  forbiddenSubstitutes: string[]
}

/** 这是未执行语义的实施计划，不能作为 runtime 结果或 unsupported 预期导入。 */
export const remainingVariantPlans: RemainingVariantPlan[] = [
  {
    root: 'pointer-none',
    feature: 'variant/static/pointer-none',
    status: 'not-run',
    dependency: 'native-media',
    reason: 'Playwright 1.64.1 的 hasTouch 只能声明触摸能力，不能移除主指针；emulateMedia 也未暴露 pointer。',
    candidate: 'pointer-none:bg-[#123456]',
    fixture: '160×40 的候选色块及相同尺寸的无 class 对照，底色均为 #010203。',
    sequence: ['有主指针：底色 #010203', '无主指针：候选 #123456，对照 #010203', '恢复主指针：底色 #010203'],
    evidence: ['各状态的 (pointer: none/coarse/fine) 与 (any-pointer: none/coarse/fine) 六项 matchMedia 真值', '独立 PNG、色块中心像素、computed background-color', '原生环境切换的设备或协议记录'],
    implementation: '先用引擎原生媒体协议验证是否能真实改变 matchMedia；能支持时单独登记该引擎夹具。否则使用任务独占且可恢复的无主指针宿主，不能修改用户日常设备。',
    forbiddenSubstitutes: ['隐藏光标', '鼠标移出页面', 'pointer-events:none', '覆盖 matchMedia', '仅由 hasTouch:false 推断 pointer:none'],
  },
  {
    root: 'any-pointer-none',
    feature: 'variant/static/any-pointer-none',
    status: 'not-run',
    dependency: 'native-media',
    reason: 'any-pointer:none 表示全部指针设备均不可用；单纯切换鼠标/触摸 context 无法建立此状态。',
    candidate: 'any-pointer-none:bg-[#123456]',
    fixture: '候选和无 class 对照同为 #010203 色块，同时登记主指针与所有指针设备。',
    sequence: ['至少一种可用指针：底色 #010203', '全部指针不可用：候选 #123456，对照 #010203', '恢复任一种指针：底色 #010203'],
    evidence: ['全部六项 pointer/any-pointer matchMedia 真值，none 状态必须排除任一 coarse/fine', '独立 PNG、色块中心像素、computed background-color', '全部设备切换及恢复记录'],
    implementation: '独立验证原生媒体协议的 any-pointer 支持；若不可用，复用任务独占无指针宿主。与 pointer:none 分别断言，不能把主指针缺失当作所有设备缺失。',
    forbiddenSubstitutes: ['复用 pointer:none 结论', '禁用页面鼠标事件', '关闭触摸能力后假定没有鼠标', '覆盖 matchMedia'],
  },
  {
    root: 'contrast-less',
    feature: 'variant/static/contrast-less',
    status: 'not-run',
    dependency: 'native-media',
    reason: 'Playwright 1.64.1 的原生 contrast 选项只有 more/no-preference，不能请求 prefers-contrast:less。',
    candidate: 'contrast-less:bg-[#123456]',
    fixture: '候选和对照使用不依赖系统调色的实色色块。',
    sequence: ['no-preference：底色 #010203', 'less：候选 #123456，对照 #010203', '恢复 no-preference：底色 #010203'],
    evidence: ['(prefers-contrast: less/more/no-preference/custom) 的原生 matchMedia 真值', '候选与对照 computed style、PNG 和像素', '媒体原生协议或任务独占宿主偏好的切换及恢复记录'],
    implementation: '可先探索 Chromium 原生 Emulation.setEmulatedMedia 的该特征；协议成功返回仍须检查原生 matchMedia 和实际绘制。其他引擎保留独立 not-run，直到取得等价宿主入口。',
    forbiddenSubstitutes: ['contrast:more', 'forced-colors', 'CSS filter:contrast()', '改写生成 CSS 媒体条件', '覆盖 matchMedia'],
  },
  {
    root: 'inverted-colors',
    feature: 'variant/static/inverted-colors',
    status: 'not-run',
    dependency: 'native-media',
    reason: 'Playwright 1.64.1 没有 inverted-colors 原生模拟选项；截图是否包含宿主反色也需要单独校准。',
    candidate: 'inverted-colors:bg-[#123456]',
    fixture: '候选色块、无 class 对照和红绿蓝校准块，记录 CSS 颜色与最终截图颜色的关系。',
    sequence: ['none：候选底色 #010203', 'inverted：候选 CSS 色 #123456，对照 CSS 色 #010203', '恢复 none：候选底色 #010203'],
    evidence: ['(inverted-colors: inverted/none) 的原生 matchMedia 真值', 'computed style 与带校准块的 PNG', '捕获路径在系统反色前或反色后的校准结论', '宿主偏好或原生媒体协议的恢复记录'],
    implementation: '先探测原生媒体协议的实际支持；若依赖系统偏好，使用独占可恢复宿主。像素预期先通过固定颜色校准，不能对未经确认的截图统一取反。',
    forbiddenSubstitutes: ['CSS filter:invert()', 'dark 模式', 'forced-colors', '仅修改 screenshot 像素', '覆盖 matchMedia'],
  },
  {
    root: 'autofill',
    feature: 'variant/static/autofill',
    status: 'not-run',
    dependency: 'native-autofill',
    reason: '真实 :autofill 由浏览器填充服务产生；键盘填写、fill 或设置 value 都不能作为自动填充证据。',
    candidate: 'autofill:[outline:3px_solid_#123456]',
    fixture: '同源 HTTP 表单，包含 name/address/email 等标准 autocomplete 字段；另设未填充对照。用 outline 避免浏览器内置 autofill 背景覆盖候选颜色。',
    sequence: ['空表单：无候选 outline', '原生自动填充：候选 3px solid #123456，对照无 outline', '用户清空并重新编辑：退出 autofill，候选 outline 恢复'],
    evidence: [':autofill 原生匹配结果与逐字段值', '原生填充服务或可见选择交互日志', 'outline 的 width/style/color 和 PNG', '可信编辑事件及退出状态'],
    implementation: '先建立任务独占临时 profile 和虚构地址数据；Chromium 可探索其原生 Autofill 协议，但必须证明 :autofill 真正匹配。其他引擎需要各自原生服务入口，禁止借用用户真实凭据。',
    forbiddenSubstitutes: ['locator.fill()', '设置 input.value', 'dispatchEvent 模拟填充', '手动添加 autofill class', '依靠非标准内部伪类代替标准语义结论'],
  },
  {
    root: 'visited',
    feature: 'variant/static/visited',
    status: 'not-run',
    dependency: 'history-pixels',
    reason: '浏览器隐私保护会掩蔽 :visited 的 computed style 和选择器观测，当前稳定态属性 oracle 不能证明历史样式。',
    candidate: 'visited:text-[#123456]',
    fixture: '任务本地同源 HTTP 路由和每轮唯一目标 URL；候选/对照为相同文本的链接，默认 #040506，始终 opaque。',
    sequence: ['独立无历史 context：候选默认色', '真实点击目标链接并返回同一顶层站点：候选绘制 #123456，对照默认色', '全新无历史 context：恢复默认色'],
    evidence: ['本轮 URL、顶层站点和 frame origin', '真实导航响应、点击事件及返回日志', '同文本同位置的前后 PNG 和固定字形区域像素差', 'computed style 仅留原始值，不作为激活判据'],
    implementation: '复用独立 context，绑定本地 HTTP 路由，以同站点点击/返回建立真实分区历史；先校准字形抗锯齿，再以独立颜色 oracle 判定。新 context 只清理任务历史，不能清除用户历史。',
    forbiddenSubstitutes: ['getComputedStyle 单独判定', 'matches(":visited") 单独判定', '脚本设置历史状态代替真实访问', '从浏览器历史数据库注入', '仅比较整张 PNG 是否不同'],
  },
  {
    root: 'starting',
    feature: 'variant/static/starting',
    status: 'not-run',
    dependency: 'render-lifecycle',
    reason: '@starting-style 只参与首次渲染或重新显示的过渡起点；现有 before/after/restored 稳定态采样会错过起始帧。',
    candidate: 'starting:opacity-0',
    fixture: '固定纯色色块，最终 opacity:1，线性 opacity 过渡；候选初始不在渲染树，另设没有 starting class 的同结构对照。',
    sequence: ['未插入：两色块均不在渲染树', '真实插入：候选由透明起步，对照立即不透明', '过渡中：候选透明度严格增加', '结束：候选 opacity:1', '移除后重新插入：重新触发起始过渡'],
    evidence: ['requestAnimationFrame 的时间戳、opacity 与原生过渡事件', '原生 CSSTransition 身份、property、duration 和 currentTime', '起点/中间/终点 PNG 与色块区域像素', '无 class 对照及第二次进入文档的完整时间线'],
    implementation: '为该夹具单独使用 reducedMotion:no-preference；插入前安装事件和 rAF 采样。按原生动画进度取证，可在确认过渡自然产生后暂停保存 PNG；先校验未暂停时间线，禁止把手动 currentTime 本身当作起始语义证据。',
    forbiddenSubstitutes: ['只测终态 opacity', '手写等价 @starting-style CSS', '手动创建 Web Animation', '关闭 screenshot 动画并当作起点', '固定 sleep 后猜测起始帧'],
  },
  {
    root: 'details-content',
    feature: 'variant/static/details-content',
    status: 'not-run',
    dependency: 'pseudo-element',
    reason: '需要证明 ::details-content 这个 UA 伪元素实际绘制并随原生 details 开合，而不是普通子元素恰好有相同样式。',
    candidate: 'details-content:bg-[#123456]',
    fixture: '候选 class 放在 details；summary 之外有固定尺寸的内容块，透明背景。另设无 class 的相同 details 对照。',
    sequence: ['closed：内容无绘制像素', '原生点击 summary：open，内容背景 #123456，对照透明', '再次点击 summary：closed，内容绘制区域消失', '键盘聚焦 summary 并 Enter：恢复 open 背景'],
    evidence: ['CSS.supports("selector(::details-content)") 原始值', 'details.open、可信 click/keydown 与原生 toggle 事件', 'getComputedStyle(details,"::details-content") 与普通内容子元素的独立属性', 'summary 保持对照颜色、内容区域 PNG 与像素、开合前后布局'],
    implementation: '借用共享 Browser 的独立 context，以真实 summary 点击及键盘操作开合。伪元素功能探针失败仍记录该引擎失败或未执行的具体原因，不能自动改成 unsupported。',
    forbiddenSubstitutes: ['把 class 放到普通内容 div', '只测 details 子节点背景', '脚本设置 open 后声称原生交互通过', '只凭 CSS.supports 判定实际绘制通过'],
  },
]
