import { defineConfig } from "@playwright/test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const toolingDir = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = join(toolingDir, "..");

export default defineConfig({
  testDir: join(toolingDir, "tests/e2e"),
  testMatch: "*.spec.mjs",
  outputDir: join(repositoryRoot, "test-results"),
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: join(repositoryRoot, "playwright-report") }]],
  use: {
    baseURL: "http://127.0.0.1:4187",
    browserName: "chromium",
    // Align CI with the stable Chrome used by local regression tests.
    // Both bundled Chromium r1234 binaries hit native SIGSEGVs in Linux CI;
    // keep every test/assertion and the same zero-retry policy.
    channel: "chrome",
    headless: true,
    serviceWorkers: "allow",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node tooling/tests/e2e/server.mjs",
    cwd: repositoryRoot,
    url: "http://127.0.0.1:4187/",
    reuseExistingServer: false,
    timeout: 15_000
  }
});
