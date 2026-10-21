export interface RemainingVariantPlan {
  root: string
  feature: `variant/static/${string}`
  status: 'not-run'
  engines?: readonly ('firefox' | 'webkit')[]
  dependency: 'native-media' | 'native-autofill' | 'render-lifecycle' | 'pseudo-element'
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
    engines: ['firefox', 'webkit'],
    feature: 'variant/static/contrast-less',
    status: 'not-run',
    dependency: 'native-media',
    reason: 'Firefox/WebKit 的原生 contrast 选项不能请求 less；Chromium 已单独提供 CDP 夹具，仍需各轮运行证据。',
    candidate: 'contrast-less:bg-[#123456]',
    fixture: '候选和对照使用不依赖系统调色的实色色块。',
    sequence: ['no-preference：底色 #010203', 'less：候选 #123456，对照 #010203', '恢复 no-preference：底色 #010203'],
    evidence: ['(prefers-contrast: less/more/no-preference/custom) 的原生 matchMedia 真值', '候选与对照 computed style、PNG 和像素', '媒体原生协议或任务独占宿主偏好的切换及恢复记录'],
    implementation: 'Chromium 独立夹具使用原生 Emulation.setEmulatedMedia，验证 no-preference/less/more/custom/恢复、独立参考和带本轮标记 PNG。Firefox/WebKit 保留 not-run，直到取得等价原生宿主入口。',
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
    engines: ['firefox', 'webkit'],
    feature: 'variant/static/autofill',
    status: 'not-run',
    dependency: 'native-autofill',
    reason: 'Firefox/WebKit 尚未提供独立原生填充入口；Chromium 已有独立原生协议夹具，实际成功仍需本轮报告。键盘填写、fill 或设置 value 不能作为自动填充证据。',
    candidate: 'autofill:[outline:3px_solid_#123456]',
    fixture: '同源 HTTP 表单，包含 name/address/email 等标准 autocomplete 字段；另设未填充对照。用 outline 避免浏览器内置 autofill 背景覆盖候选颜色。',
    sequence: ['空表单：无候选 outline', '原生自动填充：候选 3px solid #123456，对照无 outline', '用户清空并重新编辑：退出 autofill，候选 outline 恢复'],
    evidence: [':autofill 原生匹配结果与逐字段值', '原生填充服务或可见选择交互日志', 'outline 的 width/style/color 和 PNG', '可信编辑事件及退出状态'],
    implementation: '先建立任务独占临时 profile 和虚构地址数据；Chromium 可探索其原生 Autofill 协议，但必须证明 :autofill 真正匹配。其他引擎需要各自原生服务入口，禁止借用用户真实凭据。',
    forbiddenSubstitutes: ['locator.fill()', '设置 input.value', 'dispatchEvent 模拟填充', '手动添加 autofill class', '依靠非标准内部伪类代替标准语义结论'],
  },
]
