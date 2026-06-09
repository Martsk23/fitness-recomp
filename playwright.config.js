import { defineConfig, devices } from '@playwright/test'

// Smoke E2E sur l'app BUILDÉE (vite preview) : monte le vrai React dans un vrai
// IndexedDB. Complémentaire de tests/migration.test.mjs (node, sans DOM) — c'est
// l'absence de ce niveau qui avait laissé passer le bug settings.get(1).
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    headless: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 120000,
  },
})
