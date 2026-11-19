import { defineConfig } from '@playwright/test'

const baseURL = 'http://127.0.0.1:4173'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL },
  webServer: {
    command:
      'pnpm build && pnpm preview --host 127.0.0.1 --port 4173 --strictPort',
    url: baseURL,
  },
})
