import type { VitePWAOptions } from 'vite-plugin-pwa'

export const pwaOptions = {
  manifest: {
    id: './',
    name: 'Ks Finance',
    short_name: 'Ks Finance',
    lang: 'zh-CN',
    start_url: './',
    display: 'standalone',
    background_color: '#f5e6d3',
    theme_color: '#8b4513',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{html,js,css,png,webmanifest}'],
    navigateFallback: 'index.html',
  },
} satisfies Partial<VitePWAOptions>
