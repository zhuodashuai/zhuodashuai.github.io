import { describe, expect, it } from "vitest";
import {
  aiProviderOrder,
  effectiveAiProvider,
  type AppConfig
} from "../src/config";

const base: AppConfig = {
  PUBLIC_SITE_URL: "https://zhuodashuai.github.io/vocab/",
  GITHUB_OWNER: "zhuodashuai",
  GITHUB_OWNER_ID: 156042078,
  GITHUB_REPOSITORY: "zhuodashuai.github.io",
  GITHUB_REPOSITORY_ID: 1309360291,
  GITHUB_BRANCH: "main",
  GITHUB_WORDBOOK_PATH: "vocab/data/owner-wordbook.json",
  AI_PROVIDER: "cloudflare"
};

const aiBinding = { run: async () => ({}) } as unknown as Ai;

describe("AI provider policy resolution", () => {
  it("fails closed when only a paid fallback is configured but not explicitly allowed", () => {
    const config: AppConfig = {
      ...base,
      AI_FALLBACK_PROVIDER: "openai",
      OPENAI_API_KEY: "sk-test-openai-key-not-real-000000"
    };
    expect(aiProviderOrder(config)).toEqual(["cloudflare"]);
    expect(effectiveAiProvider(config)).toBeNull();
  });

  it("uses a paid fallback only behind the explicit escape hatch", () => {
    const config: AppConfig = {
      ...base,
      AI_FALLBACK_PROVIDER: "openai",
      ALLOW_PAID_AI_FALLBACK: "true",
      OPENAI_API_KEY: "sk-test-openai-key-not-real-000000"
    };
    expect(aiProviderOrder(config)).toEqual(["cloudflare", "openai"]);
    expect(effectiveAiProvider(config)).toBe("openai");
  });

  it("uses a configured Cloudflare fallback without opening paid-provider access", () => {
    const config: AppConfig = {
      ...base,
      AI_PROVIDER: "openai",
      AI_FALLBACK_PROVIDER: "cloudflare",
      AI: aiBinding
    };
    expect(aiProviderOrder(config)).toEqual(["openai", "cloudflare"]);
    expect(effectiveAiProvider(config)).toBe("cloudflare");
  });

  it("keeps the configured primary when it is available", () => {
    const config: AppConfig = {
      ...base,
      AI: aiBinding,
      AI_FALLBACK_PROVIDER: "openai",
      ALLOW_PAID_AI_FALLBACK: "true",
      OPENAI_API_KEY: "sk-test-openai-key-not-real-000000"
    };
    expect(effectiveAiProvider(config)).toBe("cloudflare");
  });
});
