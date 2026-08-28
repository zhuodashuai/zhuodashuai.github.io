import { z } from "zod";

const ConfigSchema = z.object({
  PUBLIC_SITE_URL: z.string().url(),
  GITHUB_OWNER: z.literal("zhuodashuai"),
  GITHUB_OWNER_ID: z.coerce.number().int().positive(),
  GITHUB_REPOSITORY: z.literal("zhuodashuai.github.io"),
  GITHUB_REPOSITORY_ID: z.coerce.number().int().positive(),
  GITHUB_BRANCH: z.literal("main"),
  GITHUB_WORDBOOK_PATH: z.literal("vocab/data/owner-wordbook.json"),
  GITHUB_APP_CLIENT_ID: z.string().min(8).optional(),
  GITHUB_APP_CLIENT_SECRET: z.string().min(16).optional(),
  SESSION_SECRET: z.string().regex(/^[A-Za-z0-9_-]{43,200}$/).optional(),
  AI_PROVIDER: z.enum(["openai", "anthropic"]),
  OPENAI_API_KEY: z.string().min(20).optional(),
  OPENAI_MODEL: z.string().min(3).optional(),
  ANTHROPIC_API_KEY: z.string().min(20).optional(),
  ANTHROPIC_MODEL: z.string().min(3).optional()
});

export type AppConfig = z.infer<typeof ConfigSchema>;

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
export const SESSION_TTL_SECONDS = 60 * 60;
export const OAUTH_STATE_TTL_SECONDS = 10 * 60;
export const GITHUB_API_VERSION = "2026-03-10";
