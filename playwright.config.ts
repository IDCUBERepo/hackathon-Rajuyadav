import { defineConfig, devices } from '@playwright/test';

/**
 * Every run is against the production build (`vite build` + `vite preview`).
 * A second preview serves the same build from a sub-folder (/tambola/) to
 * check relative paths and QR join links there.
 *
 * `npm run e2e` runs Chromium; `npm run e2e:all` runs every project below.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  use: { baseURL: 'http://localhost:4173' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'iphone13', use: { ...devices['iPhone 13'] } },
    { name: 'pixel7', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'npm run build && npx vite preview --port 4173 --strictPort',
      url: 'http://localhost:4173',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      // Started after the build above; serves dist/ at /tambola/.
      command: 'npx vite preview --port 4174 --strictPort --base /tambola/',
      url: 'http://localhost:4174/tambola/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
