import { defineConfig, devices } from "@playwright/test";

/** Visual regression for key expressions (deterministic: ?seed=1&freeze). */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.02 } },
  use: { baseURL: "http://localhost:3123", viewport: { width: 1280, height: 800 }, launchOptions: { args: ["--use-gl=angle", "--use-angle=swiftshader"] } },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: { command: "npm run dev -- -p 3123", url: "http://localhost:3123", reuseExistingServer: true, timeout: 120_000 },
});
