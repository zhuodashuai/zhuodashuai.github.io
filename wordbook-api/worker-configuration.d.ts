interface Env {
  ASSETS: Fetcher;
  OWNER_CONTROL: DurableObjectNamespace<import("./src/owner-control").OwnerControl>;
  PUBLIC_SITE_URL: string;
  GITHUB_OWNER: string;
  GITHUB_OWNER_ID: string;
  GITHUB_REPOSITORY: string;
  GITHUB_REPOSITORY_ID: string;
  GITHUB_BRANCH: string;
  GITHUB_WORDBOOK_PATH: string;
  GITHUB_APP_CLIENT_ID?: string;
  GITHUB_APP_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  AI_PROVIDER: "openai" | "anthropic";
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL?: string;
}
