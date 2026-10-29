const { WeappTailwindcss } = require('weapp-tailwindcss/webpack')
const path = require('path')
const isAppWebview = process.env.UNI_PLATFORM === 'app-plus'
/**
 * @type {import('@vue/cli-service').ProjectOptions}
 */
const config = {
    // some option...
    configureWebpack: (config) => {
        config.plugins.push(
            new WeappTailwindcss({
                rem2rpx: !isAppWebview,
                ...(isAppWebview ? {
                    generator: { target: 'web', webCompat: true },
                    cssOptions: {
                        rem2rpx: false,
                        cssSelectorReplacement: { root: false, universal: false }
                    },
                    // App 的 service/view 共用 Web class，不能按小程序规则转义。
                    jsMatcher: () => false,
                    htmlMatcher: () => false
                } : {}),
                cssEntries: [
                    path.resolve(__dirname, 'src/main.css')
                ]
            })
        )
    }
    // other option...
}

module.exports = config
