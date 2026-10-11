import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'vitest'
import { shouldSkipJsTransform } from '@/js/precheck'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function readFixture(...segments: string[]) {
  return fs.readFileSync(path.resolve(__dirname, 'fixtures', ...segments), 'utf8')
}

const jsLarge = readFixture('js', 'taro-lottie-miniprogram-build.js')
const jsMedium = readFixture('js', 'taro-vue3-test-build-dist.js')

/** 不含任何类名模式或依赖语句的纯逻辑代码 */
const jsNoClassPatterns = `
var counter = 0;
function add(a, b) { return a + b; }
function multiply(a, b) { return a * b; }
var result = add(1, 2) + multiply(3, 4);
var arr = [1, 2, 3, 4, 5];
for (var i = 0; i < arr.length; i++) { counter += arr[i]; }
var obj = { x: 10, y: 20, z: 30 };
var keys = Object.keys(obj);
var values = Object.values(obj);
var sum = values.reduce(function(a, b) { return a + b; }, 0);
console.log(sum);
`

/** 含类名模式的典型小程序 JS */
const jsWithClassNames = `
var app = getApp();
Page({
  data: {
    className: 'flex items-center justify-between p-4',
    isActive: false,
  },
  onLoad: function() {
    this.setData({
      className: 'bg-[#f5f5f5] text-[14px] rounded-lg',
    });
  },
  toggleActive: function() {
    var cls = this.data.isActive ? 'bg-white' : 'bg-[#333]';
    this.setData({ className: cls, isActive: !this.data.isActive });
  },
});
`

/** 含 import 语句的模块代码 */
const jsWithImports = `
import { ref, computed } from 'vue';
import { useStore } from './store';
var count = ref(0);
var doubled = computed(function() { return count.value * 2; });
function increment() { count.value++; }
`

test('JS precheck benchmark - shouldSkipJsTransform 开销', async ({ bench }) => {
  await bench.compare(
    bench('precheck: 大文件 (211KB, 含 className)', () => {
      shouldSkipJsTransform(jsLarge)
    }),
    bench('precheck: 中等文件 (537B, 含 import)', () => {
      shouldSkipJsTransform(jsMedium)
    }),
    bench('precheck: 无类名模式 (可跳过)', () => {
      shouldSkipJsTransform(jsNoClassPatterns)
    }),
    bench('precheck: 含类名模式 (不可跳过)', () => {
      shouldSkipJsTransform(jsWithClassNames)
    }),
    bench('precheck: 含 import 语句 (不可跳过)', () => {
      shouldSkipJsTransform(jsWithImports)
    }),
  )
})
