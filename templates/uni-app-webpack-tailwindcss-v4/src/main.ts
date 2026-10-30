import Vue from 'vue'
import App from './App.vue'
import './uni.promisify.adaptor'
// #ifndef APP-PLUS
import './main.css'
// #endif

Vue.config.productionTip = false

const app = new (typeof App === 'function' ? App : Vue.extend(Object.assign({ mpType: 'app' }, App)))
app.$mount();
