import { createSSRApp } from 'vue'
import App from './App.vue'
import './main.css'

export function createApp() {
  return { app: createSSRApp(App) }
}
