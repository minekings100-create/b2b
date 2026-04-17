import { defineConfig } from "@playwright/test";

/**
 * SPEC §4 verification scope: load `/design` at 1440 / 768 / 375 in both
 * light and dark themes, assert no console errors.
 */
export default defineConfig({
  testDir: "./tests-e2e",
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop-1440", use: { viewport: { width: 1440, height: 900 } } },
    { name: "tablet-768",   use: { viewport: { width: 768,  height: 1024 } } },
    { name: "mobile-375",   use: { viewport: { width: 375,  height: 812 } } },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 180_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
