import { Button as NutButton } from '@nutui/nutui-taro'
import { createApp } from 'vue'

// 显式建立图标样式的入口依赖，确保后面的 Tailwind 工具类能覆盖图标默认值。
import '@nutui/icons-vue-taro/dist/style_iconfont.css'
import './app.css'

const app = createApp({
  mounted() {},
  onLaunch() {},
  onShow() {},
  onHide() {},
})

app.use(NutButton)

export default app
