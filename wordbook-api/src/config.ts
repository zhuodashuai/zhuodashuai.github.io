import { z } from "zod";

const ConfigSchema = z.object({
  ASSETS: z.custom<Fetcher>((value) => Boolean(value && typeof value === "object" && "fetch" in value)).optional(),
  PUBLIC_SITE_URL: z.string().url(),
  GITHUB_OWNER: z.literal("zhuodashuai"),
  GITHUB_OWNER_ID: z.coerce.number().int().refine((value) => value === 156042078, "must match the fixed owner ID"),
  GITHUB_REPOSITORY: z.literal("zhuodashuai.github.io"),
  GITHUB_REPOSITORY_ID: z.coerce.number().int().refine((value) => value === 1309360291, "must match the fixed repository ID"),
  GITHUB_BRANCH: z.literal("main"),
  GITHUB_WORDBOOK_PATH: z.literal("vocab/data/owner-wordbook.json"),
  GITHUB_APP_CLIENT_ID: z.string().min(8).optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().min(16).optional(),
  SESSION_SECRET: z.string().regex(/^[A-Za-z0-9_-]{43,200}$/).optional(),
  AI: z.custom<Ai>((value) => Boolean(value && typeof value === "object" && "run" in value)).optional(),
  AI_PROVIDER: z.enum(["cloudflare", "openai", "anthropic"]),
  AI_FALLBACK_PROVIDER: z.enum(["cloudflare", "openai", "anthropic"]).optional(),
  ALLOW_PAID_AI_FALLBACK: z.literal("true").optional(),
  CLOUDFLARE_AI_MODEL: z.literal("@cf/zai-org/glm-4.7-flash").optional(),
  CLOUDFLARE_AI_RETRY_MODEL: z.literal("@cf/google/gemma-4-26b-a4b-it").optional(),
  OPENAI_API_KEY: z.string().min(20).optional(),
  OPENAI_MODEL: z.string().min(3).optional(),
  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  ANTHROPIC_MODEL: z.string().min(3).optional()
});

export type AppConfig = z.infer<typeof ConfigSchema>;
export type AiProvider = AppConfig["AI_PROVIDER"];

export function aiProviderConfigured(provider: AiProvider | undefined, config: AppConfig): boolean {
  return provider === "cloudflare"
    ? Boolean(config.AI)
    : provider === "openai"
      ? Boolean(config.OPENAI_API_KEY)
      : provider === "anthropic"
        ? Boolean(config.ANTHROPIC_API_KEY && config.ANTHROPIC_MODEL)
        : false;
}

/**
 * Returns only providers that policy permits the organizer to call. Paid
 * fallback providers are fail-closed unless the owner explicitly enables the
 * dedicated escape hatch; Cloudflare fallback is always allowed.
 */
export function aiProviderOrder(config: AppConfig): AiProvider[] {
  const order: AiProvider[] = [config.AI_PROVIDER];
  const fallback = config.AI_FALLBACK_PROVIDER;
  const fallbackIsPaid = fallback === "openai" || fallback === "anthropic";
  if (fallback && fallback !== config.AI_PROVIDER && (!fallbackIsPaid || config.ALLOW_PAID_AI_FALLBACK === "true")) {
    order.push(fallback);
  }
  return order;
}

export function effectiveAiProvider(config: AppConfig): AiProvider | null {
  return aiProviderOrder(config).find((provider) => aiProviderConfigured(provider, config)) || null;
}

export function readConfig(env: Env): AppConfig {
  return ConfigSchema.parse(env);
}

export function requireOwnerSecrets(config: AppConfig): Required<Pick<AppConfig,
  "GITHUB_APP_CLIENT_ID" | "GITHUB_APP_CLIENT_SECRET" | "SESSION_SECRET"
>> {
  if (!config.GITHUB_APP_CLIENT_ID || !config.GITHUB_APP_CLIENT_SECRET || !config.SESSION_SECRET) {
    throw new Error("Owner authentication secrets are not configured");
  }
  return {
    GITHUB_APP_CLIENT_ID: config.GITHUB_APP_CLIENT_ID,
    GITHUB_APP_CLIENT_SECRET: config.GITHUB_APP_CLIENT_SECRET,
    SESSION_SECRET: config.SESSION_SECRET
  };
}

export const OWNER_LOGIN = "zhuodashuai";
export const OWNER_USER_ID = 156042078;
export const OWNER_REPOSITORY_ID = 1309360291;
export const AI_DAILY_REQUEST_LIMIT = 20;
export const SESSION_TTL_SECONDS = 60 * 60;
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const GITHUB_API_VERSION = "2026-03-10";
