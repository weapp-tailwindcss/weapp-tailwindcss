import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
import { WeappTailwindcss } from 'weapp-tailwindcss/vite'
import path from 'path'
export default defineConfig({
    plugins: [
        uni(),
        WeappTailwindcss(
            {
                rem2rpx: true,
                tailwindcss: {
                    v4: {
                        base: __dirname,
                        cssEntries: [path.resolve(__dirname, 'main.css')]
                    }
                }
            }
        )
    ],
});
