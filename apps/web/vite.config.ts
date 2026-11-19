import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { pwaOptions } from './src/pwa/config.ts'

export default defineConfig({
  plugins: [react(), VitePWA(pwaOptions)],
})
