import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [cloudflareTest({
    // Keep deterministic tests completely offline. Production uses the real
    // Workers AI binding; unit tests inject a fake `AI.run` object directly.
    wrangler: { configPath: "./wrangler.test.jsonc" },
    miniflare: {
      bindings: {
        GITHUB_APP_CLIENT_ID: "Iv1.test-client-id",
        GITHUB_APP_CLIENT_SECRET: "test-client-secret-at-least-32-characters",
        SESSION_SECRET: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
        OPENAI_API_KEY: "sk-test-openai-key-not-real-000000000000"
      }
    }
  })],
  test: {
    include: ["test/**/*.test.ts"],
    sequence: { concurrent: false },
    testTimeout: 15_000
  }
});
