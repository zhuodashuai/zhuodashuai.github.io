import { afterEach, describe, expect, it, vi } from "vitest";
import {
  aiProviderOrder,
  effectiveAiProvider,
  readConfig,
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

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("AI provider policy resolution", () => {
  it.each(["AI_PROVIDER", "AI_FALLBACK_PROVIDER"])("rejects the retired provider in %s before any network call", (field) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect(() => readConfig({
      ...base,
      [field]: "anthropic",
      ALLOW_PAID_AI_FALLBACK: "true",
      ANTHROPIC_API_KEY: "test-retired-key-not-real-000000000",
      ANTHROPIC_MODEL: "retired-test-model"
    } as unknown as Env)).toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not retain retired credentials or enable an extra provider", () => {
    const config = readConfig({
      ...base,
      AI: aiBinding,
      ANTHROPIC_API_KEY: "test-retired-key-not-real-000000000",
      ANTHROPIC_MODEL: "retired-test-model"
    } as unknown as Env);
    expect(config).not.toHaveProperty("ANTHROPIC_API_KEY");
    expect(config).not.toHaveProperty("ANTHROPIC_MODEL");
    expect(aiProviderOrder(config)).toEqual(["cloudflare"]);
    expect(effectiveAiProvider(config)).toBe("cloudflare");
  });

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
