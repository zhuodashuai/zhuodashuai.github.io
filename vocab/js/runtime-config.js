// Set this to the deployed Cloudflare Worker origin after the one-time backend setup.
// It is a public URL, never a secret. Leave empty until the exact workers.dev URL is known.
export const OWNER_ADMIN_URL = "https://zhuo-wordbook-api.zhuo-wordbook-api.workers.dev/";

// Passwords and private cookies stay on the fixed authentication origin.
// Only the local development/test loopback origin is allowed as an exception.
export function personalWordbookUrl(targetLocation = globalThis.location) {
  const current = new URL(targetLocation?.href || OWNER_ADMIN_URL);
  if (["localhost", "127.0.0.1", "[::1]"].includes(current.hostname)) {
    return new URL("/personal.html", current.origin).href;
  }
  return new URL("personal.html", OWNER_ADMIN_URL).href;
}

export function ownerAdminUrl(targetLocation = globalThis.location) {
  const hostname = targetLocation?.hostname || "";
  if (hostname && hostname !== "zhuodashuai.github.io") {
    return new URL("owner.html", targetLocation.href).href;
  }
  return OWNER_ADMIN_URL ? new URL("owner.html", OWNER_ADMIN_URL).href : "";
}

export function publicSnapshotUrl(targetLocation = globalThis.location) {
  const current = new URL(targetLocation?.href || "http://localhost/");
  if (current.hostname === "zhuodashuai.github.io" && OWNER_ADMIN_URL) {
    return new URL("api/v1/public/wordbook", OWNER_ADMIN_URL).href;
  }
  return new URL("/api/v1/public/wordbook", current.origin).href;
}
